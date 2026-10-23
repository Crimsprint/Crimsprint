-- Learning path (Section 2): each SAT domain is a unit. A unit's path is
--   easy lessons → unit practice → medium lessons → chest → hard lessons → unit test,
-- one lesson per skill per tier. R&W and Math are separate tracks; within a track, passing a unit's test unlocks the next unit.
-- Lessons keep using level_progress; unit_progress records the other node types.

alter table public.profiles add column coins int not null default 0 check (coins >= 0);

create table public.unit_progress (
  user_id uuid not null references public.profiles on delete cascade,
  domain_id text not null,
  practice_done boolean not null default false,
  chest_claimed boolean not null default false,
  test_passed boolean not null default false,
  primary key (user_id, domain_id)
);
alter table public.unit_progress enable row level security;
create policy own_read on public.unit_progress for select to authenticated using (user_id = auth.uid());

alter table public.sessions add column domain_id text;
alter table public.sessions drop constraint sessions_mode_check;
alter table public.sessions add constraint sessions_mode_check
  check (mode in ('lesson', 'diagnostic', 'review', 'testout', 'weak', 'unit_practice', 'unit_test'));

-- The unit before p_domain in its track, or null for a track's first unit.
create function public.prev_unit(p_domain text) returns text
language sql stable security definer set search_path = public as $$
  select k.domain_id from public.skills k
  where k.section = (select section from public.skills where domain_id = p_domain limit 1)
  group by k.domain_id
  having min(k.sort) < (select min(sort) from public.skills where domain_id = p_domain)
  order by min(k.sort) desc limit 1
$$;

drop function public.start_session(text, text, text);
create function public.start_session(p_mode text, p_skill text default null, p_tier text default null, p_domain text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  q uuid[] := '{}';
  budget int;
  sid uuid;
  today date;
  th float8;
  prev text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  today := public.local_day(uid);

  if p_mode in ('unit_practice', 'unit_test') then
    if not exists (select 1 from public.skills where domain_id = p_domain) then raise exception 'unknown unit'; end if;
    prev := public.prev_unit(p_domain);
    if prev is not null and not exists (
      select 1 from public.unit_progress where user_id = uid and domain_id = prev and test_passed
    ) then raise exception 'unit locked'; end if;
  end if;

  if p_mode = 'lesson' then
    if p_tier not in ('easy', 'medium', 'hard') then raise exception 'bad tier'; end if;
    if p_tier <> 'easy' and not exists (
      select 1 from public.level_progress where user_id = uid and skill_id = p_skill
        and tier = case p_tier when 'medium' then 'easy' else 'medium' end
    ) then raise exception 'level locked'; end if;
    -- Up to 2 due review items from this skill, then fresh items (unseen for 14 days first), 8 total.
    select coalesce(array_agg(item_id), '{}') into q from (
      select r.item_id from public.review_items r join public.items i on i.id = r.item_id
      where r.user_id = uid and i.skill_id = p_skill and r.due <= today and i.status = 'published'
      order by r.due limit 2) t;
    select q || coalesce(array_agg(id), '{}') into q from (
      select i.id from public.items i
      where i.skill_id = p_skill and i.tier = p_tier and i.status = 'published' and i.id <> all (q)
      order by exists (select 1 from public.responses x where x.user_id = uid and x.item_id = i.id
                       and x.created_at > now() - interval '14 days'), random()
      limit 8 - cardinality(q)) t;
    budget := 5;
  elsif p_mode = 'unit_practice' then
    -- 8 easy/medium items across the unit's skills, unseen-for-14-days first. No mistake budget: it is review.
    select coalesce(array_agg(id), '{}') into q from (
      select i.id from public.items i join public.skills k on k.id = i.skill_id
      where k.domain_id = p_domain and i.tier in ('easy', 'medium') and i.status = 'published'
      order by exists (select 1 from public.responses x where x.user_id = uid and x.item_id = i.id
                       and x.created_at > now() - interval '14 days'), random()
      limit 8) t;
  elsif p_mode = 'unit_test' then
    -- 10 medium/hard items, dealt round-robin across the unit's skills.
    select coalesce(array_agg(id), '{}') into q from (
      select id from (
        select i.id, row_number() over (partition by i.skill_id order by random()) rn
        from public.items i join public.skills k on k.id = i.skill_id
        where k.domain_id = p_domain and i.tier in ('medium', 'hard') and i.status = 'published') t
      order by rn, random() limit 10) t;
  elsif p_mode = 'testout' then
    select coalesce(array_agg(id), '{}') into q from (
      (select id from public.items where skill_id = p_skill and tier = 'easy' and status = 'published' order by random() limit 3)
      union all
      (select id from public.items where skill_id = p_skill and tier = 'medium' and status = 'published' order by random() limit 3)
      union all
      (select id from public.items where skill_id = p_skill and tier = 'hard' and status = 'published' order by random() limit 2)) t;
  elsif p_mode = 'review' then
    select coalesce(array_agg(item_id), '{}') into q from (
      select item_id from public.review_items where user_id = uid and due <= today order by due, box limit 10) t;
  elsif p_mode = 'weak' then
    -- Two lowest-mastery skills that have items; tier follows ability.
    select coalesce(array_agg(id), '{}') into q from (
      select i.id from (
        select s.id as skill_id, coalesce(m.theta, 0) as theta from public.skills s
        left join public.mastery m on m.skill_id = s.id and m.user_id = uid
        where exists (select 1 from public.items i where i.skill_id = s.id and i.status = 'published')
        order by coalesce(m.theta, 0), s.domain_share desc limit 2) w
      cross join lateral (
        select id from public.items i where i.skill_id = w.skill_id and i.status = 'published'
        order by abs(i.b - w.theta), random() limit 4) i) t;
    budget := 5;
  elsif p_mode <> 'diagnostic' then
    raise exception 'bad mode %', p_mode;
  end if;

  if p_mode <> 'diagnostic' and cardinality(q) = 0 then raise exception 'no items available'; end if;
  select theta into th from public.mastery where user_id = uid and skill_id = p_skill;

  insert into public.sessions (user_id, mode, skill_id, tier, domain_id, queue, mistakes_left, theta_before)
  values (uid, p_mode, p_skill, p_tier, case when p_mode like 'unit_%' then p_domain end, q, budget, coalesce(th, 0))
  returning id into sid;
  return sid;
end $$;

-- Diagnostic placement: a domain estimate of 60%+ skips the easy round (and the unit practice), 75%+ also skips the
-- medium round, landing the learner on that unit's chest. Three right answers in a domain estimate about 79%.
create function public.place_from_diagnostic(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  for d in
    select k.domain_id, public.p_correct(avg(coalesce(m.theta, 0)), 0) p from public.skills k
    left join public.mastery m on m.skill_id = k.id and m.user_id = p_user group by k.domain_id
  loop
    if d.p >= 0.6 then
      insert into public.unit_progress (user_id, domain_id, practice_done) values (p_user, d.domain_id, true)
      on conflict (user_id, domain_id) do update set practice_done = true;
      insert into public.level_progress (user_id, skill_id, tier)
      select p_user, k.id, t from public.skills k cross join unnest(case when d.p >= 0.75 then array['easy', 'medium'] else array['easy'] end) t
      where k.domain_id = d.domain_id on conflict do nothing;
    end if;
  end loop;
end $$;

create or replace function public.complete_session(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sessions := public.own_session(p_session);
  uid uuid := s.user_id;
  firsts int; correct int; total_ms int;
  passed boolean := false;
  today date := public.local_day(uid);
  sm jsonb;
begin
  if s.summary is not null then return s.summary; end if;
  if s.status = 'active' and s.pos < cardinality(s.queue) then raise exception 'session not finished'; end if;
  if s.status = 'active' and s.mode = 'diagnostic' and public.diag_pick(s) is not null then
    raise exception 'session not finished';
  end if;

  select count(*) filter (where not is_reask), count(*) filter (where not is_reask and responses.correct),
         coalesce(sum(ms), 0)
  into firsts, correct, total_ms from public.responses where session_id = s.id;

  if s.status = 'active' then
    update public.sessions set status = 'completed', completed_at = now(), points = points + 3 where id = s.id
    returning * into s;
    insert into public.daily_points values (uid, today, 3)
    on conflict (user_id, day) do update set points = daily_points.points + 3;
    if s.mode = 'lesson' and firsts > 0 and correct >= ceil(0.75 * firsts) then  -- 6 of 8
      passed := true;
      insert into public.level_progress (user_id, skill_id, tier) values (uid, s.skill_id, s.tier) on conflict do nothing;
    elsif s.mode = 'testout' and firsts > 0 and correct >= ceil(0.875 * firsts) then  -- 7 of 8
      passed := true;
      insert into public.level_progress (user_id, skill_id, tier)
      select uid, s.skill_id, t from unnest(array['easy', 'medium', 'hard']) t on conflict do nothing;
    elsif s.mode = 'unit_practice' then
      insert into public.unit_progress (user_id, domain_id, practice_done) values (uid, s.domain_id, true)
      on conflict (user_id, domain_id) do update set practice_done = true;
    elsif s.mode = 'unit_test' and firsts > 0 and correct >= ceil(0.8 * firsts) then  -- 8 of 10
      -- Passing completes the whole unit (it doubles as "test out") and unlocks the next one.
      passed := true;
      insert into public.unit_progress (user_id, domain_id, practice_done, test_passed) values (uid, s.domain_id, true, true)
      on conflict (user_id, domain_id) do update set practice_done = true, test_passed = true;
      insert into public.level_progress (user_id, skill_id, tier)
      select uid, k.id, t from public.skills k cross join unnest(array['easy', 'medium', 'hard']) t
      where k.domain_id = s.domain_id on conflict do nothing;
    elsif s.mode = 'diagnostic' then
      perform public.place_from_diagnostic(uid);
    end if;
    perform public.apply_streak(uid, now());
  end if;

  sm := jsonb_build_object(
    'mode', s.mode, 'status', s.status, 'passed', passed,
    'points', s.points, 'correct', correct, 'total', firsts, 'ms', total_ms,
    'skill', (select name from public.skills where id = s.skill_id),
    'unit', (select domain_name from public.skills where domain_id = s.domain_id limit 1),
    'mastery_before', public.p_correct(s.theta_before, 0),
    'mastery_after', (select public.p_correct(theta, 0) from public.mastery where user_id = uid and skill_id = s.skill_id),
    'missed', firsts - correct,
    'streak', (select streak from public.profiles where id = uid),
    'today_points', (select points from public.daily_points where user_id = uid and day = today),
    'daily_goal', (select daily_goal from public.profiles where id = uid),
    'domains', case when s.mode = 'diagnostic' then (
      select jsonb_agg(jsonb_build_object('domain', d.domain_name, 'mastery', public.p_correct(d.theta, 0)) order by d.m)
      from (select k.domain_name, min(k.sort) m, avg(coalesce(ma.theta, 0)) theta from public.skills k
            left join public.mastery ma on ma.skill_id = k.id and ma.user_id = uid group by k.domain_name) d) end
  );
  update public.sessions set summary = sm where id = s.id;
  return sm;
end $$;

-- A unit's chest opens once every easy and medium lesson in the unit is passed and its practice is done.
create function public.claim_chest(p_domain text) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  reward constant int := 20;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.unit_progress where user_id = uid and domain_id = p_domain
                 and practice_done and not chest_claimed and not test_passed) then
    raise exception 'chest not available';
  end if;
  if exists (
    select 1 from public.skills k cross join unnest(array['easy', 'medium']) t
    where k.domain_id = p_domain
      and exists (select 1 from public.items i where i.skill_id = k.id and i.tier = t and i.status = 'published')
      and not exists (select 1 from public.level_progress l where l.user_id = uid and l.skill_id = k.id and l.tier = t)
  ) then raise exception 'chest not available'; end if;
  update public.unit_progress set chest_claimed = true where user_id = uid and domain_id = p_domain;
  update public.profiles set coins = coins + reward where id = uid;
  return reward;
end $$;

create or replace function public.get_home() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
  today date;
begin
  select * into p from public.profiles where id = uid;
  if not found then raise exception 'not signed in'; end if;
  today := public.local_day(uid);
  return jsonb_build_object(
    'profile', jsonb_build_object('onboarded', p.onboarded, 'daily_goal', p.daily_goal,
      'target_score', p.target_score, 'test_date', p.test_date, 'freezes', p.freezes, 'coins', p.coins,
      'streak', case when p.last_active >= today - 1 then p.streak
                     when p.last_active = today - 2 and p.freezes > 0 then p.streak else 0 end,
      'done_today', p.last_active = today),
    'today_points', coalesce((select points from public.daily_points where user_id = uid and day = today), 0),
    'due_reviews', (select count(*) from public.review_items where user_id = uid and due <= today),
    'diagnosed', exists (select 1 from public.sessions where user_id = uid and mode = 'diagnostic' and status = 'completed'),
    'skills', (select jsonb_agg(jsonb_build_object(
        'id', k.id, 'name', k.name, 'section', k.section, 'domain_id', k.domain_id, 'domain', k.domain_name, 'share', k.domain_share,
        'mastery', public.p_correct(coalesce(m.theta, 0), 0), 'answered', coalesce(m.n, 0),
        'passed', coalesce((select jsonb_agg(tier) from public.level_progress l where l.user_id = uid and l.skill_id = k.id), '[]'),
        'counts', coalesce((select jsonb_object_agg(tier, c) from (select tier, count(*) c from public.items i
                  where i.skill_id = k.id and i.status = 'published' group by tier) t), '{}')
      ) order by k.sort)
      from public.skills k left join public.mastery m on m.skill_id = k.id and m.user_id = uid),
    'units', coalesce((select jsonb_object_agg(domain_id, jsonb_build_object(
        'practice_done', practice_done, 'chest_claimed', chest_claimed, 'test_passed', test_passed))
      from public.unit_progress where user_id = uid), '{}')
  );
end $$;

-- See 0001: re-grant only the RPCs, since this revoke also covers earlier functions.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.save_onboarding, public.start_session, public.next_item,
  public.submit_answer, public.complete_session, public.get_home, public.claim_chest to authenticated;
grant execute on function public.get_quests, public.get_league, public.set_leagues_opt_out,
  public.start_mock, public.mock_state, public.mock_answer, public.mock_flag, public.mock_submit, public.mock_resume, public.mock_review,
  public.get_progress, public.report_item,
  public.admin_items, public.admin_save_item, public.admin_reports, public.admin_resolve_report to authenticated;
