-- SAT prep core schema. Rules live in docs/mechanics-to-sat.md.
-- Answer keys never reach clients: `items` has no RLS policy and is only read by the security-definer RPCs below.

create table public.skills (
  id text primary key,
  section text not null check (section in ('rw', 'math')),
  domain_id text not null,
  domain_name text not null,
  domain_share numeric not null,
  name text not null,
  sort int not null
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  skill_id text not null references public.skills,
  subskill_id text,
  tier text not null check (tier in ('easy', 'medium', 'hard')),
  b float8 not null,
  kind text not null check (kind in ('mcq', 'spr')),
  passage text,
  stem text not null,
  choices jsonb,          -- mcq: [{"id":"A","text":"..."}]
  answer jsonb not null,  -- mcq: {"choice":"B"}; spr: {"values":[[num,den],...],"display":"2/3"}
  explanation text not null,
  rationales jsonb not null default '{}',  -- wrong choice id -> why it is wrong
  status text not null default 'published' check (status in ('draft', 'published', 'retired')),
  created_at timestamptz not null default now(),
  check ((kind = 'mcq') = (choices is not null))
);
create index on public.items (skill_id, tier) where status = 'published';

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  goal text check (goal in ('first', 'retake')),
  test_date date,
  current_score int check (current_score between 400 and 1600 and current_score % 10 = 0),
  target_score int check (target_score between 400 and 1600 and target_score % 10 = 0),
  daily_goal int not null default 20 check (daily_goal in (10, 20, 30, 40)),
  timezone text not null default 'UTC',
  onboarded boolean not null default false,
  streak int not null default 0,
  last_active date,
  freezes int not null default 0 check (freezes between 0 and 2),
  created_at timestamptz not null default now()
);

create table public.mastery (
  user_id uuid not null references public.profiles on delete cascade,
  skill_id text not null references public.skills,
  theta float8 not null default 0,
  n int not null default 0,
  primary key (user_id, skill_id)
);

create table public.level_progress (
  user_id uuid not null references public.profiles on delete cascade,
  skill_id text not null references public.skills,
  tier text not null check (tier in ('easy', 'medium', 'hard')),
  passed_at timestamptz not null default now(),
  primary key (user_id, skill_id, tier)
);

create table public.review_items (
  user_id uuid not null references public.profiles on delete cascade,
  item_id uuid not null references public.items on delete cascade,
  box int not null check (box between 1 and 5),
  due date not null,
  primary key (user_id, item_id)
);

create table public.daily_points (
  user_id uuid not null references public.profiles on delete cascade,
  day date not null,
  points int not null default 0,
  primary key (user_id, day)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  mode text not null check (mode in ('lesson', 'diagnostic', 'review', 'testout', 'weak')),
  skill_id text references public.skills,
  tier text,
  queue uuid[] not null default '{}',
  pos int not null default 0,
  mistakes_left int,  -- null = no mistake budget
  points int not null default 0,
  theta_before float8,
  status text not null default 'active' check (status in ('active', 'completed', 'failed')),
  summary jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.responses (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  item_id uuid not null references public.items,
  response text not null,
  correct boolean not null,
  ms int not null check (ms >= 0),
  is_reask boolean not null,
  created_at timestamptz not null default now()
);

-- RLS: own rows read-only; every write goes through RPCs.
alter table public.skills enable row level security;
alter table public.items enable row level security;
alter table public.profiles enable row level security;
alter table public.mastery enable row level security;
alter table public.level_progress enable row level security;
alter table public.review_items enable row level security;
alter table public.daily_points enable row level security;
alter table public.sessions enable row level security;
alter table public.responses enable row level security;

create policy skills_read on public.skills for select to authenticated using (true);
create policy own_read on public.profiles for select to authenticated using (id = auth.uid());
create policy own_read on public.mastery for select to authenticated using (user_id = auth.uid());
create policy own_read on public.level_progress for select to authenticated using (user_id = auth.uid());
create policy own_read on public.review_items for select to authenticated using (user_id = auth.uid());
create policy own_read on public.daily_points for select to authenticated using (user_id = auth.uid());
create policy own_read on public.sessions for select to authenticated using (user_id = auth.uid());
create policy own_read on public.responses for select to authenticated using (user_id = auth.uid());

-- New auth user (anonymous or not) gets a profile.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── pure helpers ─────────────

create function public.p_correct(theta float8, b float8) returns float8
language sql immutable as $$ select 1 / (1 + exp(-(theta - b))) $$;

create function public.tier_b(tier text) returns float8
language sql immutable as $$ select case tier when 'easy' then -1.0 when 'medium' then 0.0 else 1.0 end $$;

create function public.local_day(p_user uuid, p_now timestamptz default now()) returns date
language sql stable security definer set search_path = public as $$
  select (p_now at time zone timezone)::date from public.profiles where id = p_user
$$;

-- SAT student-produced-response grading, per the Bluebook Math directions (docs/sat-spec.md §2).
-- p_values: [[num, den], ...] exact rational answers.
create function public.spr_correct(p_input text, p_values jsonb) returns boolean
language plpgsql immutable as $$
declare
  s text := btrim(coalesce(p_input, ''));
  maxlen int := case when left(s, 1) = '-' then 6 else 5 end;
  v jsonb;
  n numeric; d numeric; x numeric; k int;
  a numeric; b numeric;
begin
  if s !~ '^-?([0-9]+/[0-9]+|[0-9]+\.?[0-9]*|\.[0-9]+)$' or length(s) > maxlen then
    return false;
  end if;
  for v in select * from jsonb_array_elements(p_values) loop
    n := (v->>0)::numeric; d := (v->>1)::numeric;
    if position('/' in s) > 0 then
      a := split_part(s, '/', 1)::numeric; b := split_part(s, '/', 2)::numeric;
      if b <> 0 and a * d = n * b then return true; end if;
    else
      x := s::numeric;
      if x * d = n then return true; end if;
      -- A decimal that doesn't fit must fill the field and be truncated or rounded at its last digit.
      k := coalesce(length(split_part(s, '.', 2)), 0);
      if length(s) = maxlen and position('.' in s) > 0
         and (x = trunc(n / d, k) or x = round(n / d, k)) then
        return true;
      end if;
    end if;
  end loop;
  return false;
end $$;

-- Streak update for a completed session (docs/mechanics-to-sat.md §7). Not exposed to clients.
create function public.apply_streak(p_user uuid, p_now timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  today date := public.local_day(p_user, p_now);
begin
  select * into p from public.profiles where id = p_user for update;
  if p.last_active is not null and p.last_active >= today then
    return;  -- already counted today (also covers a timezone change that moves "today" backwards)
  elsif p.last_active = today - 1 then
    p.streak := p.streak + 1;
  elsif p.last_active = today - 2 and p.freezes > 0 then
    p.freezes := p.freezes - 1;
    p.streak := p.streak + 1;
  else
    p.streak := 1;
  end if;
  if p.streak in (7, 14, 30, 50) then
    p.freezes := least(2, p.freezes + 1);
  end if;
  update public.profiles set streak = p.streak, freezes = p.freezes, last_active = today where id = p_user;
end $$;

-- ───────────── RPCs ─────────────

create function public.save_onboarding(
  p_goal text, p_test_date date, p_current int, p_target int, p_daily_goal int, p_timezone text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'unknown timezone %', p_timezone;
  end if;
  update public.profiles set goal = p_goal, test_date = p_test_date, current_score = p_current,
    target_score = p_target, daily_goal = p_daily_goal, timezone = p_timezone, onboarded = true
  where id = auth.uid();
end $$;

create function public.start_session(p_mode text, p_skill text default null, p_tier text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  q uuid[] := '{}';
  budget int;
  sid uuid;
  today date;
  th float8;
begin
  if uid is null then raise exception 'not signed in'; end if;
  today := public.local_day(uid);

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

  insert into public.sessions (user_id, mode, skill_id, tier, queue, mistakes_left, theta_before)
  values (uid, p_mode, p_skill, p_tier, q, budget, coalesce(th, 0))
  returning id into sid;
  return sid;
end $$;

create function public.own_session(p_session uuid) returns public.sessions
language plpgsql stable security definer set search_path = public as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session and user_id = auth.uid();
  if not found then raise exception 'session not found'; end if;
  return s;
end $$;

-- Diagnostic: 3 items per domain; start medium, step tier up after a correct answer, down after a miss.
create function public.diag_pick(s public.sessions) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  domains text[];
  dom text;
  want text := 'medium';
  last_ok boolean;
  last_tier text;
  pick uuid;
begin
  select array_agg(domain_id order by m) into domains
  from (select domain_id, min(sort) m from public.skills group by domain_id) t;
  if s.pos >= 3 * cardinality(domains) then return null; end if;
  dom := domains[s.pos / 3 + 1];
  if s.pos % 3 > 0 then
    select r.correct, i.tier into last_ok, last_tier from public.responses r join public.items i on i.id = r.item_id
    where r.session_id = s.id order by r.id desc limit 1;
    want := case
      when last_ok and last_tier = 'easy' then 'medium' when last_ok then 'hard'
      when last_tier = 'hard' then 'medium' else 'easy' end;
  end if;
  select i.id into pick from public.items i join public.skills k on k.id = i.skill_id
  where k.domain_id = dom and i.status = 'published' and i.id <> all (s.queue)
  order by (i.tier = want) desc, random() limit 1;
  if pick is null then raise exception 'no diagnostic items for %', dom; end if;
  return pick;
end $$;

create function public.next_item(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sessions := public.own_session(p_session);
  it public.items;
  pick uuid;
  total int;
begin
  if s.status <> 'active' then return jsonb_build_object('done', true); end if;
  if s.mode = 'diagnostic' and s.pos = cardinality(s.queue) then
    pick := public.diag_pick(s);
    if pick is not null then
      update public.sessions set queue = queue || pick where id = s.id returning * into s;
    end if;
  end if;
  if s.pos >= cardinality(s.queue) then return jsonb_build_object('done', true); end if;

  select * into it from public.items where id = s.queue[s.pos + 1];
  total := case when s.mode = 'diagnostic'
    then 3 * (select count(distinct domain_id) from public.skills) else cardinality(s.queue) end;
  return jsonb_build_object(
    'done', false,
    'index', s.pos,
    'total', total,
    'mode', s.mode,
    'mistakes_left', s.mistakes_left,
    'item', jsonb_build_object(
      'id', it.id, 'kind', it.kind, 'passage', it.passage, 'stem', it.stem, 'tier', it.tier,
      'skill', (select name from public.skills where id = it.skill_id),
      'section', (select section from public.skills where id = it.skill_id),
      -- Deterministic per-position shuffle, so the displayed order can be recomputed later.
      'choices', (select jsonb_agg(c order by md5(s.id::text || s.pos || (c->>'id'))) from jsonb_array_elements(it.choices) c)
    )
  );
end $$;

create function public.submit_answer(p_session uuid, p_response text, p_ms int) returns jsonb
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
  if length(p_response) > 200 then raise exception 'response too long'; end if;
  select * into it from public.items where id = s.queue[s.pos + 1];

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
    queue = case when not ok and not reask and mode in ('lesson', 'weak') then queue || it.id else queue end
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

create function public.complete_session(p_session uuid) returns jsonb
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
    end if;
    perform public.apply_streak(uid, now());
  end if;

  sm := jsonb_build_object(
    'mode', s.mode, 'status', s.status, 'passed', passed,
    'points', s.points, 'correct', correct, 'total', firsts, 'ms', total_ms,
    'skill', (select name from public.skills where id = s.skill_id),
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

-- Everything the home / path screen needs, with "today" computed in the user's timezone.
create function public.get_home() returns jsonb
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
      'target_score', p.target_score, 'test_date', p.test_date, 'freezes', p.freezes,
      'streak', case when p.last_active >= today - 1 then p.streak
                     when p.last_active = today - 2 and p.freezes > 0 then p.streak else 0 end,
      'done_today', p.last_active = today),
    'today_points', coalesce((select points from public.daily_points where user_id = uid and day = today), 0),
    'due_reviews', (select count(*) from public.review_items where user_id = uid and due <= today),
    'diagnosed', exists (select 1 from public.sessions where user_id = uid and mode = 'diagnostic' and status = 'completed'),
    'skills', (select jsonb_agg(jsonb_build_object(
        'id', k.id, 'name', k.name, 'section', k.section, 'domain_id', k.domain_id, 'domain', k.domain_name, 'share', k.domain_share,
        'mastery', public.p_correct(coalesce(m.theta, 0), 0),
        'passed', coalesce((select jsonb_agg(tier) from public.level_progress l where l.user_id = uid and l.skill_id = k.id), '[]'),
        'counts', coalesce((select jsonb_object_agg(tier, c) from (select tier, count(*) c from public.items i
                  where i.skill_id = k.id and i.status = 'published' group by tier) t), '{}')
      ) order by k.sort)
      from public.skills k left join public.mastery m on m.skill_id = k.id and m.user_id = uid)
  );
end $$;

-- Supabase grants EXECUTE on new functions to anon and authenticated by default; only the RPCs below may be called.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.save_onboarding, public.start_session, public.next_item,
  public.submit_answer, public.complete_session, public.get_home to authenticated;
