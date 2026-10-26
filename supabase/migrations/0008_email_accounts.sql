-- Email + password accounts only. Anonymous accounts get no profile (so nothing else can be written for them) and never
-- appear on leaderboards; anonymous sign-ins are also switched off in Supabase Auth. Every new learner gets a public
-- display name "Learner" + 4 random digits, changeable on /profile. The email is never shown to anyone else.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_anonymous then return new; end if;
  insert into public.profiles (id, handle, display_name)
  values (new.id, 'learner-' || substr(md5(new.id::text), 1, 8), 'Learner ' || lpad(floor(random() * 10000)::int::text, 4, '0'))
  on conflict do nothing;
  return new;
end $$;

update public.profiles set display_name = 'Learner ' || lpad(floor(random() * 10000)::int::text, 4, '0') where display_name is null;

-- Leaderboard rows carry only a display name, an avatar and weekly points (plus which row is yours).
-- A security-definer function rather than a view: profiles are readable only by their owner, and Supabase flags
-- security-definer views as a security error.
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
                where o.week = lm.week and o.tier = lm.tier and o.cohort = lm.cohort)
  );
end $$;

-- A blank display name goes back to a random "Learner 1234" instead of empty.
create or replace function public.set_profile(p_name text, p_avatar text, p_accessory text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_accessory is not null and not exists (select 1 from public.inventory where user_id = uid and item = p_accessory and qty > 0) then
    raise exception 'accessory not owned';
  end if;
  -- The column checks validate the name (3–20 letters, digits, spaces, . _ -) and the avatar.
  update public.profiles
     set display_name = coalesce(nullif(btrim(p_name), ''), 'Learner ' || lpad(floor(random() * 10000)::int::text, 4, '0')),
         avatar = p_avatar, accessory = p_accessory
   where id = uid;
end $$;
