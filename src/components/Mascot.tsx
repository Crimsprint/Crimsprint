import Image from 'next/image'

export type Pose = 'idle' | 'celebrating' | 'encouraging' | 'sleeping'

// shortcut: every pose is the one source illustration plus original overlays and motion (closed eyes, "z"s, confetti).
// Upgrade when an illustrator draws true poses (arms up, thumbs-up, curled asleep) in the same style.
const MOTION: Record<Pose, string> = {
  idle: 'motion-safe:animate-bob',
  celebrating: 'motion-safe:animate-cheer',
  encouraging: 'motion-safe:animate-nod',
  sleeping: 'motion-safe:animate-breathe',
}

// Coordinates are on the 657×655 artwork (public/mascot/raccoon.svg, traced from raccoon.png): eyes near (282,333) and (384,326).
// Palette tokens only; fixed across themes because they are part of the picture, except the "z"s, which sit outside it.
const CONFETTI = [
  [70, 150, 'var(--crimson)'], [590, 130, 'var(--putty)'], [40, 380, 'var(--slate)'], [620, 360, 'var(--crimson)'],
  [130, 40, 'var(--green)'], [520, 30, 'var(--slate)'], [110, 560, 'var(--putty)'], [560, 560, 'var(--green)'],
] as const

function Overlay({ pose }: { pose: Pose }) {
  if (pose === 'sleeping') return (
    <svg viewBox="0 0 657 655" className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
      {/* Closed eyes: cover the open eyes with the mask's black, then draw a lowered lid line. */}
      <ellipse cx="282" cy="333" rx="21" ry="17" fill="var(--ink)" />
      <ellipse cx="384" cy="326" rx="21" ry="17" fill="var(--ink)" />
      <path d="M263 330q19 14 38 0M365 323q19 14 38 0" fill="none" stroke="var(--gray-200)" strokeWidth="6" strokeLinecap="round" />
      <g className="fill-text text-[90px] font-bold">
        <text x="560" y="130" className="motion-safe:animate-drift">z</text>
        <text x="610" y="70" className="motion-safe:animate-drift [animation-delay:1.5s]">z</text>
      </g>
    </svg>
  )
  if (pose === 'celebrating') return (
    <svg viewBox="0 0 657 655" className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
      {CONFETTI.map(([x, y, fill], i) => (
        <rect key={i} x={x - 14} y={y - 14} width="28" height="28" rx={i % 2 ? 14 : 4} fill={fill}
          transform={`rotate(${i * 37} ${x} ${y})`} style={{ transformOrigin: '328px 328px', animationDelay: `${(i % 4) * 0.15}s` }}
          className="motion-safe:animate-pop" />
      ))}
    </svg>
  )
  return null
}

/** The Crimsprint raccoon. Every pose keeps the same alt text; the state is carried by the words next to it. */
export function Mascot({ pose = 'idle', size = 96, still = false, priority = false, className = '' }: {
  pose?: Pose; size?: number; still?: boolean; priority?: boolean; className?: string
}) {
  return (
    <span className={`relative inline-block shrink-0 ${still ? '' : MOTION[pose]} ${className}`} style={{ width: size, height: size }}>
      {/* The traced SVG stays crisp at any size; next/image does not resize SVGs. */}
      <Image src="/mascot/raccoon.svg" alt="Crimsprint raccoon mascot" width={size} height={size} priority={priority} unoptimized className="size-full" />
      <Overlay pose={pose} />
    </span>
  )
}
