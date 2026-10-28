-- Fixes from the October 2026 security audit. Every function keeps its signature, so the grants from 0007 carry over;
-- only update_settings is new.

-- ───────────── onboarding runs once; settings has its own RPC ─────────────

-- Onboarding sets the timezone, so it can no longer be re-run to move "today" (streak days, quest periods), and answers
-- left in a shared browser can't overwrite another learner's goals.
create or replace function public.save_onboarding(
  p_goal text, p_test_date date, p_current int, p_target int, p_daily_goal int, p_timezone text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select onboarded from public.profiles where id = auth.uid()) then raise exception 'already onboarded'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'unknown timezone %', p_timezone;
  end if;
  update public.profiles set goal = p_goal, test_date = p_test_date, current_score = p_current,
    target_score = p_target, daily_goal = p_daily_goal, timezone = p_timezone, onboarded = true
  where id = auth.uid();
end $$;

-- The settings page: everything onboarding asked except the timezone.
create function public.update_settings(p_goal text, p_test_date date, p_current int, p_target int, p_daily_goal int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.profiles set goal = p_goal, test_date = p_test_date, current_score = p_current,
    target_score = p_target, daily_goal = p_daily_goal
  where id = auth.uid() and onboarded;
  if not found then raise exception 'finish onboarding first'; end if;
end $$;
revoke execute on function public.update_settings from public, anon;
grant execute on function public.update_settings to authenticated;

-- ───────────── league points by UTC week ─────────────

-- daily_points are keyed by the learner's local day, which can fall in the previous UTC week; league points are now
-- counted in the UTC week they were earned. Not readable by clients (RLS on, no policy).
create table public.league_points (
  user_id uuid not null references public.profiles on delete cascade,
  week date not null,
  points int not null default 0,
  primary key (user_id, week)
);
alter table public.league_points enable row level security;
insert into public.league_points
select user_id, day - (extract(isodow from day)::int - 1), sum(points) from public.daily_points group by 1, 2; -- Monday of each day's week

create function public.on_points_league() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.league_points values (new.user_id, public.week_start(now()),
    new.points - case when tg_op = 'UPDATE' then old.points else 0 end)
  on conflict (user_id, week) do update set points = league_points.points + excluded.points;
  return new;
end $$;
create trigger on_points_league after insert or update of points on public.daily_points
  for each row execute function public.on_points_league();
revoke execute on function public.on_points_league() from public, anon, authenticated;

create or replace function public.week_points(p_user uuid, p_week date) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select points from public.league_points where user_id = p_user and week = p_week), 0)
$$;

-- ───────────── who counts in a league ─────────────

-- From 0005, plus: promotion ranks and cohort sizes count only the learners the leaderboard shows (not opted out,
-- not a legacy anonymous account).
create or replace function public.join_league(p_user uuid, p_now timestamptz default now()) returns public.league_members
language plpgsql security definer set search_path = public as $$
declare
  wk date := public.week_start(p_now);
  lm public.league_members;
  prev public.league_members;
  rnk int; size int; mine int;
  t int;
  c int;
begin
  select * into lm from public.league_members where user_id = p_user and week = wk;
  if found then return lm; end if;

  select league_tier into t from public.profiles where id = p_user for update;
  select * into prev from public.league_members where user_id = p_user and week < wk order by week desc limit 1;
  if found then
    mine := public.week_points(p_user, prev.week);
    select count(*), 1 + count(*) filter (where public.week_points(o.user_id, prev.week) > mine)
      into size, rnk from public.league_members o
      join public.profiles p on p.id = o.user_id and not p.leagues_opt_out
      join auth.users u on u.id = o.user_id and not u.is_anonymous
      where o.week = prev.week and o.tier = prev.tier and o.cohort = prev.cohort and o.user_id <> p_user;
    size := size + 1;
    if rnk <= 7 and mine > 0 and prev.tier < 5 then t := prev.tier + 1;               -- top 7 promote
    elsif rnk > greatest(7, size - 5) and prev.tier > 1 then t := prev.tier - 1;     -- bottom 5 relegate
    else t := prev.tier;
    end if;
    update public.profiles set league_tier = t where id = p_user;
  end if;

  select cohort into c from public.league_members o join auth.users u on u.id = o.user_id and not u.is_anonymous
  where week = wk and tier = t group by cohort having count(*) < 30 order by cohort limit 1;
  if c is null then
    select coalesce(max(cohort), 0) + 1 into c from public.league_members where week = wk and tier = t;
  end if;
  -- Concurrent calls (double-mounted effects, double taps) may race here; the first insert wins.
  insert into public.league_members values (p_user, wk, t, c) on conflict (user_id, week) do nothing;
  select * into lm from public.league_members where user_id = p_user and week = wk;
  return lm;
end $$;

-- From 0008, plus: opted-out learners leave the leaderboard at once, not at the end of the week.
create or replace function public.get_league() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  lm public.league_members;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if (select leagues_opt_out from public.profiles where id = uid) then
    return jsonb_build_object('opted_out', true);
  end if;
  lm := public.join_league(uid);
  return jsonb_build_object(
    'opted_out', false,
    'tier', lm.tier,
    'tier_name', (array['Pencil', 'Notebook', 'Compass', 'Protractor', 'Summit'])[lm.tier],
    'week_end', lm.week + 7,
    'promote', case when lm.tier < 5 then 7 else 0 end,
    'demote', case when lm.tier > 1 then 5 else 0 end,
    'members', (select jsonb_agg(jsonb_build_object(
                  'name', coalesce(p.display_name, 'Learner'), 'avatar', p.avatar, 'accessory', p.accessory,
                  'points', public.week_points(o.user_id, lm.week), 'me', o.user_id = uid)
                  order by public.week_points(o.user_id, lm.week) desc, p.handle)
                from public.league_members o
                join public.profiles p on p.id = o.user_id
                join auth.users u on u.id = o.user_id and not u.is_anonymous
                where o.week = lm.week and o.tier = lm.tier and o.cohort = lm.cohort and not p.leagues_opt_out)
  );
end $$;

-- ───────────── only published items are served ─────────────

-- From 0007, plus: review sessions skip items that are no longer published.
create or replace function public.start_session(p_mode text, p_skill text default null, p_tier text default null, p_domain text default null,
  p_section text default null, p_pass boolean default false)
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
  ends_at timestamptz;
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
  elsif p_mode = 'drill' then
    -- 10 medium/hard items from one section at SAT pace (71 s per R&W question, 95 s per Math question; docs/sat-spec.md §2).
    if p_section not in ('rw', 'math') then raise exception 'bad section'; end if;
    select coalesce(array_agg(id), '{}') into q from (
      select i.id from public.items i join public.skills k on k.id = i.skill_id
      where k.section = p_section and i.tier in ('medium', 'hard') and i.status = 'published'
      order by exists (select 1 from public.responses x where x.user_id = uid and x.item_id = i.id
                       and x.created_at > now() - interval '14 days'), random()
      limit 10) t;
    if p_pass and not public.use_item(uid, 'timer_pass') then raise exception 'no timer pass'; end if;
    ends_at := now() + make_interval(secs => cardinality(q) * case p_section when 'rw' then 71 else 95 end * case when p_pass then 1.5 else 1 end);
  elsif p_mode = 'mistakes' then
    -- Up to 15 missed items, oldest first; each comes back until answered correctly.
    select coalesce(array_agg(item_id order by missed_at), '{}') into q from (
      select * from public.missed_items(uid) order by missed_at limit 15) t;
  elsif p_mode = 'testout' then
    select coalesce(array_agg(id), '{}') into q from (
      (select id from public.items where skill_id = p_skill and tier = 'easy' and status = 'published' order by random() limit 3)
      union all
      (select id from public.items where skill_id = p_skill and tier = 'medium' and status = 'published' order by random() limit 3)
      union all
      (select id from public.items where skill_id = p_skill and tier = 'hard' and status = 'published' order by random() limit 2)) t;
  elsif p_mode = 'review' then
    select coalesce(array_agg(item_id), '{}') into q from (
      select r.item_id from public.review_items r join public.items i on i.id = r.item_id
      where r.user_id = uid and r.due <= today and i.status = 'published' order by r.due, r.box limit 10) t;
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
  -- A mistake boost from the shop adds 3 to the next lesson's budget.
  if p_mode = 'lesson' and public.use_item(uid, 'mistake_boost') then budget := budget + 3; end if;
  select theta into th from public.mastery where user_id = uid and skill_id = p_skill;

  insert into public.sessions (user_id, mode, skill_id, tier, domain_id, queue, mistakes_left, theta_before, deadline)
  values (uid, p_mode, p_skill, p_tier, case when p_mode like 'unit_%' then p_domain end, q, budget, coalesce(th, 0), ends_at)
  returning id into sid;
  return sid;
end $$;

-- From 0007, plus: items unpublished after a session was built are dropped from its queue.
create or replace function public.next_item(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sessions := public.own_session(p_session);
  it public.items;
  pick uuid;
  total int;
begin
  if s.status <> 'active' then return jsonb_build_object('done', true); end if;
  -- An item moved back to draft or retired since the session was built is dropped, never shown.
  while s.pos < cardinality(s.queue)
        and not exists (select 1 from public.items where id = s.queue[s.pos + 1] and status = 'published') loop
    update public.sessions set queue = queue[1:pos] || queue[pos + 2:] where id = s.id returning * into s;
  end loop;
  if s.mode = 'diagnostic' and s.pos = cardinality(s.queue) then
    pick := public.diag_pick(s);
    if pick is not null then
      update public.sessions set queue = queue || pick where id = s.id returning * into s;
    end if;
  end if;
  if s.pos >= cardinality(s.queue) or s.deadline < now() then return jsonb_build_object('done', true); end if;

  select * into it from public.items where id = s.queue[s.pos + 1];
  total := case when s.mode = 'diagnostic'
    then 3 * (select count(distinct domain_id) from public.skills) else cardinality(s.queue) end;
  return jsonb_build_object(
    'done', false,
    'index', s.pos,
    'total', total,
    'mode', s.mode,
    'mistakes_left', s.mistakes_left,
    'deadline', s.deadline,
    'server_now', now(),
    'item', jsonb_build_object(
      'id', it.id, 'kind', it.kind, 'passage', it.passage, 'stem', it.stem, 'tier', it.tier,
      'skill', (select name from public.skills where id = it.skill_id),
      'section', (select section from public.skills where id = it.skill_id),
      -- Deterministic per-position shuffle, so the displayed order can be recomputed later.
      'choices', (select jsonb_agg(c order by md5(s.id::text || s.pos || (c->>'id'))) from jsonb_array_elements(it.choices) c)
    )
  );
end $$;

-- From 0007, plus: an item unpublished mid-question is not graded or revealed.
create or replace function public.submit_answer(p_session uuid, p_response text, p_ms int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sessions := public.own_session(p_session);
  uid uuid := s.user_id;
  it public.items;
  ok boolean;
  reask boolean;
  m public.mastery;
  k float8;
  pts int := 0;
  rv public.review_items;
  today date := public.local_day(uid);
  done boolean;
begin
  if s.status <> 'active' or s.pos >= cardinality(s.queue) then raise exception 'nothing to answer'; end if;
  if s.deadline + interval '5 seconds' < now() then raise exception 'time is up'; end if;  -- small grace for network lag
  if length(p_response) > 200 then raise exception 'response too long'; end if;
  select * into it from public.items where id = s.queue[s.pos + 1] and status = 'published';
  if not found then raise exception 'question no longer available'; end if;

  ok := case it.kind when 'mcq' then p_response = it.answer->>'choice'
                     else public.spr_correct(p_response, it.answer->'values') end;
  reask := exists (select 1 from public.responses where session_id = s.id and item_id = it.id);
  insert into public.responses (session_id, user_id, item_id, response, correct, ms, is_reask)
  values (s.id, uid, it.id, p_response, ok, least(greatest(p_ms, 0), 3600000), reask);

  if not reask then
    -- Mastery (Elo / 1PL). Diagnostic moves every skill in the item's domain with a fixed K.
    if s.mode = 'diagnostic' then
      insert into public.mastery (user_id, skill_id, theta)
      select uid, k2.id, 0.8 * ((ok::int) - public.p_correct(0, it.b))
      from public.skills k2 where k2.domain_id = (select domain_id from public.skills where id = it.skill_id)
      on conflict (user_id, skill_id) do update
        set theta = mastery.theta + 0.8 * ((ok::int) - public.p_correct(mastery.theta, it.b));
    else
      insert into public.mastery (user_id, skill_id) values (uid, it.skill_id) on conflict do nothing;
      select * into m from public.mastery where user_id = uid and skill_id = it.skill_id for update;
      k := greatest(0.2, 0.8 / sqrt(1 + m.n));
      update public.mastery set theta = m.theta + k * ((ok::int) - public.p_correct(m.theta, it.b)), n = m.n + 1
      where user_id = uid and skill_id = it.skill_id;
    end if;

    -- Leitner review boxes: intervals 1, 3, 7, 14, 30 days; correct in box 5 retires the item.
    select * into rv from public.review_items where user_id = uid and item_id = it.id;
    if not ok then
      insert into public.review_items values (uid, it.id, 1, today + 1)
      on conflict (user_id, item_id) do update set box = 1, due = today + 1;
    elsif found and rv.box = 5 then
      delete from public.review_items where user_id = uid and item_id = it.id;
    elsif found then
      update public.review_items set box = rv.box + 1,
        due = today + (array[1, 3, 7, 14, 30])[rv.box + 1]
      where user_id = uid and item_id = it.id;
    end if;

    pts := case when ok then 2 else 1 end;
    insert into public.daily_points values (uid, today, pts)
    on conflict (user_id, day) do update set points = daily_points.points + pts;
  end if;

  update public.sessions set
    pos = pos + 1,
    points = points + pts,
    mistakes_left = case when not ok and mistakes_left is not null then mistakes_left - 1 else mistakes_left end,
    queue = case when not ok and ((not reask and mode in ('lesson', 'weak')) or (mode = 'mistakes' and cardinality(queue) < 45))
                 then queue || it.id else queue end
  where id = s.id returning * into s;

  if s.mistakes_left = 0 then
    update public.sessions set status = 'failed' where id = s.id;
  end if;
  done := coalesce(s.mistakes_left = 0, false)
    or (s.mode <> 'diagnostic' and s.pos >= cardinality(s.queue))
    or (s.mode = 'diagnostic' and s.pos >= 3 * (select count(distinct domain_id) from public.skills));

  if s.mode = 'diagnostic' then
    return jsonb_build_object('done', done);  -- no feedback during the diagnostic
  end if;
  return jsonb_build_object(
    'done', done,
    'correct', ok,
    'correct_answer', coalesce(it.answer->>'choice', it.answer->>'display'),
    'explanation', it.explanation,
    'rationale', it.rationales->>p_response,
    'mistakes_left', s.mistakes_left
  );
end $$;

-- From 0002, plus: mock modules and reviews leave out items that are no longer published.
create or replace function public.mock_state(p_mock uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m public.mocks := public.own_mock(p_mock);
begin
  -- Server-side time limit (30 s grace for network lag): an expired module is submitted as is.
  if m.status = 'active' and now() > m.stage_started_at + make_interval(secs => public.mock_limit(m.stage) + 30) then
    perform public.mock_advance(m.id);
    m := public.own_mock(p_mock);
  end if;
  return jsonb_build_object(
    'status', m.status,
    'stage', m.stage,
    'section', case when m.stage < 2 then 'rw' else 'math' end,
    'module', m.stage % 2 + 1,
    'deadline', m.stage_started_at + make_interval(secs => public.mock_limit(m.stage)),
    'server_now', now(),
    'result', m.result,
    'items', case when m.status = 'active' then (
      select jsonb_agg(jsonb_build_object(
        'position', x.position, 'response', x.response, 'flagged', x.flagged,
        'item', jsonb_build_object('id', i.id, 'kind', i.kind, 'passage', i.passage, 'stem', i.stem, 'choices', i.choices)
      ) order by x.position)
      from public.mock_items x join public.items i on i.id = x.item_id
      where x.mock_id = m.id and x.stage = m.stage and i.status = 'published') end
  );
end $$;

create or replace function public.mock_review(p_mock uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.mocks := public.own_mock(p_mock);
begin
  if m.status <> 'completed' then raise exception 'mock not finished'; end if;
  return (select jsonb_agg(jsonb_build_object(
      'stage', x.stage, 'position', x.position, 'response', x.response, 'flagged', x.flagged, 'correct', x.correct,
      'item', jsonb_build_object('id', i.id, 'kind', i.kind, 'passage', i.passage, 'stem', i.stem, 'choices', i.choices,
        'answer', coalesce(i.answer->>'choice', i.answer->>'display'), 'explanation', i.explanation, 'rationales', i.rationales,
        'skill', s.name)
    ) order by x.stage, x.position)
    from public.mock_items x join public.items i on i.id = x.item_id join public.skills s on s.id = i.skill_id
    where x.mock_id = m.id and i.status = 'published');
end $$;
