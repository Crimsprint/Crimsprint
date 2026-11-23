-- Database-first deployment. RPC arguments, results and grants are unchanged.
begin;

-- Earlier first responses earned credit. NULL preserves that history without backfilling responses.
alter table public.responses add column earned_points smallint check (earned_points between 0 and 2);
create index responses_item_credit_idx on public.responses (user_id, item_id, created_at desc)
  where not is_reask and earned_points is distinct from 0;

create table public.mock_seen_stages (
  mock_id uuid primary key references public.mocks on delete cascade,
  stage int not null
);
alter table public.mock_seen_stages enable row level security;
revoke all on public.mock_seen_stages from public, anon, authenticated;
-- The deployed client may already have an open module and submit it immediately after migration.
insert into public.mock_seen_stages select id, stage from public.mocks where status = 'active';

create or replace function public.next_item(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sessions := public.own_session(p_session);
  it public.items;
  pick uuid;
  total int;
begin
  -- Serialize queue edits with submissions and other item reads.
  select * into s from public.sessions where id = s.id for update;
  if not found or s.status <> 'active' or s.deadline < now() then
    return jsonb_build_object('done', true);
  end if;

  loop
    if s.pos >= cardinality(s.queue) then
      if s.mode <> 'diagnostic' then return jsonb_build_object('done', true); end if;
      pick := public.diag_pick(s);
      if pick is null then return jsonb_build_object('done', true); end if;
      update public.sessions set queue = queue || pick where id = s.id returning * into s;
    end if;

    select * into it from public.items where id = s.queue[s.pos + 1] and status = 'published';
    exit when found;
    update public.sessions set queue = queue[1:pos] || queue[pos + 2:] where id = s.id returning * into s;
  end loop;
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

create or replace function public.on_response() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mode text;
  v_tier text;
  run int;
begin
  if new.is_reask or new.earned_points = 0 then return new; end if;
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

create or replace function public.submit_answer(p_session uuid, p_response text, p_ms int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sessions := public.own_session(p_session);
  uid uuid := s.user_id;
  expected_pos int := s.pos;
  expected_item uuid := s.queue[s.pos + 1];
  it public.items;
  ok boolean;
  reask boolean;
  m public.mastery;
  k float8;
  pts int := 0;
  answered_at timestamptz;
  rv public.review_items;
  today date := public.local_day(uid);
  done boolean;
begin
  select * into s from public.sessions where id = s.id for update;
  if not found then raise exception 'session not found'; end if;
  if s.pos <> expected_pos or s.queue[s.pos + 1] is distinct from expected_item then
    raise exception 'question already changed';
  end if;
  if s.status <> 'active' or s.pos >= cardinality(s.queue) then raise exception 'nothing to answer'; end if;
  if s.deadline + interval '5 seconds' < now() then raise exception 'time is up'; end if;  -- small grace for network lag
  if length(p_response) > 200 then raise exception 'response too long'; end if;
  select * into it from public.items where id = s.queue[s.pos + 1] and status = 'published';
  if not found then raise exception 'question no longer available'; end if;

  ok := case it.kind when 'mcq' then p_response = it.answer->>'choice'
                     else public.spr_correct(p_response, it.answer->'values') end;
  reask := exists (select 1 from public.responses where session_id = s.id and item_id = it.id);
  if not reask then
    -- A learner can see the same item in multiple active sessions.
    perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || it.id::text, 0));
  end if;
  answered_at := clock_timestamp();
  if not reask and not exists (
    select 1 from public.responses
    where user_id = uid and item_id = it.id and not is_reask and earned_points is distinct from 0
      and created_at > answered_at - interval '168 hours'
  ) then
    pts := case when ok then 2 else 1 end;
  end if;
  insert into public.responses (session_id, user_id, item_id, response, correct, ms, is_reask, created_at, earned_points)
  values (s.id, uid, it.id, p_response, ok, least(greatest(p_ms, 0), 3600000), reask, answered_at, pts);

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
  end if;

  if pts > 0 then
    perform public.add_points(uid, pts);
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

create or replace function public.mock_advance_v2(p_mock uuid, p_stage int) returns void
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
  if not found or m.status <> 'active' or m.stage <> p_stage then return; end if;
  today := public.local_day(m.user_id);

  update public.mock_items x set correct = case
      when x.response is null then false
      when i.kind = 'mcq' then x.response = i.answer->>'choice'
      else public.spr_correct(x.response, i.answer->'values') end
  from public.items i where i.id = x.item_id and x.mock_id = m.id and x.stage = m.stage;

  update public.mocks set stage_seconds = stage_seconds
    || least(public.mock_limit(m.stage), extract(epoch from now() - m.stage_started_at)::int)
  where id = m.id;

  if exists (
    select 1 from public.mock_items
    where mock_id = m.id and stage = m.stage and response is not null and not pretest and correct is not null
  ) then
    perform public.add_points(m.user_id, 3 + (select count(*)::int from public.mock_items where mock_id = m.id and stage = m.stage and response is not null));
    perform public.apply_streak(m.user_id, now());
    perform public.bump_quest(m.user_id, 'mock1', 1);
  end if;

  if m.stage in (0, 2) then
    select avg(correct::int) into acc from public.mock_items where mock_id = m.id and stage = m.stage and not pretest;
    route := case when acc >= 0.6 then 'higher' else 'lower' end;  -- College Board's threshold is unpublished
    sec := case when m.stage = 0 then 'rw' else 'math' end;
    update public.mocks set stage = m.stage + 1, stage_started_at = now(), routes = routes || jsonb_build_object(sec, route) where id = m.id;
    perform public.mock_assemble_v2(m.id, m.stage + 1, route);
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
    rw := public.mock_section_score_v2(m.id, array[0, 1]);
    mt := public.mock_section_score_v2(m.id, array[2, 3]);
    select * into m from public.mocks where id = m.id;
    update public.mocks set status = 'completed', completed_at = now(), result = jsonb_build_object(
      'sections', jsonb_build_object(
        'rw', rw || jsonb_build_object('seconds_per_q', (m.stage_seconds[1] + m.stage_seconds[2]) / greatest(1, (select count(*) from public.mock_items where mock_id = m.id and stage < 2))),
        'math', mt || jsonb_build_object('seconds_per_q', (m.stage_seconds[3] + m.stage_seconds[4]) / greatest(1, (select count(*) from public.mock_items where mock_id = m.id and stage >= 2)))),
      'total', jsonb_build_object(
        'estimate', (rw->>'estimate')::int + (mt->>'estimate')::int,
        'low', (rw->>'low')::int + (mt->>'low')::int,
        'high', (rw->>'high')::int + (mt->>'high')::int),
      'routes', m.routes,
      'domains', (select jsonb_agg(jsonb_build_object('domain', d.domain_name, 'correct', d.c, 'total', d.n) order by d.sort)
                  from (select s.domain_name, min(s.sort) sort, count(*) n, count(*) filter (where mi.correct) c
                        from public.mock_items mi join public.items i on i.id = mi.item_id join public.skills s on s.id = i.skill_id
                        where mi.mock_id = m.id group by s.domain_name) d),
      'flagged_wrong', (select count(*) from public.mock_items where mock_id = m.id and flagged and not correct),
      'selection_index', public.psat_selection_index((rw->>'estimate')::int, (mt->>'estimate')::int)
    ) where id = m.id;
    if (select count(distinct stage) from public.mock_items
        where mock_id = m.id and response is not null and not pretest and correct is not null) = 4 then
      perform public.award(m.user_id, 'full_run');
    end if;
  end if;
end $$;

create or replace function public.mock_state_v2(p_mock uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m public.mocks := public.own_mock(p_mock);
begin
  select * into m from public.mocks where id = m.id for update;
  if not found then raise exception 'mock not found'; end if;
  -- Server-side time limit (30 s grace for network lag).
  if m.status = 'active' and now() > m.stage_started_at + make_interval(secs => public.mock_limit(m.stage) + 30) then
    if m.exam_target = 'sat' then
      perform public.mock_advance(m.id);
    else
      perform public.mock_advance_v2(m.id, m.stage);
    end if;
    m := public.own_mock(p_mock);
  end if;
  if m.status = 'active' then
    insert into public.mock_seen_stages (mock_id, stage) values (m.id, m.stage)
    on conflict (mock_id) do update set stage = excluded.stage where mock_seen_stages.stage <> excluded.stage;
  end if;
  return jsonb_build_object(
    'status', m.status,
    'exam_target', m.exam_target,
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

create or replace function public.mock_submit_v2(p_mock uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.mocks := public.own_mock(p_mock);
  preferences text := coalesce(nullif(current_setting('request.headers', true), '')::jsonb->>'prefer', '');
  expected_stage int;
begin
  select * into m from public.mocks where id = m.id for update;
  if not found or m.status <> 'active' then return; end if;

  if preferences like '%crimsprint-mock-stage%' then
    expected_stage := (regexp_match(preferences, '(?:^|,)[[:space:]]*crimsprint-mock-stage=([0-3])[[:space:]]*(?:,|$)'))[1]::int;
  else
    -- The old UI sends only the mock ID. Require a state read for the current module.
    select stage into expected_stage from public.mock_seen_stages where mock_id = m.id;
  end if;
  if m.stage is distinct from expected_stage then return; end if;

  if m.exam_target = 'sat' then
    perform public.mock_advance(m.id);
  else
    perform public.mock_advance_v2(m.id, expected_stage);
  end if;
end $$;

create or replace function public.mock_resume_v2(p_mock uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.mocks := public.own_mock(p_mock);
begin
  update public.mocks set status = 'active', stage_started_at = now()
  where id = m.id and status = 'break';
  if not found then return; end if;
  if m.exam_target = 'sat' then
    perform public.mock_assemble(m.id, 2, null);
  else
    perform public.mock_assemble_v2(m.id, 2, null);
  end if;
end $$;

-- Keep the legacy RPCs working for SAT and dispatch PSAT mocks to the PSAT engine.
create or replace function public.mock_state(p_mock uuid) returns jsonb
language sql security definer set search_path = public as $$
  select public.mock_state_v2(p_mock) - 'exam_target'
$$;

create or replace function public.mock_submit(p_mock uuid) returns void
language sql security definer set search_path = public as $$
  select public.mock_submit_v2(p_mock)
$$;

create or replace function public.mock_resume(p_mock uuid) returns void
language sql security definer set search_path = public as $$
  select public.mock_resume_v2(p_mock)
$$;

commit;
