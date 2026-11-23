export const LAYERS = ['background', 'skin', 'bottoms', 'shoes', 'top', 'outerwear', 'face', 'hair', 'headwear', 'accessory', 'effect'] as const
export type Layer = (typeof LAYERS)[number]
export type Outfit = Partial<Record<Layer, string>> & { hairColor?: string }
export type AvatarSource = { avatar?: string; accessory?: string | null; outfit?: Outfit | null }

export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const
type Rarity = (typeof RARITIES)[number]
export type AvatarItem = { id: string; layer: Layer; name: string; rarity: Rarity; color?: string; free: boolean }

type ItemEntry = [id: string, name: string, rarity?: Rarity, color?: string]
function items(layer: Layer, entries: ItemEntry[]): AvatarItem[] {
  return entries.map(([id, name, rarity, color]) => ({ id, layer, name, rarity: rarity ?? 'common', color, free: !rarity }))
}

// Newest first within each category. Prices for paid items come from get_profile.
export const CATALOG = [
  ...items('top', [
    ['top_hoodie', 'Campus Hoodie', 'common', '#a64456'],
    ['top_sweater', 'Cable-Knit Sweater', 'common', '#dcaa5c'],
    ['top_rugby', 'Rugby Polo', 'common', '#53888a'],
    ['top_sweater_vest', 'Debate Club Vest', 'rare', '#8066a0'],
    ['top_striped_tee', 'Studio Stripe Tee', 'common', '#6485b2'],
    ['top_tee', 'Everyday Tee', undefined, '#e7af79'],
  ]),
  ...items('outerwear', [
    ['outer_varsity', 'Varsity Jacket', 'epic', '#783951'],
    ['outer_blazer', 'School Blazer', 'rare', '#455c82'],
  ]),
  ...items('hair', [
    ['hair_crop', 'Side Sweep'], ['hair_bob', 'Pageboy Bob'], ['hair_curls', 'Cloud Curls'], ['hair_bangs', 'Soft Fringe'],
    ['hair_buns', 'Double Buns'], ['hair_quiff', 'High Quiff'], ['hair_buzz', 'Close Crop'], ['hair_pony', 'Side Ponytail'],
  ]),
  ...items('face', [
    ['face_smile', 'Easy Smile'], ['face_grin', 'Big Grin'], ['face_wink', 'Wink'],
    ['face_calm', 'Quiet Focus'], ['face_spark', 'Bright Eyes'],
  ]),
  ...items('skin', [
    ['skin_pearl', 'Pearl', undefined, '#ffe2cb'], ['skin_peach', 'Peach', undefined, '#f4c6a4'],
    ['skin_sand', 'Sand', undefined, '#dca37b'], ['skin_amber', 'Amber', undefined, '#b97752'],
    ['skin_cocoa', 'Cocoa', undefined, '#90573e'], ['skin_umber', 'Umber', undefined, '#633c31'],
  ]),
  ...items('bottoms', [
    ['bottom_denim', 'Cuffed Denim', 'common', '#6583aa'], ['bottom_chinos', 'Field Chinos', 'common', '#bd9264'],
    ['bottom_pleats', 'Box-Pleat Skirt', 'rare', '#66618e'], ['bottom_shorts', 'Track Shorts', 'common', '#47866e'],
    ['bottom_joggers', 'Everyday Joggers', undefined, '#58536b'],
  ]),
  ...items('shoes', [
    ['shoes_high', 'Court High-Tops', 'common', '#b24d55'], ['shoes_loafers', 'Library Loafers', 'rare', '#6f444a'],
    ['shoes_boots', 'Rooftop Boots', 'epic', '#4b666d'], ['shoes_track', 'Relay Runners', 'common', '#5c8c7d'],
    ['shoes_canvas', 'Canvas Sneakers', undefined, '#f3e0bc'],
  ]),
  ...items('headwear', [
    ['hat_beanie', 'Ribbed Beanie', 'common', '#ca8155'], ['hat_cap', 'Campus Cap', 'common', '#598a79'],
    ['cap', 'Graduation Cap', 'rare', '#38364d'], ['hat_headphones', 'Study Headphones', 'epic', '#9d6297'],
    ['hat_bucket', 'Field Bucket Hat', 'rare', '#e2bb7b'],
  ]),
  ...items('accessory', [
    ['acc_backpack', 'Bookbag', 'rare', '#58877c'], ['glasses', 'Reading Glasses', 'common', '#625070'],
    ['acc_pencil', 'Giant Pencil', 'common', '#f4bd5e'], ['acc_scarf', 'Study Scarf', 'rare', '#763c51'],
    ['acc_keychain', 'Raccoon-Tail Keychain', 'epic', '#887481'], ['bowtie', 'Bow Tie', 'common', '#a64456'],
  ]),
  ...items('background', [
    ['bg_library', 'After-Hours Library', 'epic'], ['bg_classroom', 'Sunlit Classroom', 'common'],
    ['bg_rooftop', 'Rooftop at Dusk', 'rare'], ['bg_crimson', 'Crimson Horizon', 'legendary'],
  ]),
]

export const ITEMS = new Map(CATALOG.map((item) => [item.id, item]))
export const DEFAULT_OUTFIT = {
  skin: 'skin_peach', bottoms: 'bottom_joggers', shoes: 'shoes_canvas', top: 'top_tee',
  face: 'face_smile', hair: 'hair_crop', hairColor: '#513448',
} satisfies Outfit

export const LEGACY_COLORS: Readonly<Record<string, string>> = {
  crimson: '#513448', slate: '#657988', chocolate: '#593d28', green: '#366453', ink: '#282431', putty: '#ab8f75',
}

export const HAIR_PRESETS = { ...LEGACY_COLORS, copper: '#a84a32', gold: '#c28a49' }

export function resolveOutfit(source: AvatarSource = {}): Outfit {
  if (source.outfit) return { ...DEFAULT_OUTFIT, ...source.outfit }
  const outfit: Outfit = { ...DEFAULT_OUTFIT, hairColor: LEGACY_COLORS[source.avatar ?? 'crimson'] ?? DEFAULT_OUTFIT.hairColor }
  if (source.accessory === 'cap') outfit.headwear = 'cap'
  if (source.accessory === 'glasses' || source.accessory === 'bowtie') outfit.accessory = source.accessory
  return outfit
}
