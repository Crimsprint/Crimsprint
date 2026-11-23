-- Database first. Legacy league, profile, scoring, and opt-out RPC signatures stay intact.
begin;

create table public.league_crown_rules (
  singleton boolean primary key default true check (singleton),
  min_active_members int not null check (min_active_members > 0),
  min_winner_points int not null check (min_winner_points > 0),
  first_week date not null
);
insert into public.league_crown_rules (min_active_members, min_winner_points, first_week)
values (3, 50, public.week_start(now()) + 7);
alter table public.league_crown_rules enable row level security;
revoke all on public.league_crown_rules from public, anon, authenticated;

-- The running UTC total already tracks each scoring write. Save the time of the most recent change.
alter table public.league_points add column score_reached_at timestamptz;

create function public.stamp_league_score() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.points is distinct from old.points then
    new.score_reached_at := clock_timestamp();
  end if;
  return new;
end $$;

create trigger stamp_league_score before insert or update of points on public.league_points
for each row execute function public.stamp_league_score();

-- Use opt-out state at the deadline so leaving or rejoining later doesn't transfer a crown.
create table public.league_visibility_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  changed_at timestamptz not null default clock_timestamp(),
  opted_out boolean not null
);
create index league_visibility_by_user on public.league_visibility_changes (user_id, changed_at desc, id desc);
alter table public.league_visibility_changes enable row level security;
revoke all on public.league_visibility_changes from public, anon, authenticated;
revoke all on sequence public.league_visibility_changes_id_seq from public, anon, authenticated;

-- Install the trigger under the same write lock used for the baseline so an opt-out can't slip between them.
create function public.track_league_visibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.league_visibility_changes (user_id, opted_out) values (new.id, new.leagues_opt_out);
  return new;
end $$;

create trigger track_league_visibility after update of leagues_opt_out on public.profiles
for each row when (old.leagues_opt_out is distinct from new.leagues_opt_out)
execute function public.track_league_visibility();

insert into public.league_visibility_changes (user_id, opted_out)
select id, true from public.profiles where leagues_opt_out;

create index league_members_by_cohort on public.league_members (week, tier, cohort);

create function public.league_crown_winner(p_week date, p_tier int, p_cohort int) returns uuid
language sql stable set search_path = '' as $$
  select ranked.user_id
  from (
    select member.user_id, score.points, score.score_reached_at, count(*) over () as active_members
    from public.league_members member
    join public.league_points score on score.user_id = member.user_id and score.week = member.week and score.points > 0
    join auth.users account on account.id = member.user_id and not account.is_anonymous
    where member.week = p_week and member.tier = p_tier and member.cohort = p_cohort
      and not coalesce((
        select change.opted_out from public.league_visibility_changes change
        where change.user_id = member.user_id
          and change.changed_at < ((p_week + 7)::timestamp at time zone 'UTC')
        order by change.changed_at desc, change.id desc limit 1
      ), false)
  ) ranked
  cross join public.league_crown_rules rules
  where p_week >= rules.first_week
    and ranked.active_members >= rules.min_active_members and ranked.points >= rules.min_winner_points
  order by ranked.points desc, ranked.score_reached_at asc nulls last, ranked.user_id
  limit 1
$$;

create function public.league_crown_expiry(p_user uuid, p_week date) returns timestamptz
language sql stable set search_path = '' as $$
  select ((p_week + 7)::timestamp at time zone 'UTC')
  where exists (
    select 1 from public.league_members member
    join public.profiles p on p.id = member.user_id and not p.leagues_opt_out
    where member.user_id = p_user and member.week = p_week - 7
      and public.league_crown_winner(member.week, member.tier, member.cohort) = p_user
  )
$$;

create function public.league_crowns_won(p_user uuid, p_week date) returns int
language sql stable set search_path = '' as $$
  select count(*)::int
  from public.league_members member
  join public.league_points score on score.user_id = member.user_id and score.week = member.week
  cross join public.league_crown_rules rules
  where member.user_id = p_user and member.week < p_week and member.week >= rules.first_week
    and score.points >= rules.min_winner_points
    and public.league_crown_winner(member.week, member.tier, member.cohort) = p_user
$$;

create function public.get_profile_v2() returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.get_profile() || jsonb_build_object(
    'crown_expires_at', public.league_crown_expiry(auth.uid(), public.week_start(now())),
    'crowns_won', public.league_crowns_won(auth.uid(), public.week_start(now()))
  )
$$;

-- Narrow owner-only read for avatar surfaces that don't need the profile or crown history.
create function public.get_my_avatar() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('exam_target', p.exam_target, 'avatar', p.avatar,
    'accessory', p.accessory, 'outfit', p.outfit,
    'crown_expires_at', public.league_crown_expiry(p.id, public.week_start(now())))
  from public.profiles p
  where p.id = auth.uid()
$$;

-- Only appearance keys are shared with other learners, including the retired 0012 keys.
create function public.league_public_outfit(p_outfit jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_object_agg(part.key, part.value)
  from jsonb_each(case when jsonb_typeof(p_outfit) = 'object' then p_outfit else '{}'::jsonb end) part
  where part.key in ('background', 'effect', 'fur', 'bottoms', 'shoes', 'top', 'outerwear', 'face',
    'furStyle', 'headwear', 'eyewear', 'accessory', 'skin', 'hair', 'hairColor')
    and jsonb_typeof(part.value) = 'string'
$$;

create function public.get_league_v3() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lm public.league_members;
  previous_champion jsonb;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid and not is_anonymous) then
    raise exception 'not signed in';
  end if;
  if (select leagues_opt_out from public.profiles where id = uid) then
    return jsonb_build_object('opted_out', true);
  end if;
  lm := public.join_league(uid);

  -- Show the viewer's previous cohort winner even if promotion has moved them elsewhere.
  select jsonb_build_object('profile_key', p.handle, 'name', coalesce(p.display_name, 'Learner'),
    'crown_expires_at', ((lm.week + 7)::timestamp at time zone 'UTC'))
  into previous_champion
  from public.league_members previous
  join public.profiles p on p.id = public.league_crown_winner(previous.week, previous.tier, previous.cohort)
    and not p.leagues_opt_out
  where previous.user_id = uid and previous.week = lm.week - 7;

  return jsonb_build_object(
    'opted_out', false,
    'tier', lm.tier,
    'tier_name', (array['Pencil', 'Notebook', 'Compass', 'Protractor', 'Summit'])[lm.tier],
    'week_end', lm.week + 7,
    'promote', case when lm.tier < 5 then 7 else 0 end,
    'demote', case when lm.tier > 1 then 5 else 0 end,
    'previous_champion', previous_champion,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profile_key', p.handle, 'name', coalesce(p.display_name, 'Learner'),
        'avatar', p.avatar, 'accessory', p.accessory, 'outfit', public.league_public_outfit(p.outfit), 'exam_target', p.exam_target,
        'points', coalesce(score.points, 0), 'me', p.id = uid,
        'crown_expires_at', public.league_crown_expiry(p.id, lm.week))
        order by coalesce(score.points, 0) desc, score.score_reached_at asc nulls last, p.id)
      from public.league_members member
      join public.profiles p on p.id = member.user_id and not p.leagues_opt_out
      join auth.users account on account.id = member.user_id and not account.is_anonymous
      left join public.league_points score on score.user_id = member.user_id and score.week = lm.week
      where member.week = lm.week and member.tier = lm.tier and member.cohort = lm.cohort
    ), '[]'::jsonb)
  );
end $$;

-- The row key is the existing pseudonymous handle. The response deliberately omits the handle and account ID.
create function public.get_public_league_profile(p_profile_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with current_week as (select public.week_start(now()) as week)
  select jsonb_build_object(
    'display_name', coalesce(p.display_name, 'Learner'),
    'avatar', jsonb_build_object('avatar', p.avatar, 'accessory', p.accessory, 'outfit', public.league_public_outfit(p.outfit)),
    'crown_expires_at', public.league_crown_expiry(p.id, current_week.week),
    'league_tier', (array['Pencil', 'Notebook', 'Compass', 'Protractor', 'Summit'])[p.league_tier],
    'streak', p.streak,
    'crowns_won', public.league_crowns_won(p.id, current_week.week),
    'achievements', coalesce((select jsonb_agg(a.code order by a.code)
      from public.achievements a where a.user_id = p.id), '[]'::jsonb)
  )
  from public.profiles p
  join auth.users subject on subject.id = p.id and not subject.is_anonymous
  join auth.users viewer on viewer.id = auth.uid() and not viewer.is_anonymous
  join public.profiles own on own.id = viewer.id and not own.leagues_opt_out
  cross join current_week
  where p.handle = p_profile_key and not p.leagues_opt_out and (
    exists (
      select 1 from public.league_members mine
      join public.league_members theirs on theirs.week = mine.week and theirs.tier = mine.tier and theirs.cohort = mine.cohort
      where mine.user_id = viewer.id and mine.week = current_week.week and theirs.user_id = p.id
    ) or exists (
      select 1 from public.league_members mine
      where mine.user_id = viewer.id and mine.week = current_week.week - 7
        and public.league_crown_winner(mine.week, mine.tier, mine.cohort) = p.id
    )
  )
$$;

revoke execute on function public.stamp_league_score(), public.track_league_visibility(),
  public.league_crown_winner(date, int, int), public.league_crown_expiry(uuid, date), public.league_crowns_won(uuid, date),
  public.league_public_outfit(jsonb),
  public.get_profile_v2(), public.get_my_avatar(), public.get_league_v3(), public.get_public_league_profile(text)
  from public, anon, authenticated;
grant execute on function public.get_profile_v2(), public.get_my_avatar(), public.get_league_v3(),
  public.get_public_league_profile(text) to authenticated;

commit;
