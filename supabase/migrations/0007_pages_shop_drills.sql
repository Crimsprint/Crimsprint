-- Section 4: profile (display name, avatar, longest streak), weekly quests and Coin rewards, the Coins shop,
-- timed drills and "review every mistake". Every change is additive for existing callers.

-- ───────────── profile ─────────────

alter table public.profiles
  add column display_name text check (display_name ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,18}[A-Za-z0-9]$'),
  add column avatar text not null default 'crimson' check (avatar in ('crimson', 'slate', 'chocolate', 'green', 'ink', 'putty')),
  add column accessory text check (accessory in ('cap', 'glasses', 'bowtie')),
  add column longest_streak int not null default 0;
update public.profiles set longest_streak = streak;

create function public.track_longest_streak() returns trigger
language plpgsql set search_path = public as $$
begin
  new.longest_streak := greatest(new.longest_streak, new.streak);
  return new;
end $$;
create trigger track_longest_streak before update of streak on public.profiles for each row execute function public.track_longest_streak();

-- ───────────── shop ─────────────

create table public.inventory (
  user_id uuid not null references public.profiles on delete cascade,
  item text not null,
  qty int not null check (qty >= 0),
  primary key (user_id, item)
);
alter table public.inventory enable row level security;
create policy own_read on public.inventory for select to authenticated using (user_id = auth.uid());

-- Prices in Coins. Consumables stack to 3; accessories are owned once; freezes live on profiles (max 2).
create function public.shop_catalog() returns table (item text, price int, kind text)
language sql immutable set search_path = '' as $$
  values ('streak_freeze', 50, 'freeze'),
         ('mistake_boost', 15, 'consumable'),  -- +3 mistakes on the next lesson
         ('timer_pass', 25, 'consumable'),     -- +50% time on the next timed drill
         ('cap', 100, 'accessory'),
         ('glasses', 60, 'accessory'),
         ('bowtie', 40, 'accessory')
$$;

create function public.buy_item(p_item text) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c record;
  p public.profiles;
  held int;
  balance int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into c from public.shop_catalog() where item = p_item;
  if not found then raise exception 'unknown item'; end if;
  select * into p from public.profiles where id = uid for update;
  if p.coins < c.price then raise exception 'not enough coins'; end if;
  select coalesce((select qty from public.inventory where user_id = uid and item = p_item), 0) into held;
  if c.kind = 'freeze' then
    if p.freezes >= 2 then raise exception 'you already hold 2 streak freezes'; end if;
    update public.profiles set freezes = freezes + 1 where id = uid;
  elsif c.kind = 'consumable' and held >= 3 then raise exception 'you can hold up to 3';
  elsif c.kind = 'accessory' and held >= 1 then raise exception 'already owned';
  end if;
  if c.kind <> 'freeze' then
    insert into public.inventory values (uid, p_item, 1) on conflict (user_id, item) do update set qty = inventory.qty + 1;
  end if;
  update public.profiles set coins = coins - c.price where id = uid returning coins into balance;
  return balance;
end $$;

-- Uses one of an inventory item if the learner has it.
create function public.use_item(p_user uuid, p_item text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.inventory set qty = qty - 1 where user_id = p_user and item = p_item and qty > 0;
  return found;
end $$;

create function public.set_profile(p_name text, p_avatar text, p_accessory text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_accessory is not null and not exists (select 1 from public.inventory where user_id = uid and item = p_accessory and qty > 0) then
    raise exception 'accessory not owned';
  end if;
  -- The column checks validate the name (3–20 letters, digits, spaces, . _ -) and the avatar.
  update public.profiles set display_name = nullif(btrim(p_name), ''), avatar = p_avatar, accessory = p_accessory where id = uid;
end $$;

create function public.get_profile() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
begin
  select * into p from public.profiles where id = uid;
  if not found then raise exception 'not signed in'; end if;
  return jsonb_build_object(
    'display_name', p.display_name, 'handle', p.handle, 'avatar', p.avatar, 'accessory', p.accessory,
    'joined', p.created_at, 'coins', p.coins, 'freezes', p.freezes, 'streak', p.streak, 'longest_streak', p.longest_streak,
    'total_points', (select coalesce(sum(points), 0) from public.daily_points where user_id = uid),
    'league', case when p.leagues_opt_out then null else (array['Pencil', 'Notebook', 'Compass', 'Protractor', 'Summit'])[p.league_tier] end,
    'inventory', coalesce((select jsonb_object_agg(item, qty) from public.inventory where user_id = uid and qty > 0), '{}'),
    'prices', (select jsonb_object_agg(item, price) from public.shop_catalog()),
    'achievements', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'earned_at', earned_at) order by earned_at)
                              from public.achievements where user_id = uid), '[]')
  );
end $$;

-- Leaderboards show the chosen display name (or the anonymous handle) and avatar.
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
    'members', (select jsonb_agg(jsonb_build_object('handle', p.handle, 'name', coalesce(p.display_name, p.handle),
                  'avatar', p.avatar, 'accessory', p.accessory, 'points', public.week_points(o.user_id, lm.week), 'me', o.user_id = uid)
                  order by public.week_points(o.user_id, lm.week) desc, p.handle)
                from public.league_members o join public.profiles p on p.id = o.user_id
                where o.week = lm.week and o.tier = lm.tier and o.cohort = lm.cohort)
  );
end $$;

-- ───────────── quests: Coin rewards and weekly quests ─────────────

-- Daily quests now also pay 5 Coins (and still 5 points).
create or replace function public.bump_quest(p_user uuid, p_code text, p_amount int, p_max boolean default false) returns void
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
    update public.profiles set coins = coins + 5 where id = p_user;
  end if;
end $$;

create table public.weekly_quests (
  user_id uuid not null references public.profiles on delete cascade,
  week date not null,  -- league week: Monday 00:00 UTC
  code text not null,
  target int not null,
  progress int not null default 0,
  done boolean not null default false,
  primary key (user_id, week, code)
);
alter table public.weekly_quests enable row level security;
create policy own_read on public.weekly_quests for select to authenticated using (user_id = auth.uid());

create function public.weekly_pool() returns table (code text, title text, target int)
language sql immutable set search_path = '' as $$
  values ('points150', 'Earn 150 points', 150),
         ('lessons8', 'Finish 8 lessons', 8),
         ('practice3', 'Complete 3 practice sessions', 3)
$$;

-- Adds to this week's progress on a quest; 30 Coins when it completes.
create function public.bump_weekly(p_user uuid, p_code text, p_amount int) returns void
language plpgsql security definer set search_path = public as $$
declare
  wk date := public.week_start();
  q public.weekly_quests;
begin
  insert into public.weekly_quests (user_id, week, code, target)
  select p_user, wk, w.code, w.target from public.weekly_pool() w on conflict do nothing;
  update public.weekly_quests set progress = least(target, progress + p_amount)
   where user_id = p_user and week = wk and code = p_code and not done
  returning * into q;
  if found and q.progress >= q.target then
    update public.weekly_quests set done = true where user_id = p_user and week = wk and code = p_code;
    update public.profiles set coins = coins + 30 where id = p_user;
  end if;
end $$;

create function public.on_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare gained int := new.points - case when tg_op = 'UPDATE' then old.points else 0 end;
begin
  if gained > 0 then perform public.bump_weekly(new.user_id, 'points150', gained); end if;
  return new;
end $$;
create trigger on_points after insert or update of points on public.daily_points for each row execute function public.on_points();

create function public.on_session_weekly() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (old.status = 'active' and new.status = 'completed') then return new; end if;
  if new.mode = 'lesson' then perform public.bump_weekly(new.user_id, 'lessons8', 1);
  elsif new.mode in ('weak', 'review', 'unit_practice', 'drill', 'mistakes') then perform public.bump_weekly(new.user_id, 'practice3', 1);
  end if;
  return new;
end $$;
create trigger on_session_weekly after update of status on public.sessions for each row execute function public.on_session_weekly();

create function public.get_weekly_quests() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  wk date := public.week_start();
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.weekly_quests (user_id, week, code, target)
  select uid, wk, w.code, w.target from public.weekly_pool() w on conflict do nothing;
  return jsonb_build_object('week_end', wk + 7, 'quests',
    (select jsonb_agg(jsonb_build_object('code', q.code, 'title', w.title, 'target', q.target, 'progress', q.progress, 'done', q.done) order by w.target)
     from public.weekly_quests q join public.weekly_pool() w on w.code = q.code where q.user_id = uid and q.week = wk));
end $$;

-- ───────────── practice: timed drills and review-every-mistake ─────────────

alter table public.sessions add column deadline timestamptz;
alter table public.sessions drop constraint sessions_mode_check;
alter table public.sessions add constraint sessions_mode_check
  check (mode in ('lesson', 'diagnostic', 'review', 'testout', 'weak', 'unit_practice', 'unit_test', 'drill', 'mistakes'));

-- Items whose latest answer from this learner is wrong (mock tests are scored separately and not included).
create function public.missed_items(p_user uuid) returns table (item_id uuid, missed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.item_id, l.created_at from (
    select distinct on (r.item_id) r.item_id, r.correct, r.created_at from public.responses r
    where r.user_id = p_user order by r.item_id, r.id desc) l
  join public.items i on i.id = l.item_id
  where not l.correct and i.status = 'published'
$$;

create function public.get_practice() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  return jsonb_build_object(
    'due_reviews', (select count(*) from public.review_items where user_id = uid and due <= public.local_day(uid)),
    'mistakes', (select count(*) from public.missed_items(uid)),
    'timer_passes', coalesce((select qty from public.inventory where user_id = uid and item = 'timer_pass'), 0));
end $$;

drop function public.start_session(text, text, text, text);
create function public.start_session(p_mode text, p_skill text default null, p_tier text default null, p_domain text default null,
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
  -- A mistake boost from the shop adds 3 to the next lesson's budget.
  if p_mode = 'lesson' and public.use_item(uid, 'mistake_boost') then budget := budget + 3; end if;
  select theta into th from public.mastery where user_id = uid and skill_id = p_skill;

  insert into public.sessions (user_id, mode, skill_id, tier, domain_id, queue, mistakes_left, theta_before, deadline)
  values (uid, p_mode, p_skill, p_tier, case when p_mode like 'unit_%' then p_domain end, q, budget, coalesce(th, 0), ends_at)
  returning id into sid;
  return sid;
end $$;

-- next_item and submit_answer from 0001, plus: the drill deadline, and review-every-mistake requeues a miss every time (capped at 45 items).
create or replace function public.next_item(p_session uuid) returns jsonb
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

-- From 0006, plus: a drill can be completed once its time is up, and the summary reports how many were planned.
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
  if s.status = 'active' and s.pos < cardinality(s.queue) and not coalesce(s.deadline < now(), false) then raise exception 'session not finished'; end if;
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
    'planned', (select count(distinct q) from unnest(s.queue) q),
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

-- See 0001: re-grant only the RPCs, since this revoke also covers earlier functions.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.save_onboarding, public.start_session, public.next_item,
  public.submit_answer, public.complete_session, public.get_home, public.claim_chest,
  public.get_profile, public.set_profile, public.buy_item, public.get_weekly_quests, public.get_practice to authenticated;
grant execute on function public.get_quests, public.get_league, public.set_leagues_opt_out,
  public.start_mock, public.mock_state, public.mock_answer, public.mock_flag, public.mock_submit, public.mock_resume, public.mock_review,
  public.get_progress, public.report_item,
  public.admin_items, public.admin_save_item, public.admin_reports, public.admin_resolve_report to authenticated;
