-- Google sign-in only: anonymous accounts get no profile (so nothing else can be written for them) and never appear on
-- leaderboards. Anonymous sign-ins are also switched off in Supabase Auth; this guards accounts that already exist.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_anonymous then return new; end if;
  insert into public.profiles (id, handle) values (new.id, 'learner-' || substr(md5(new.id::text), 1, 8)) on conflict do nothing;
  return new;
end $$;

-- Leaderboard rows carry only a display name, an avatar and weekly points (plus which row is yours). A learner with no
-- display name shows as "Learner" and four characters of their pseudonymous handle, never their Google name.
-- Kept as a security-definer function rather than a view: profiles are only readable by their owner, and Supabase
-- flags security-definer views as a security error.
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
                  'name', coalesce(p.display_name, 'Learner ' || upper(substr(p.handle, 9, 4))),
                  'avatar', p.avatar, 'accessory', p.accessory, 'points', public.week_points(o.user_id, lm.week), 'me', o.user_id = uid)
                  order by public.week_points(o.user_id, lm.week) desc, p.handle)
                from public.league_members o
                join public.profiles p on p.id = o.user_id
                join auth.users u on u.id = o.user_id and not u.is_anonymous
                where o.week = lm.week and o.tier = lm.tier and o.cohort = lm.cohort)
  );
end $$;
