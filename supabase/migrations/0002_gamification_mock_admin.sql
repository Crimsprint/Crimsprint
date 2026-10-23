-- Phase 4b: daily quests, weekly leagues, achievements, mock test, progress, admin content tool.
-- Rules: docs/mechanics-to-sat.md §7–9. Gamification hooks are triggers so the 0001 session RPCs stay unchanged.

alter table public.profiles
  add column handle text unique,
  add column league_tier int not null default 1 check (league_tier between 1 and 5),
  add column leagues_opt_out boolean not null default false,
  add column is_admin boolean not null default false,  -- set by the project owner in SQL; never by RPC
  add column retired_reviews int not null default 0;
update public.profiles set handle = 'learner-' || substr(md5(id::text), 1, 8) where handle is null;

-- Public display handle only: leagues never show names or emails (many users are minors).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle) values (new.id, 'learner-' || substr(md5(new.id::text), 1, 8)) on conflict do nothing;
  return new;
end $$;

create function public.add_points(p_user uuid, p_points int) returns void
language sql security definer set search_path = public as $$
  insert into public.daily_points values (p_user, public.local_day(p_user), p_points)
  on conflict (user_id, day) do update set points = daily_points.points + p_points
$$;

-- ───────────── achievements ─────────────

create table public.achievements (
  user_id uuid not null references public.profiles on delete cascade,
  code text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, code)
);
alter table public.achievements enable row level security;
create policy own_read on public.achievements for select to authenticated using (user_id = auth.uid());

create function public.award(p_user uuid, p_code text) returns void
language sql security definer set search_path = public as $$
  insert into public.achievements (user_id, code) values (p_user, p_code) on conflict do nothing
$$;

-- ───────────── daily quests ─────────────

create table public.daily_quests (
  user_id uuid not null references public.profiles on delete cascade,
  day date not null,
  code text not null,
  target int not null,
  progress int not null default 0,
  done boolean not null default false,
  primary key (user_id, day, code)
);
alter table public.daily_quests enable row level security;
create policy own_read on public.daily_quests for select to authenticated using (user_id = auth.uid());

create function public.quest_pool() returns table (code text, title text, target int)
language sql immutable as $$
  values ('lessons2', 'Finish 2 lessons', 2),
         ('streak5', 'Get 5 correct in a row', 5),
         ('hard1', 'Answer a hard question correctly', 1),
         ('review5', 'Get 5 review questions right', 5),
         ('minutes15', 'Practice for 15 minutes', 900),  -- seconds
         ('mock1', 'Complete a mock test module', 1)
$$;

-- Three quests per local day, picked deterministically per user and day.
create function public.ensure_quests(p_user uuid, p_day date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.daily_quests where user_id = p_user and day = p_day) then return; end if;
  insert into public.daily_quests (user_id, day, code, target)
  select p_user, p_day, q.code, q.target from public.quest_pool() q
  order by md5(p_user::text || p_day::text || q.code) limit 3
  on conflict do nothing;
end $$;

-- Adds to (or, with p_max, raises to) today's progress on a quest; +5 points when it completes.
create function public.bump_quest(p_user uuid, p_code text, p_amount int, p_max boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  today date := public.local_day(p_user);
  q public.daily_quests;
begin
  perform public.ensure_quests(p_user, today);
  update public.daily_quests
     set progress = least(target, case when p_max then greatest(progress, p_amount) else progress + p_amount end)
   where user_id = p_user and day = today and code = p_code and not done
  returning * into q;
  if found and q.progress >= q.target then
    update public.daily_quests set done = true where user_id = p_user and day = today and code = p_code;
    perform public.add_points(p_user, 5);
  end if;
end $$;

create function public.on_response() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mode text;
  v_tier text;
  run int;
begin
  if new.is_reask then return new; end if;
  select mode into v_mode from public.sessions where id = new.session_id;
  select tier into v_tier from public.items where id = new.item_id;
  perform public.bump_quest(new.user_id, 'minutes15', least(new.ms, 180000) / 1000);
  if new.correct and v_tier = 'hard' then perform public.bump_quest(new.user_id, 'hard1', 1); end if;
  if new.correct and v_mode = 'review' then perform public.bump_quest(new.user_id, 'review5', 1); end if;
  -- Trailing run of correct answers in this session.
  select count(*) into run from public.responses r
  where r.session_id = new.session_id and r.id > coalesce(
    (select max(id) from public.responses x where x.session_id = new.session_id and not x.correct), 0);
  perform public.bump_quest(new.user_id, 'streak5', run, true);
  return new;
end $$;
create trigger on_response after insert on public.responses for each row execute function public.on_response();

create function public.on_session_done() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dom text;
  firsts int;
  right_ int;
begin
  if not (old.status = 'active' and new.status = 'completed') then return new; end if;
  if new.mode in ('lesson', 'weak') then perform public.bump_quest(new.user_id, 'lessons2', 1); end if;
  if new.mode = 'diagnostic' then perform public.award(new.user_id, 'diagnosed'); end if;
  if new.mode = 'lesson' then
    perform public.award(new.user_id, 'first_step');
    select count(*) filter (where not is_reask), count(*) filter (where not is_reask and correct)
      into firsts, right_ from public.responses where session_id = new.id;
    if new.tier = 'hard' and firsts > 0 and right_ = firsts then perform public.award(new.user_id, 'sharpshooter'); end if;
    select domain_id into dom from public.skills where id = new.skill_id;
    if not exists (
      select 1 from public.skills k left join public.mastery m on m.skill_id = k.id and m.user_id = new.user_id
      where k.domain_id = dom and public.p_correct(coalesce(m.theta, 0), 0) < 0.7
    ) then perform public.award(new.user_id, 'domain_master'); end if;
  end if;
  return new;
end $$;
create trigger on_session_done after update of status on public.sessions for each row execute function public.on_session_done();

create function public.on_streak() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.streak in (7, 14, 30, 50) and new.streak is distinct from old.streak then
    perform public.award(new.id, 'streak_' || new.streak);
  end if;
  return new;
end $$;
create trigger on_streak after update of streak on public.profiles for each row execute function public.on_streak();

-- A review item deleted from box 5 was answered correctly at the longest interval: it is retired.
create function public.on_review_retired() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if old.box = 5 then
    update public.profiles set retired_reviews = retired_reviews + 1 where id = old.user_id returning retired_reviews into n;
    if n >= 25 then perform public.award(old.user_id, 'comeback'); end if;
  end if;
  return old;
end $$;
create trigger on_review_retired after delete on public.review_items for each row execute function public.on_review_retired();

create function public.get_quests() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date;
begin
  if uid is null then raise exception 'not signed in'; end if;
  today := public.local_day(uid);
  perform public.ensure_quests(uid, today);
  return (select jsonb_agg(jsonb_build_object('code', q.code, 'title', p.title, 'target', q.target, 'progress', q.progress, 'done', q.done) order by q.code)
          from public.daily_quests q join public.quest_pool() p on p.code = q.code
          where q.user_id = uid and q.day = today);
end $$;

-- ───────────── weekly leagues ─────────────

create table public.league_members (
  user_id uuid not null references public.profiles on delete cascade,
  week date not null,
  tier int not null,
  cohort int not null,
  primary key (user_id, week)
);
alter table public.league_members enable row level security;
create policy own_read on public.league_members for select to authenticated using (user_id = auth.uid());

create function public.week_start(p_now timestamptz default now()) returns date
language sql stable as $$ select date_trunc('week', p_now at time zone 'UTC')::date $$;

-- shortcut: daily_points are keyed by the user's local day while league weeks start Monday 00:00 UTC, so a few hours
-- of points can land in the adjacent week; store UTC timestamps per point event if leagues become competitive.
create function public.week_points(p_user uuid, p_week date) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(points), 0)::int from public.daily_points where user_id = p_user and day >= p_week and day < p_week + 7
$$;

-- Joins this week's league, settling promotion/demotion from the last league played (lazy: no cron needed).
create function public.join_league(p_user uuid, p_now timestamptz default now()) returns public.league_members
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
      where o.week = prev.week and o.tier = prev.tier and o.cohort = prev.cohort and o.user_id <> p_user;
    size := size + 1;
    if rnk <= 7 and mine > 0 and prev.tier < 5 then t := prev.tier + 1;               -- top 7 promote
    elsif rnk > greatest(7, size - 5) and prev.tier > 1 then t := prev.tier - 1;     -- bottom 5 relegate
    else t := prev.tier;
    end if;
    update public.profiles set league_tier = t where id = p_user;
  end if;

  select cohort into c from public.league_members where week = wk and tier = t
  group by cohort having count(*) < 30 order by cohort limit 1;
  if c is null then
    select coalesce(max(cohort), 0) + 1 into c from public.league_members where week = wk and tier = t;
  end if;
  insert into public.league_members values (p_user, wk, t, c) returning * into lm;
  return lm;
end $$;

create function public.get_league() returns jsonb
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
    'members', (select jsonb_agg(jsonb_build_object('handle', p.handle, 'points', public.week_points(o.user_id, lm.week), 'me', o.user_id = uid)
                  order by public.week_points(o.user_id, lm.week) desc, p.handle)
                from public.league_members o join public.profiles p on p.id = o.user_id
                where o.week = lm.week and o.tier = lm.tier and o.cohort = lm.cohort)
  );
end $$;

create function public.set_leagues_opt_out(p_opt_out boolean) returns void
language sql security definer set search_path = public as $$
  update public.profiles set leagues_opt_out = p_opt_out where id = auth.uid()
$$;

-- ───────────── mock test ─────────────

create table public.mocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  status text not null default 'active' check (status in ('active', 'break', 'completed')),
  stage int not null default 0 check (stage between 0 and 3),  -- 0,1 = R&W modules; 2,3 = Math modules
  routes jsonb not null default '{}',
  stage_started_at timestamptz not null default now(),
  stage_seconds int[] not null default '{}',
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
-- No policy on mock_items: graded correctness must not be readable mid-test. Clients use the RPCs.
create table public.mock_items (
  mock_id uuid not null references public.mocks on delete cascade,
  stage int not null,
  position int not null,
  item_id uuid not null references public.items,
  response text,
  flagged boolean not null default false,
  correct boolean,
  primary key (mock_id, stage, position)
);
alter table public.mocks enable row level security;
alter table public.mock_items enable row level security;
create policy own_read on public.mocks for select to authenticated using (user_id = auth.uid());

create function public.mock_limit(p_stage int) returns int
language sql immutable as $$ select case when p_stage < 2 then 32 * 60 else 35 * 60 end $$;

-- Builds one module. Domain counts follow the official shares (R&W 27, Math 22 questions per module).
-- Module 1 cycles easy/medium/hard; Module 2 "higher" cycles medium/hard, "lower" easy/medium.
create function public.mock_assemble(p_mock uuid, p_stage int, p_route text) returns void
language plpgsql security definer set search_path = public as $$
declare
  rw boolean := p_stage < 2;
  plan text[][] := case when rw
    then array[['rw.cs', '8'], ['rw.ii', '7'], ['rw.sec', '7'], ['rw.eoi', '5']]
    else array[['math.alg', '8'], ['math.adv', '8'], ['math.psda', '3'], ['math.geo', '3']] end;
  cyc text[] := case p_route when 'higher' then array['medium', 'hard'] when 'lower' then array['easy', 'medium']
                             else array['easy', 'medium', 'hard'] end;
  picked uuid[] := '{}';
  pick uuid;
  d int; k int;
begin
  for d in 1 .. array_length(plan, 1) loop
    for k in 0 .. plan[d][2]::int - 1 loop
      select i.id into pick from public.items i join public.skills s on s.id = i.skill_id
      where s.domain_id = plan[d][1] and i.status = 'published' and i.id <> all (picked)
        and not exists (select 1 from public.mock_items x where x.mock_id = p_mock and x.item_id = i.id)
      order by (i.tier = cyc[k % array_length(cyc, 1) + 1]) desc, random() limit 1;
      exit when pick is null;  -- pool exhausted: shorter module rather than failure
      picked := picked || pick;
    end loop;
  end loop;
  insert into public.mock_items (mock_id, stage, position, item_id)
  select p_mock, p_stage,
    row_number() over (order by
      case when rw then array_position(array['rw.cs', 'rw.ii', 'rw.sec', 'rw.eoi'], s.domain_id) else 0 end,
      case when rw and s.domain_id <> 'rw.sec' then s.sort else 0 end,  -- R&W: by skill, then easy→hard; SEC by difficulty only
      i.b, i.id),
    i.id
  from public.items i join public.skills s on s.id = i.skill_id where i.id = any (picked);
end $$;

create function public.own_mock(p_mock uuid) returns public.mocks
language plpgsql stable security definer set search_path = public as $$
declare m public.mocks;
begin
  select * into m from public.mocks where id = p_mock and user_id = auth.uid();
  if not found then raise exception 'mock not found'; end if;
  return m;
end $$;

create function public.start_mock() returns uuid
language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.mocks (user_id) values (auth.uid()) returning id into mid;
  perform public.mock_assemble(mid, 0, null);
  return mid;
end $$;

-- θ by maximum a posteriori (1PL with a N(0,1) prior, so all-right/all-wrong stay finite), then a linear map to 200–800.
create function public.mock_section_score(p_mock uuid, p_stages int[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  th float8 := 0; g float8; h float8; it int;
  n int; c int; est int;
begin
  for it in 1 .. 25 loop
    select coalesce(sum(coalesce(x.correct, false)::int - public.p_correct(th, i.b)), 0) - th,
           -coalesce(sum(public.p_correct(th, i.b) * (1 - public.p_correct(th, i.b))), 0) - 1
      into g, h
    from public.mock_items x join public.items i on i.id = x.item_id
    where x.mock_id = p_mock and x.stage = any (p_stages);
    th := th - g / h;
  end loop;
  select count(*), count(*) filter (where x.correct) into n, c from public.mock_items x where x.mock_id = p_mock and x.stage = any (p_stages);
  est := least(800, greatest(200, round((500 + 100 * th) / 10) * 10));
  return jsonb_build_object('estimate', est, 'low', greatest(200, est - 30), 'high', least(800, est + 30), 'correct', c, 'total', n, 'theta', th);
end $$;

-- Grades the current module and moves on. Called by mock_submit, and by mock_state once time has run out.
create function public.mock_advance(p_mock uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.mocks;
  acc float8;
  route text;
  sec text;
  rw jsonb; mt jsonb;
  r record;
  mm public.mastery;
  today date;
begin
  select * into m from public.mocks where id = p_mock for update;
  if m.status <> 'active' then return; end if;
  today := public.local_day(m.user_id);

  update public.mock_items x set correct = case
      when x.response is null then false
      when i.kind = 'mcq' then x.response = i.answer->>'choice'
      else public.spr_correct(x.response, i.answer->'values') end
  from public.items i where i.id = x.item_id and x.mock_id = m.id and x.stage = m.stage;

  update public.mocks set stage_seconds = stage_seconds
    || least(public.mock_limit(m.stage), extract(epoch from now() - m.stage_started_at)::int)
  where id = m.id;

  perform public.add_points(m.user_id, 3 + (select count(*)::int from public.mock_items where mock_id = m.id and stage = m.stage and response is not null));
  perform public.apply_streak(m.user_id, now());
  perform public.bump_quest(m.user_id, 'mock1', 1);

  if m.stage in (0, 2) then
    select avg(correct::int) into acc from public.mock_items where mock_id = m.id and stage = m.stage;
    route := case when acc >= 0.6 then 'higher' else 'lower' end;  -- College Board's threshold is unpublished
    sec := case when m.stage = 0 then 'rw' else 'math' end;
    update public.mocks set stage = m.stage + 1, stage_started_at = now(), routes = routes || jsonb_build_object(sec, route) where id = m.id;
    perform public.mock_assemble(m.id, m.stage + 1, route);
  elsif m.stage = 1 then
    update public.mocks set status = 'break', stage = 2 where id = m.id;  -- 10-minute break; Math starts on resume
  else
    -- Mastery and review from every item, then the score estimate.
    for r in select mi.correct, i.id, i.skill_id, i.b from public.mock_items mi join public.items i on i.id = mi.item_id where mi.mock_id = m.id loop
      insert into public.mastery (user_id, skill_id) values (m.user_id, r.skill_id) on conflict do nothing;
      select * into mm from public.mastery where user_id = m.user_id and skill_id = r.skill_id;
      update public.mastery set theta = mm.theta + greatest(0.2, 0.8 / sqrt(1 + mm.n)) * (r.correct::int - public.p_correct(mm.theta, r.b)), n = mm.n + 1
      where user_id = m.user_id and skill_id = r.skill_id;
      if not r.correct then
        insert into public.review_items values (m.user_id, r.id, 1, today + 1)
        on conflict (user_id, item_id) do update set box = 1, due = today + 1;
      end if;
    end loop;
    rw := public.mock_section_score(m.id, array[0, 1]);
    mt := public.mock_section_score(m.id, array[2, 3]);
    select * into m from public.mocks where id = m.id;
    update public.mocks set status = 'completed', completed_at = now(), result = jsonb_build_object(
      'sections', jsonb_build_object(
        'rw', rw || jsonb_build_object('seconds_per_q', (m.stage_seconds[1] + m.stage_seconds[2]) / greatest(1, (rw->>'total')::int)),
        'math', mt || jsonb_build_object('seconds_per_q', (m.stage_seconds[3] + m.stage_seconds[4]) / greatest(1, (mt->>'total')::int))),
      'total', jsonb_build_object(
        'estimate', (rw->>'estimate')::int + (mt->>'estimate')::int,
        'low', (rw->>'low')::int + (mt->>'low')::int,
        'high', (rw->>'high')::int + (mt->>'high')::int),
      'routes', m.routes,
      'domains', (select jsonb_agg(jsonb_build_object('domain', d.domain_name, 'correct', d.c, 'total', d.n) order by d.sort)
                  from (select s.domain_name, min(s.sort) sort, count(*) n, count(*) filter (where mi.correct) c
                        from public.mock_items mi join public.items i on i.id = mi.item_id join public.skills s on s.id = i.skill_id
                        where mi.mock_id = m.id group by s.domain_name) d),
      'flagged_wrong', (select count(*) from public.mock_items where mock_id = m.id and flagged and not correct)
    ) where id = m.id;
    perform public.award(m.user_id, 'full_run');
  end if;
end $$;

create function public.mock_state(p_mock uuid) returns jsonb
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
      where x.mock_id = m.id and x.stage = m.stage) end
  );
end $$;

create function public.mock_answer(p_mock uuid, p_position int, p_response text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.mocks := public.own_mock(p_mock);
begin
  if m.status <> 'active' or now() > m.stage_started_at + make_interval(secs => public.mock_limit(m.stage) + 30) then
    raise exception 'module closed';
  end if;
  if length(p_response) > 200 then raise exception 'response too long'; end if;
  update public.mock_items set response = nullif(btrim(p_response), '')
  where mock_id = m.id and stage = m.stage and position = p_position;
end $$;

create function public.mock_flag(p_mock uuid, p_position int, p_flagged boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m public.mocks := public.own_mock(p_mock);
begin
  if m.status <> 'active' then raise exception 'module closed'; end if;
  update public.mock_items set flagged = p_flagged where mock_id = m.id and stage = m.stage and position = p_position;
end $$;

create function public.mock_submit(p_mock uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.own_mock(p_mock);
  perform public.mock_advance(p_mock);
end $$;

create function public.mock_resume(p_mock uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.mocks := public.own_mock(p_mock);
begin
  if m.status <> 'break' then return; end if;
  update public.mocks set status = 'active', stage_started_at = now() where id = m.id;
  perform public.mock_assemble(m.id, 2, null);
end $$;

-- Answers and explanations, only after the whole test is finished.
create function public.mock_review(p_mock uuid) returns jsonb
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
    where x.mock_id = m.id);
end $$;

-- ───────────── progress dashboard ─────────────

create function public.get_progress() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
begin
  select * into p from public.profiles where id = uid;
  if not found then raise exception 'not signed in'; end if;
  return jsonb_build_object(
    'target_score', p.target_score,
    'days_to_test', p.test_date - public.local_day(uid),
    'sections', (select jsonb_object_agg(sec, jsonb_build_object('answered', n, 'accuracy', acc, 'median_seconds', med)) from (
        select s.section sec, count(*) n, avg(r.correct::int) acc, percentile_cont(0.5) within group (order by r.ms) / 1000 med
        from public.responses r join public.items i on i.id = r.item_id join public.skills s on s.id = i.skill_id
        where r.user_id = uid and not r.is_reask and r.created_at > now() - interval '30 days' group by s.section) t),
    'weeks', (select jsonb_agg(jsonb_build_object('week', w, 'answered', n, 'accuracy', acc) order by w) from (
        select date_trunc('week', r.created_at)::date w, count(*) n, avg(r.correct::int) acc
        from public.responses r where r.user_id = uid and not r.is_reask and r.created_at > now() - interval '8 weeks' group by 1) t),
    'mocks', (select jsonb_agg(jsonb_build_object('id', id, 'completed_at', completed_at, 'total', result->'total') order by completed_at)
              from public.mocks where user_id = uid and status = 'completed'),
    'achievements', (select jsonb_agg(jsonb_build_object('code', code, 'earned_at', earned_at) order by earned_at)
                     from public.achievements where user_id = uid)
  );
end $$;

-- ───────────── reports + admin content tool ─────────────

create table public.item_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  item_id uuid not null references public.items on delete cascade,
  reason text not null check (length(reason) between 1 and 500),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.item_reports enable row level security;

create function public.report_item(p_item uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.item_reports (user_id, item_id, reason) values (auth.uid(), p_item, btrim(p_reason));
end $$;

create function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce((select is_admin from public.profiles where id = auth.uid()), false) then
    raise exception 'admin only';
  end if;
end $$;

create function public.admin_items(p_skill text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(i) order by i.tier, i.created_at) from public.items i where i.skill_id = p_skill), '[]');
end $$;

-- Validates and saves an item (insert when p->>'id' is null). Same rules as scripts/build-seed.ts.
create function public.admin_save_item(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_kind text := p->>'kind';
  v_tier text := p->>'tier';
  key text;
  wrong text[];
  v_id uuid;
begin
  perform public.require_admin();
  if not exists (select 1 from public.skills where id = p->>'skill_id') then raise exception 'unknown skill'; end if;
  if v_tier not in ('easy', 'medium', 'hard') then raise exception 'tier must be easy, medium or hard'; end if;
  if coalesce(length(btrim(p->>'stem')), 0) = 0 then raise exception 'stem is required'; end if;
  if coalesce(length(p->>'explanation'), 0) < 20 then raise exception 'explanation is required (20+ characters)'; end if;
  if v_kind = 'mcq' then
    if (select array_agg(c->>'id' order by c->>'id') from jsonb_array_elements(p->'choices') c) is distinct from array['A', 'B', 'C', 'D']
       or exists (select 1 from jsonb_array_elements(p->'choices') c where coalesce(btrim(c->>'text'), '') = '') then
      raise exception 'multiple choice needs four non-empty choices A–D';
    end if;
    key := p->'answer'->>'choice';
    if key is null or key not in ('A', 'B', 'C', 'D') then raise exception 'answer must be one of A–D'; end if;
    select array_agg(l) into wrong from unnest(array['A', 'B', 'C', 'D']) l where l <> key;
    if exists (select 1 from unnest(wrong) l where coalesce(length(p->'rationales'->>l), 0) = 0) then
      raise exception 'every wrong choice needs a rationale';
    end if;
  elsif v_kind = 'spr' then
    if jsonb_typeof(p->'answer'->'values') <> 'array' or jsonb_array_length(p->'answer'->'values') = 0
       or exists (select 1 from jsonb_array_elements(p->'answer'->'values') v where (v->>1)::numeric = 0) then
      raise exception 'answer values must be [numerator, denominator] pairs';
    end if;
    -- The displayed answer must itself be a valid, accepted entry.
    if not public.spr_correct(p->'answer'->>'display', p->'answer'->'values') then
      raise exception 'display answer does not fit the entry rules or does not match the values';
    end if;
  else
    raise exception 'kind must be mcq or spr';
  end if;

  if p->>'id' is null then
    insert into public.items (skill_id, subskill_id, tier, b, kind, passage, stem, choices, answer, explanation, rationales, status)
    values (p->>'skill_id', p->>'subskill_id', v_tier, public.tier_b(v_tier), v_kind, nullif(p->>'passage', ''), p->>'stem',
            case when v_kind = 'mcq' then p->'choices' end, p->'answer', p->>'explanation', coalesce(p->'rationales', '{}'),
            coalesce(p->>'status', 'draft'))
    returning id into v_id;
  else
    update public.items set skill_id = p->>'skill_id', subskill_id = p->>'subskill_id', tier = v_tier, b = public.tier_b(v_tier),
      kind = v_kind, passage = nullif(p->>'passage', ''), stem = p->>'stem', choices = case when v_kind = 'mcq' then p->'choices' end,
      answer = p->'answer', explanation = p->>'explanation', rationales = coalesce(p->'rationales', '{}'), status = coalesce(p->>'status', status)
    where id = (p->>'id')::uuid returning id into v_id;
    if v_id is null then raise exception 'item not found'; end if;
  end if;
  return v_id;
end $$;

create function public.admin_reports() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'created_at', r.created_at,
      'item_id', i.id, 'skill_id', i.skill_id, 'stem', i.stem) order by r.created_at desc)
    from public.item_reports r join public.items i on i.id = r.item_id where not r.resolved), '[]');
end $$;

create function public.admin_resolve_report(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.item_reports set resolved = true where id = p_id;
end $$;

-- See 0001: re-grant only the RPCs, since this revoke also covers 0001's functions.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.save_onboarding, public.start_session, public.next_item,
  public.submit_answer, public.complete_session, public.get_home to authenticated;
grant execute on function public.get_quests, public.get_league, public.set_leagues_opt_out,
  public.start_mock, public.mock_state, public.mock_answer, public.mock_flag, public.mock_submit, public.mock_resume, public.mock_review,
  public.get_progress, public.report_item,
  public.admin_items, public.admin_save_item, public.admin_reports, public.admin_resolve_report to authenticated;
