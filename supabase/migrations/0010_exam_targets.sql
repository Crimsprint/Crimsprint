-- Database-first deployment. Keep legacy RPCs and RLS policies intact.
begin;

-- The shared storage range accepts every score the legacy client could save.
alter table public.profiles
  add column exam_target text not null default 'sat' check (exam_target in ('sat', 'psat')),
  drop constraint profiles_current_score_check,
  drop constraint profiles_target_score_check,
  add constraint profiles_current_score_check check (current_score between 320 and 1600 and current_score % 10 = 0),
  add constraint profiles_target_score_check check (target_score between 320 and 1600 and target_score % 10 = 0);

alter table public.mocks
  add column exam_target text not null default 'sat' check (exam_target in ('sat', 'psat'));

alter table public.mock_items add column pretest boolean not null default false;

-- Estimated PSAT practice mix. Tune with item and learner data. These are app settings.
create function public.psat_difficulty_mix() returns jsonb
language sql immutable set search_path = public as $$
  select '{"lessonHard":3,"mock":{"first":["easy","medium","easy","medium","hard"],"higher":["medium","medium","hard"],"lower":["easy","medium"]}}'::jsonb;
$$;
revoke execute on function public.psat_difficulty_mix() from public, anon, authenticated;

create function public.psat_selection_index(p_rw int, p_math int) returns int
language sql immutable strict set search_path = public as $$
  select (2 * p_rw + p_math) / 10;
$$;
revoke execute on function public.psat_selection_index from public, anon, authenticated;

-- Keep exam-specific validation in the new write RPCs so old clients can save their usual scores.
create function public.validate_exam_scores(p_exam text, p_current int, p_target int) returns void
language plpgsql immutable set search_path = public as $$
declare
  lo int := case when p_exam = 'psat' then 320 else 400 end;
  hi int := case when p_exam = 'psat' then 1520 else 1600 end;
begin
  if p_exam is null or p_exam not in ('sat', 'psat') then raise exception 'invalid exam target'; end if;
  if p_current not between lo and hi or p_current % 10 <> 0 then raise exception 'invalid current score for exam'; end if;
  if p_target not between lo and hi or p_target % 10 <> 0 then raise exception 'invalid target score for exam'; end if;
end $$;

create function public.save_onboarding_v2(
  p_goal text, p_test_date date, p_current int, p_target int, p_daily_goal int, p_timezone text, p_exam_target text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'unknown timezone %', p_timezone;
  end if;
  perform public.validate_exam_scores(p_exam_target, p_current, p_target);
  update public.profiles set exam_target = p_exam_target, goal = p_goal, test_date = p_test_date, current_score = p_current,
    target_score = p_target, daily_goal = p_daily_goal, timezone = p_timezone, onboarded = true
  where id = auth.uid() and not onboarded;
  if not found then raise exception 'already onboarded'; end if;
end $$;

create function public.update_exam_settings(p_goal text, p_test_date date, p_current int, p_target int, p_daily_goal int, p_exam_target text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.validate_exam_scores(p_exam_target, p_current, p_target);
  update public.profiles set exam_target = p_exam_target, goal = p_goal, test_date = p_test_date, current_score = p_current,
    target_score = p_target, daily_goal = p_daily_goal
  where id = auth.uid() and onboarded;
  if not found then raise exception 'finish onboarding first'; end if;
end $$;

create function public.get_league_v2() returns jsonb
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
                  'exam_target', p.exam_target, 'points', public.week_points(o.user_id, lm.week), 'me', o.user_id = uid)
                  order by public.week_points(o.user_id, lm.week) desc, p.handle)
                from public.league_members o
                join public.profiles p on p.id = o.user_id
                join auth.users u on u.id = o.user_id and not u.is_anonymous
                where o.week = lm.week and o.tier = lm.tier and o.cohort = lm.cohort and not p.leagues_opt_out)
  );
end $$;

create function public.start_session_v2(p_mode text, p_skill text default null, p_tier text default null, p_domain text default null,
  p_section text default null, p_pass boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  q uuid[];
  budget int := 5;
  sid uuid;
  today date;
  th float8;
  hard_limit int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_mode is distinct from 'lesson' or not exists (
    select 1 from public.profiles where id = uid and exam_target = 'psat'
  ) then
    return public.start_session(p_mode, p_skill, p_tier, p_domain, p_section, p_pass);
  end if;

  today := public.local_day(uid);
  if p_tier not in ('easy', 'medium', 'hard') then raise exception 'bad tier'; end if;
  if p_tier <> 'easy' and not exists (
    select 1 from public.level_progress where user_id = uid and skill_id = p_skill
      and tier = case p_tier when 'medium' then 'easy' else 'medium' end
  ) then raise exception 'level locked'; end if;
  -- Save the hard-item allowance for hard lessons. Use other due items when available.
  -- Up to 2 due review items from this skill, then fresh items (unseen for 14 days first), 8 total.
  select coalesce(array_agg(item_id), '{}') into q from (
    select r.item_id from public.review_items r join public.items i on i.id = r.item_id
    where r.user_id = uid and i.skill_id = p_skill and r.due <= today and i.status = 'published'
      and i.tier <> 'hard'
    order by r.due limit 2) t;
  if p_tier = 'hard' then
    hard_limit := (public.psat_difficulty_mix()->>'lessonHard')::int;
    select q || coalesce(array_agg(id order by priority, rn), '{}') into q from (
      select id, rn, case
        when tier = 'hard' and rn <= hard_limit then 0
        when tier = 'medium' then 1
        when tier = 'easy' then 2
        else 3 end as priority
      from (
        select i.id, i.tier, row_number() over (partition by i.tier order by
          exists (select 1 from public.responses x where x.user_id = uid and x.item_id = i.id
            and x.created_at > now() - interval '14 days'), random()) as rn
        from public.items i
        where i.skill_id = p_skill and i.status = 'published' and i.id <> all (q)
      ) ranked
      order by priority, rn limit 8 - cardinality(q)
    ) selected;
  else
    select q || coalesce(array_agg(id), '{}') into q from (
      select i.id from public.items i
      where i.skill_id = p_skill and i.tier = p_tier and i.status = 'published' and i.id <> all (q)
      order by exists (select 1 from public.responses x where x.user_id = uid and x.item_id = i.id
                       and x.created_at > now() - interval '14 days'), random()
      limit 8 - cardinality(q)) t;
  end if;

  if cardinality(q) = 0 then raise exception 'no items available'; end if;
  if public.use_item(uid, 'mistake_boost') then budget := budget + 3; end if;
  select theta into th from public.mastery where user_id = uid and skill_id = p_skill;

  insert into public.sessions (user_id, mode, skill_id, tier, queue, mistakes_left, theta_before)
  values (uid, p_mode, p_skill, p_tier, q, budget, coalesce(th, 0))
  returning id into sid;
  return sid;
end $$;

create function public.mock_assemble_v2(p_mock uuid, p_stage int, p_route text) returns void
language plpgsql security definer set search_path = public as $$
declare
  rw boolean := p_stage < 2;
  plan text[][] := case when rw
    then array[['rw.cs', '8'], ['rw.ii', '7'], ['rw.sec', '7'], ['rw.eoi', '5']]
    else array[['math.alg', '8'], ['math.adv', '8'], ['math.psda', '3'], ['math.geo', '3']] end;
  cyc text[] := array(select jsonb_array_elements_text(public.psat_difficulty_mix()->'mock'->coalesce(p_route, 'first')));
  picked uuid[] := '{}';
  pick uuid;
  d int; k int;
begin
  for d in 1 .. array_length(plan, 1) loop
    for k in 0 .. plan[d][2]::int - 1 loop
      select i.id into pick from public.items i join public.skills s on s.id = i.skill_id
      where s.domain_id = plan[d][1] and i.status = 'published' and i.id <> all (picked)
        and not exists (select 1 from public.mock_items x where x.mock_id = p_mock and x.item_id = i.id)
      order by (i.tier = cyc[k % array_length(cyc, 1) + 1]) desc,
        (i.tier = 'hard'), random() limit 1;
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

  -- Keep two unscored slots even when a module is short, as long as at least one item can be scored.
  update public.mock_items set pretest = true
  where mock_id = p_mock and stage = p_stage and position in (
    select position from public.mock_items
    where mock_id = p_mock and stage = p_stage
    order by random() limit least(2, greatest(0, cardinality(picked) - 1))
  );
end $$;

create function public.start_mock_v2() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  exam text;
  mid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select exam_target into exam from public.profiles where id = uid;
  if exam is distinct from 'psat' then return public.start_mock(); end if;
  insert into public.mocks (user_id, exam_target) values (uid, exam) returning id into mid;
  perform public.mock_assemble_v2(mid, 0, null);
  return mid;
end $$;

create function public.mock_section_score_v2(p_mock uuid, p_stages int[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  th float8 := 0; g float8; h float8; it int;
  lo constant int := 160;
  hi constant int := 760;
  n int; c int; est int;
begin
  for it in 1 .. 25 loop
    select coalesce(sum(coalesce(x.correct, false)::int - public.p_correct(th, i.b)), 0) - th,
           -coalesce(sum(public.p_correct(th, i.b) * (1 - public.p_correct(th, i.b))), 0) - 1
      into g, h
    from public.mock_items x join public.items i on i.id = x.item_id
    where x.mock_id = p_mock and x.stage = any (p_stages) and not x.pretest;
    th := th - g / h;
  end loop;
  select count(*), count(*) filter (where x.correct) into n, c from public.mock_items x where x.mock_id = p_mock and x.stage = any (p_stages) and not x.pretest;
  est := least(hi, greatest(lo, round((500 + 100 * th) / 10) * 10));
  return jsonb_build_object('estimate', est, 'low', greatest(lo, est - 30), 'high', least(hi, est + 30), 'correct', c, 'total', n, 'theta', th);
end $$;

create function public.mock_advance_v2(p_mock uuid, p_stage int) returns void
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
  if m.status <> 'active' or m.stage <> p_stage then return; end if;
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
    perform public.award(m.user_id, 'full_run');
  end if;
end $$;

create function public.mock_submit_v2(p_mock uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.mocks := public.own_mock(p_mock);
begin
  if m.exam_target = 'sat' then
    perform public.mock_submit(p_mock);
  else
    perform public.mock_advance_v2(m.id, m.stage);
  end if;
end $$;

create function public.mock_resume_v2(p_mock uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.mocks := public.own_mock(p_mock);
begin
  if m.exam_target = 'sat' then
    perform public.mock_resume(p_mock);
    return;
  end if;
  update public.mocks set status = 'active', stage_started_at = now()
  where id = m.id and status = 'break';
  if found then perform public.mock_assemble_v2(m.id, 2, null); end if;
end $$;

create function public.mock_state_v2(p_mock uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m public.mocks := public.own_mock(p_mock);
begin
  if m.exam_target = 'sat' then
    return public.mock_state(p_mock) || jsonb_build_object('exam_target', m.exam_target);
  end if;
  -- Server-side time limit (30 s grace for network lag): an expired module is submitted as is.
  if m.status = 'active' and now() > m.stage_started_at + make_interval(secs => public.mock_limit(m.stage) + 30) then
    perform public.mock_advance_v2(m.id, m.stage);
    m := public.own_mock(p_mock);
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

create function public.get_progress_v2() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  base jsonb := public.get_progress();
begin
  return base || jsonb_build_object(
    'exam_target', (select exam_target from public.profiles where id = uid),
    'mocks', (select jsonb_agg(jsonb_build_object(
      'id', id, 'completed_at', completed_at, 'total', result->'total', 'exam_target', exam_target) order by completed_at)
      from public.mocks where user_id = uid and status = 'completed')
  );
end $$;

-- Revoke API execution for internal helpers and grant only the new owner-scoped entry points.
revoke execute on function
  public.validate_exam_scores(text, int, int), public.mock_assemble_v2(uuid, int, text),
  public.mock_section_score_v2(uuid, int[]), public.mock_advance_v2(uuid, int)
from public, anon, authenticated;

revoke execute on function
  public.save_onboarding_v2(text, date, int, int, int, text, text),
  public.update_exam_settings(text, date, int, int, int, text),
  public.get_league_v2(), public.start_session_v2(text, text, text, text, text, boolean),
  public.start_mock_v2(), public.mock_state_v2(uuid),
  public.mock_submit_v2(uuid), public.mock_resume_v2(uuid), public.get_progress_v2()
from public, anon;

grant execute on function
  public.save_onboarding_v2(text, date, int, int, int, text, text),
  public.update_exam_settings(text, date, int, int, int, text),
  public.get_league_v2(), public.start_session_v2(text, text, text, text, text, boolean),
  public.start_mock_v2(), public.mock_state_v2(uuid),
  public.mock_submit_v2(uuid), public.mock_resume_v2(uuid), public.get_progress_v2()
to authenticated;

commit;
