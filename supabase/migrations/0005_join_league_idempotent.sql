-- join_league raced when called twice at once (duplicate key on league_members). Make the insert idempotent.
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
  -- Concurrent calls (double-mounted effects, double taps) may race here; the first insert wins.
  insert into public.league_members values (p_user, wk, t, c) on conflict (user_id, week) do nothing;
  select * into lm from public.league_members where user_id = p_user and week = wk;
  return lm;
end $$;
revoke execute on function public.join_league(uuid, timestamptz) from public, anon, authenticated;
