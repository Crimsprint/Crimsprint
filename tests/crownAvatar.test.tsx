import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { AvatarArt } from '../src/components/Avatar'
import { DEFAULT_OUTFIT } from '../src/lib/avatar'

it.each([32, 48, 88, 96, 360])('renders a crown and aura at %i px and preserves the original outfit when inactive', (size) => {
  const outfit = { ...DEFAULT_OUTFIT, headwear: 'hat_beanie', effect: 'effect_sparkle' }
  const crowned = renderToStaticMarkup(<AvatarArt size={size} outfit={outfit} champion />)
  expect(crowned).toContain(`width="${size}" height="${size}"`)
  expect(crowned).toContain('data-avatar-part="crown"')
  expect(crowned).toContain('data-aura="effect_champion"')
  expect(crowned).toContain('avatar-aura-motion')
  expect(crowned.indexOf('data-aura="effect_champion"')).toBeLessThan(crowned.indexOf('data-avatar-part="ringed-tail"'))
  expect(crowned.indexOf('data-avatar-part="crown"')).toBeGreaterThan(crowned.indexOf('data-avatar-part="ringed-tail"'))
  const expired = renderToStaticMarkup(<AvatarArt size={size} outfit={outfit} champion={false} />)
  expect(expired).not.toContain('data-avatar-part="crown"')
  expect(expired).not.toContain('data-aura="effect_champion"')
  expect(expired).toContain('data-aura="effect_sparkle"')
  expect(expired).toContain('fill="#ca8155"')
})
