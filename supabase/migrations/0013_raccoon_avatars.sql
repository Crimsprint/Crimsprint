-- Database-first rollout. Keep inventory, legacy RPCs, and paid IDs and prices.
begin;

create or replace function public.avatar_catalog() returns table (item text, layer text, price int)
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
    ('style_ears', 'furStyle', 0),
    ('style_cheeks', 'furStyle', 0),
    ('style_tuft', 'furStyle', 0),
    ('style_sleek', 'furStyle', 0),
    ('style_messy', 'furStyle', 0),
    ('style_curl', 'furStyle', 0),
    ('face_smile', 'face', 0),
    ('face_grin', 'face', 0),
    ('face_wink', 'face', 0),
    ('face_calm', 'face', 0),
    ('face_spark', 'face', 0),
    ('fur_gray', 'fur', 0),
    ('fur_charcoal', 'fur', 0),
    ('fur_cream', 'fur', 0),
    ('fur_cinnamon', 'fur', 0),
    ('fur_frost', 'fur', 0),
    ('fur_midnight', 'fur', 0),
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
    ('eye_sunglasses', 'eyewear', 120),
    ('glasses', 'eyewear', 60),
    ('eye_visor', 'eyewear', 50),
    ('eye_stars', 'eyewear', 300),
    ('effect_sparkle', 'effect', 50),
    ('effect_study_flame', 'effect', 120),
    ('effect_crimson', 'effect', 300),
    ('effect_galaxy', 'effect', 700),
    ('acc_backpack', 'accessory', 120),
    ('acc_pencil', 'accessory', 50),
    ('acc_scarf', 'accessory', 120),
    ('acc_keychain', 'accessory', 300),
    ('bowtie', 'accessory', 40),
    ('bg_library', 'background', 300),
    ('bg_classroom', 'background', 50),
    ('bg_rooftop', 'background', 120),
    ('bg_crimson', 'background', 700)
$$;

-- Accept 0012 outfits during rollout. Reads of already saved 0012 JSON are mapped by the client.
-- effect_champion is reserved for a future crown award and has no catalog entry.
create or replace function public.set_avatar_outfit(p_outfit jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  normalized jsonb := p_outfit;
  mapped text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(normalized) is distinct from 'object' or octet_length(normalized::text) > 512 then
    raise exception 'invalid outfit';
  end if;
  if normalized ? 'skin' then
    mapped := case normalized->>'skin'
      when 'skin_pearl' then 'fur_frost'
      when 'skin_peach' then 'fur_gray'
      when 'skin_sand' then 'fur_cream'
      when 'skin_amber' then 'fur_cinnamon'
      when 'skin_cocoa' then 'fur_charcoal'
      when 'skin_umber' then 'fur_midnight'
    end;
    if mapped is null or normalized ? 'fur' then raise exception 'invalid coat'; end if;
    normalized := (normalized - 'skin') || jsonb_build_object('fur', mapped);
  end if;
  if normalized ? 'hair' then
    mapped := case normalized->>'hair'
      when 'hair_crop' then 'style_tuft'
      when 'hair_bob' then 'style_cheeks'
      when 'hair_curls' then 'style_curl'
      when 'hair_bangs' then 'style_ears'
      when 'hair_buns' then 'style_ears'
      when 'hair_quiff' then 'style_tuft'
      when 'hair_buzz' then 'style_sleek'
      when 'hair_pony' then 'style_messy'
    end;
    if mapped is null or normalized ? 'furStyle' then raise exception 'invalid fur style'; end if;
    normalized := (normalized - 'hair') || jsonb_build_object('furStyle', mapped);
  end if;
  if normalized ? 'hairColor' then
    if jsonb_typeof(normalized->'hairColor') is distinct from 'string'
       or (normalized->>'hairColor') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid hair color'; end if;
    normalized := normalized - 'hairColor';
  end if;
  if normalized->>'accessory' = 'glasses' then
    if normalized ? 'eyewear' then raise exception 'invalid eyewear'; end if;
    normalized := (normalized - 'accessory') || '{"eyewear":"glasses"}'::jsonb;
  end if;

  if not (normalized ?& array['fur','bottoms','shoes','top','face','furStyle']) or exists (
    select 1 from jsonb_each_text(normalized) part(layer, item)
    left join public.avatar_catalog() a on a.item = part.item and a.layer = part.layer
    where a.item is null
  ) then raise exception 'invalid avatar item or layer'; end if;
  if exists (
    select 1 from jsonb_each_text(normalized) part(layer, item)
    join public.avatar_catalog() a on a.item = part.item and a.layer = part.layer
    where a.price > 0 and not exists (
      select 1 from public.inventory i where i.user_id = uid and i.item = a.item and i.qty > 0
    )
  ) then raise exception 'avatar item not owned'; end if;

  update public.profiles set outfit = normalized where id = uid;
  if not found then raise exception 'profile not found'; end if;
end $$;

commit;
