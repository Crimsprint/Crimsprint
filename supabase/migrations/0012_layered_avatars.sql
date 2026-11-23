-- Database first. Legacy color and accessory fields, inventory IDs, and RPC signatures still work.
begin;

-- NULL keeps rendering the legacy selection until the learner saves their first layered outfit.
alter table public.profiles add column outfit jsonb;

create function public.avatar_catalog() returns table (item text, layer text, price int)
language sql immutable set search_path = '' as $$
  values
    ('top_hoodie', 'top', 50),
    ('top_sweater', 'top', 50),
    ('top_rugby', 'top', 50),
    ('top_sweater_vest', 'top', 120),
    ('top_striped_tee', 'top', 50),
    ('top_tee', 'top', 0),
    ('outer_varsity', 'outerwear', 300),
    ('outer_blazer', 'outerwear', 120),
    ('hair_crop', 'hair', 0),
    ('hair_bob', 'hair', 0),
    ('hair_curls', 'hair', 0),
    ('hair_bangs', 'hair', 0),
    ('hair_buns', 'hair', 0),
    ('hair_quiff', 'hair', 0),
    ('hair_buzz', 'hair', 0),
    ('hair_pony', 'hair', 0),
    ('face_smile', 'face', 0),
    ('face_grin', 'face', 0),
    ('face_wink', 'face', 0),
    ('face_calm', 'face', 0),
    ('face_spark', 'face', 0),
    ('skin_pearl', 'skin', 0),
    ('skin_peach', 'skin', 0),
    ('skin_sand', 'skin', 0),
    ('skin_amber', 'skin', 0),
    ('skin_cocoa', 'skin', 0),
    ('skin_umber', 'skin', 0),
    ('bottom_denim', 'bottoms', 50),
    ('bottom_chinos', 'bottoms', 50),
    ('bottom_pleats', 'bottoms', 120),
    ('bottom_shorts', 'bottoms', 50),
    ('bottom_joggers', 'bottoms', 0),
    ('shoes_high', 'shoes', 50),
    ('shoes_loafers', 'shoes', 120),
    ('shoes_boots', 'shoes', 300),
    ('shoes_track', 'shoes', 50),
    ('shoes_canvas', 'shoes', 0),
    ('hat_beanie', 'headwear', 50),
    ('hat_cap', 'headwear', 50),
    ('cap', 'headwear', 100),
    ('hat_headphones', 'headwear', 300),
    ('hat_bucket', 'headwear', 120),
    ('acc_backpack', 'accessory', 120),
    ('glasses', 'accessory', 60),
    ('acc_pencil', 'accessory', 50),
    ('acc_scarf', 'accessory', 120),
    ('acc_keychain', 'accessory', 300),
    ('bowtie', 'accessory', 40),
    ('bg_library', 'background', 300),
    ('bg_classroom', 'background', 50),
    ('bg_rooftop', 'background', 120),
    ('bg_crimson', 'background', 700)
$$;

-- Existing paid accessory IDs stay in inventory and retain their original prices.
-- The existing buy_item path treats every paid avatar item as a one-time purchase.
create or replace function public.shop_catalog() returns table (item text, price int, kind text)
language sql immutable set search_path = '' as $$
  select * from (values ('streak_freeze', 50, 'freeze'),
                        ('mistake_boost', 15, 'consumable'),
                        ('timer_pass', 25, 'consumable')) powerups
  union all
  select a.item, a.price, 'accessory' from public.avatar_catalog() a where a.price > 0
$$;

create function public.set_avatar_outfit(p_outfit jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(p_outfit) is distinct from 'object' or octet_length(p_outfit::text) > 512 then
    raise exception 'invalid outfit';
  end if;
  if not (p_outfit ?& array['skin','bottoms','shoes','top','face','hair','hairColor'])
     or jsonb_typeof(p_outfit->'hairColor') is distinct from 'string'
     or (p_outfit->>'hairColor') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid outfit';
  end if;
  if exists (
    select 1 from jsonb_each_text(p_outfit - 'hairColor') part(layer, item)
    left join public.avatar_catalog() a on a.item = part.item and a.layer = part.layer
    where a.item is null
  ) then raise exception 'invalid avatar item or layer'; end if;
  if exists (
    select 1 from jsonb_each_text(p_outfit - 'hairColor') part(layer, item)
    join public.avatar_catalog() a on a.item = part.item and a.layer = part.layer
    where a.price > 0 and not exists (
      select 1 from public.inventory i where i.user_id = uid and i.item = a.item and i.qty > 0
    )
  ) then raise exception 'avatar item not owned'; end if;
  update public.profiles set outfit = p_outfit where id = uid;
  if not found then raise exception 'profile not found'; end if;
end $$;

-- Editing a name should never overwrite either version of the avatar.
create function public.set_display_name(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  saved_name text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.profiles
     set display_name = coalesce(nullif(btrim(p_name), ''), 'Learner ' || lpad(floor(random() * 10000)::int::text, 4, '0'))
   where id = uid returning display_name into saved_name;
  return saved_name;
end $$;

revoke execute on function public.avatar_catalog() from public, anon, authenticated;
-- shop_catalog is read via the existing security-definer profile and purchase RPCs.
revoke execute on function public.set_avatar_outfit(jsonb), public.set_display_name(text) from public, anon, authenticated;
grant execute on function public.set_avatar_outfit(jsonb), public.set_display_name(text) to authenticated;

create or replace function public.get_profile() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
begin
  select * into p from public.profiles where id = uid;
  if not found then raise exception 'not signed in'; end if;
  return jsonb_build_object(
    'display_name', p.display_name, 'handle', p.handle, 'avatar', p.avatar, 'accessory', p.accessory, 'outfit', p.outfit,
    'joined', p.created_at, 'coins', p.coins, 'freezes', p.freezes, 'streak', p.streak, 'longest_streak', p.longest_streak,
    'total_points', (select coalesce(sum(points), 0) from public.daily_points where user_id = uid),
    'league', case when p.leagues_opt_out then null else (array['Pencil', 'Notebook', 'Compass', 'Protractor', 'Summit'])[p.league_tier] end,
    'inventory', coalesce((select jsonb_object_agg(item, qty) from public.inventory where user_id = uid and qty > 0), '{}'),
    'prices', (select jsonb_object_agg(item, price) from public.shop_catalog()),
    'achievements', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'earned_at', earned_at) order by earned_at)
                              from public.achievements where user_id = uid), '[]')
  );
end $$;

create or replace function public.get_league_v2() returns jsonb
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
                  'name', coalesce(p.display_name, 'Learner'), 'avatar', p.avatar, 'accessory', p.accessory, 'outfit', p.outfit,
                  'exam_target', p.exam_target, 'points', public.week_points(o.user_id, lm.week), 'me', o.user_id = uid)
                  order by public.week_points(o.user_id, lm.week) desc, p.handle)
                from public.league_members o
                join public.profiles p on p.id = o.user_id
                join auth.users u on u.id = o.user_id and not u.is_anonymous
                where o.week = lm.week and o.tier = lm.tier and o.cohort = lm.cohort and not p.leagues_opt_out)
  );
end $$;

commit;
