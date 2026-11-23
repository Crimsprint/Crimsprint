export const LAYERS = ['background', 'effect', 'fur', 'bottoms', 'shoes', 'top', 'outerwear', 'face', 'furStyle', 'headwear', 'eyewear', 'accessory'] as const
export type Layer = (typeof LAYERS)[number]
export type Outfit = Partial<Record<Layer, string>>
export type StoredOutfit = Outfit & { skin?: string; hair?: string; hairColor?: string }
export type AvatarSource = { avatar?: string; accessory?: string | null; outfit?: StoredOutfit | null; crown_expires_at?: string | null }

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
  ...items('furStyle', [
    ['style_ears', 'Ear Tufts'], ['style_cheeks', 'Cheek Fluff'], ['style_tuft', 'Head Tuft'],
    ['style_sleek', 'Sleek'], ['style_messy', 'Messy'], ['style_curl', 'Curly Crest'],
  ]),
  ...items('face', [
    ['face_smile', 'Easy Smile'], ['face_grin', 'Big Grin'], ['face_wink', 'Wink'],
    ['face_calm', 'Quiet Focus'], ['face_spark', 'Bright Eyes'],
  ]),
  ...items('fur', [
    ['fur_gray', 'Classic Gray', undefined, '#8c8c95'], ['fur_charcoal', 'Charcoal', undefined, '#575461'],
    ['fur_cream', 'Cream', undefined, '#d4b996'], ['fur_cinnamon', 'Cinnamon', undefined, '#aa715d'],
    ['fur_frost', 'Frost', undefined, '#bac5d0'], ['fur_midnight', 'Midnight', undefined, '#566b89'],
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
  ...items('eyewear', [
    ['eye_sunglasses', 'Sunglasses', 'rare', '#38334f'], ['glasses', 'Reading Glasses', 'common', '#c99a65'],
    ['eye_visor', 'Sports Visor', 'common', '#4db2a7'], ['eye_stars', 'Star Shades', 'epic', '#dfa45d'],
  ]),
  ...items('effect', [
    ['effect_sparkle', 'Sparkle', 'common'], ['effect_study_flame', 'Study Flame', 'rare'],
    ['effect_crimson', 'Crimson Glow', 'epic'], ['effect_galaxy', 'Galaxy Swirl', 'legendary'],
  ]),
  ...items('accessory', [
    ['acc_backpack', 'Bookbag', 'rare', '#58877c'],
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
  fur: 'fur_gray', bottoms: 'bottom_joggers', shoes: 'shoes_canvas', top: 'top_tee',
  face: 'face_smile', furStyle: 'style_tuft',
} satisfies Outfit

const LEGACY_BADGES: Readonly<Record<string, string>> = {
  crimson: 'fur_gray', slate: 'fur_frost', chocolate: 'fur_cinnamon',
  green: 'fur_midnight', ink: 'fur_charcoal', putty: 'fur_cream',
}
const LEGACY_SKIN: Readonly<Record<string, string>> = {
  skin_pearl: 'fur_frost', skin_peach: 'fur_gray', skin_sand: 'fur_cream',
  skin_amber: 'fur_cinnamon', skin_cocoa: 'fur_charcoal', skin_umber: 'fur_midnight',
}
const LEGACY_HAIR: Readonly<Record<string, string>> = {
  hair_crop: 'style_tuft', hair_bob: 'style_cheeks', hair_curls: 'style_curl', hair_bangs: 'style_ears',
  hair_buns: 'style_ears', hair_quiff: 'style_tuft', hair_buzz: 'style_sleek', hair_pony: 'style_messy',
}

export function resolveOutfit(source: AvatarSource = {}): Outfit {
  const stored = source.outfit
  if (stored) {
    const outfit: Outfit = { ...DEFAULT_OUTFIT }
    for (const layer of LAYERS) {
      const item = stored[layer]
      if (item && ITEMS.get(item)?.layer === layer) outfit[layer] = item
    }
    if (!stored.fur && stored.skin && Object.hasOwn(LEGACY_SKIN, stored.skin)) outfit.fur = LEGACY_SKIN[stored.skin]
    if (!stored.furStyle && stored.hair && Object.hasOwn(LEGACY_HAIR, stored.hair)) outfit.furStyle = LEGACY_HAIR[stored.hair]
    if (!stored.eyewear && stored.accessory === 'glasses') outfit.eyewear = 'glasses'
    return outfit
  }
  const badge = source.avatar ?? 'crimson'
  const outfit: Outfit = { ...DEFAULT_OUTFIT }
  if (Object.hasOwn(LEGACY_BADGES, badge)) outfit.fur = LEGACY_BADGES[badge]
  if (source.accessory === 'cap') outfit.headwear = 'cap'
  if (source.accessory === 'glasses') outfit.eyewear = 'glasses'
  if (source.accessory === 'bowtie') outfit.accessory = 'bowtie'
  return outfit
}
