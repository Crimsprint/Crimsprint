import Image from 'next/image'

export const AVATARS = ['crimson', 'slate', 'chocolate', 'green', 'ink', 'putty'] as const
export const ACCESSORIES = { cap: 'Graduation cap', glasses: 'Reading glasses', bowtie: 'Bow tie' } as const
export type AvatarColor = (typeof AVATARS)[number]
export type Accessory = keyof typeof ACCESSORIES

// Drawn on the 256×256 head badge (public/mascot/avatar-*.png): eyes near (100,118) and (166,118), head top near y 40.
// Palette tokens only, and fixed across light/dark because they are part of the picture.
const ART: Record<Accessory, React.ReactNode> = {
  cap: <>
    <path d="M92 46h72v18c0 8-16 14-36 14s-36-6-36-14z" fill="var(--ink)" stroke="var(--gray-200)" strokeWidth="3" />
    <path d="M128 8l76 30-76 30-76-30z" fill="var(--ink)" stroke="var(--gray-200)" strokeWidth="3" strokeLinejoin="round" />
    <path d="M128 38l56 10v30" fill="none" stroke="var(--putty)" strokeWidth="4" strokeLinecap="round" />
    <rect x="178" y="76" width="12" height="18" rx="3" fill="var(--putty)" />
  </>,
  glasses: <g fill="var(--white)" fillOpacity="0.15" stroke="var(--white)" strokeWidth="6">
    <circle cx="100" cy="118" r="25" />
    <circle cx="166" cy="118" r="25" />
    <path d="M125 116q8-6 16 0" fill="none" />
  </g>,
  bowtie: <g fill="var(--crimson)" stroke="var(--white)" strokeWidth="3" strokeLinejoin="round">
    <path d="M128 226l-36-18v36zM128 226l36-18v36z" />
    <rect x="118" y="216" width="20" height="20" rx="5" />
  </g>,
}

export function Avatar({ avatar, accessory, size = 48, alt = '' }: { avatar: string; accessory?: string | null; size?: number; alt?: string }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <Image src={`/mascot/avatar-${avatar}.png`} alt={alt} width={size} height={size} className="size-full" />
      {accessory && accessory in ART && (
        <svg viewBox="0 0 256 256" className="absolute inset-0 size-full" aria-hidden>{ART[accessory as Accessory]}</svg>
      )}
    </span>
  )
}
