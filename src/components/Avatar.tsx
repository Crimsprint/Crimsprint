import { useId } from 'react'
import { DEFAULT_OUTFIT, ITEMS, LAYERS, resolveOutfit, type AvatarItem, type AvatarSource, type Layer } from '@/lib/avatar'

const INK = '#2e2435'
const CREAM = '#fff1d6'
const outline = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

function Background({ item }: { item?: string }) {
  const gradient = useId()
  if (!item) return <>
    <rect width="240" height="240" fill="#f1e1ca" />
    <circle cx="120" cy="111" r="86" fill="#f9edda" />
    <path d="M0 200q120-24 240 0v40H0z" fill="#e6cdb6" />
    <path d="M28 86h14m-7-7v14m161 37h10m-5-5v10M190 48h17m-8.5-8.5v17" stroke="#b97472" strokeWidth="2" strokeLinecap="round" />
    <g fill="#bc8b75"><circle cx="39" cy="147" r="2" /><circle cx="211" cy="95" r="2" /><circle cx="57" cy="55" r="2" /></g>
  </>
  if (item === 'bg_crimson') return <>
    <defs><linearGradient id={gradient} x2="1" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="#42162e" /><stop offset=".58" stopColor="#a51c30" /><stop offset="1" stopColor="#ef936d" /></linearGradient></defs>
    <rect width="240" height="240" fill={`url(#${gradient})`} />
    <circle cx="120" cy="104" r="82" fill="none" stroke="#ffdbaa" strokeOpacity=".65" />
    <circle cx="120" cy="104" r="93" fill="none" stroke="#ffdbaa" strokeOpacity=".35" />
    <path d="M35 120h18m-9-9v18m155-59h15m-7-7v14M26 57h8m-4-4v8" stroke="#ffdfa9" strokeWidth="2" strokeLinecap="round" />
    <path d="M0 210q90-56 240-15v45H0z" fill="#511e3b" opacity=".5" />
  </>
  if (item === 'bg_rooftop') return <>
    <defs><linearGradient id={gradient} x2="0" y2="1"><stop stopColor="#5c5a91" /><stop offset="1" stopColor="#efaa8d" /></linearGradient></defs>
    <rect width="240" height="240" fill={`url(#${gradient})`} />
    <circle cx="188" cy="66" r="30" fill="#ffd7a2" />
    <path d="M0 141h31v-19h24v29h20v-18h22v28h63v-22h14v-18h24v35h14v-19h28v103H0z" fill="#5e5a77" />
    <path d="M0 174h240v66H0z" fill="#7c637a" /><path d="M0 177h240M0 194h240" stroke="#bc8790" strokeWidth="3" />
    <path d="M33 176v19m41-19v19m92-19v19m41-19v19" stroke="#bc8790" strokeWidth="3" />
  </>
  if (item === 'bg_library') return <>
    <rect width="240" height="240" fill="#5a3f56" />
    <path d="M0 197h240v43H0zM91 197v-92a29 29 0 0158 0v92" fill="#a67b72" />
    {[12, 166].map((x) => <g key={x} transform={`translate(${x} 24)`}>
      <rect width="62" height="173" rx="6" fill="#362e47" stroke="#c79172" strokeWidth="3" />
      {[20, 70, 120].map((y) => <g key={y} transform={`translate(0 ${y})`}>
        <path d="M6 0h10v28H6zm14 7h8v21h-8zm16-9h8v30h-8zm11 11h8v19h-8z" fill="#c48d77" />
        <path d="M9 4h5m8 9h4m12-9h4m7 11h4" stroke="#f9d69e" strokeWidth="2" />
        <path d="M0 30h62" stroke="#c79172" strokeWidth="4" />
      </g>)}
    </g>)}
    <path d="M115 52h10l7 20h-24z" fill="#ffe0a5" /><path d="M120 0v52" stroke="#30253b" strokeWidth="2" />
  </>
  return <>
    <rect width="240" height="240" fill="#cedbc7" />
    <rect x="13" y="31" width="77" height="120" rx="5" fill="#fcdeab" stroke="#fff0cf" strokeWidth="6" />
    <path d="M51 31v120M14 89h75" stroke="#fff0cf" strokeWidth="4" />
    <rect x="145" y="52" width="82" height="82" rx="6" fill="#577b70" stroke="#b7896e" strokeWidth="5" />
    <path d="M165 85h14m6 0h24m-44 16h33m-33 13h13" stroke="#dce6c8" strokeWidth="2" strokeLinecap="round" />
    <path d="M0 186h240v54H0z" fill="#c3a68d" /><path d="M0 194h240m-240 16h240" stroke="#d9bea0" strokeWidth="2" />
    <path d="M19 176h53v10H19zm149 0h53v10h-53z" fill="#876657" />
  </>
}

function Skin({ color }: { color: string }) {
  return <g fill={color} {...outline}>
    <path d="M91 136q-13 4-18 20l-9 20a10 10 0 0 0 18 8l7-14v23l8 18h46l8-18v-23l7 14a10 10 0 0 0 18-8l-9-20q-5-16-18-20z" />
    <path d="M103 175h34l5 33h-19l-3-17-3 17H98z" />
    <ellipse cx="58" cy="99" rx="13" ry="16" /><ellipse cx="182" cy="99" rx="13" ry="16" />
    <path d="M55 100q4-7 10 0m120 0q-4-7-10 0" fill="none" opacity=".48" strokeWidth="2" />
    <path d="M56 85C56 47 82 27 120 27s64 20 64 58v17c0 29-27 46-64 46s-64-17-64-46z" />
  </g>
}

function Bottoms({ item, color }: { item: string; color?: string }) {
  if (item === 'bottom_pleats') return <g {...outline} fill={color}>
    <path d="M91 175h58l9 28q-8 5-17 0-11 5-21 0-10 5-21 0-9 5-17 0z" />
    <path d="M101 177l-2 26m21-26v26m19-26 2 26" opacity=".55" />
  </g>
  const end = item === 'bottom_shorts' ? 197 : 209
  return <g {...outline} fill={color}>
    <path d={`M91 174h58l4 ${end - 174}h-28l-5-13-5 13H87z`} />
    {item === 'bottom_denim' && <path d="M89 202h26v7H88zm36 0h26l1 7h-27z" fill="#9bb2cc" strokeWidth="2" />}
    {item === 'bottom_chinos' && <path d="M96 183q5 7 10 7m38-7q-5 7-10 7" fill="none" strokeWidth="2" />}
    {item === 'bottom_joggers' && <path d="M93 194v10m54-10v10" stroke="#a099b1" strokeWidth="2" />}
    {item === 'bottom_shorts' && <path d="M93 181l-3 13m8-12-3 12m52-13 3 13" stroke="#b6ded0" strokeWidth="2" />}
  </g>
}

function Shoes({ item, color }: { item: string; color?: string }) {
  const high = item === 'shoes_boots' || item === 'shoes_high'
  return <g {...outline} fill={color}>
    {[false, true].map((flip) => <g key={String(flip)} transform={flip ? 'translate(240) scale(-1 1)' : undefined}>
      <path d={high ? 'M91 201h25l1 21H82v-6q0-7 9-8z' : 'M97 206h18l2 16H82v-5q0-7 11-9z'} />
      <path d="M82 219h35v4q-17 3-35 0z" fill={item === 'shoes_loafers' ? '#b07c5f' : CREAM} strokeWidth="2" />
      {item === 'shoes_loafers' ? <path d="M90 212h19" stroke="#e9b68a" fill="none" strokeWidth="2" />
        : item === 'shoes_track' ? <path d="M99 211l-7 6m13-6-6 6" stroke={CREAM} fill="none" strokeWidth="2" />
          : <path d="M98 209h8m-10 4h8" stroke={item === 'shoes_canvas' ? '#997f7d' : CREAM} fill="none" strokeWidth="2" />}
    </g>)}
  </g>
}

function Top({ item, color }: { item: string; color?: string }) {
  return <g {...outline} fill={color}>
    <path d="M100 136h40q17 0 23 14l7 16-16 7-4-8v22q-30 8-60 0v-22l-4 8-16-7 7-16q6-14 23-14z" />
    {item === 'top_hoodie' && <>
      <path d="M94 138q7 15 26 17 19-2 26-17" fill="#753e51" />
      <path d="M112 152l-2 11m18-11 2 11" stroke={CREAM} strokeWidth="2" />
      <path d="M111 170h18l5 10h-28z" fill="#bd6772" strokeWidth="2" />
    </>}
    {item === 'top_sweater' && <g fill="none" stroke="#f3d18c" strokeWidth="2.5">
      <path d="M104 151q-7 5 0 10t0 10 0 10m16-30q-7 5 0 10t0 10 0 10m16-30q-7 5 0 10t0 10 0 10M93 184h54" />
    </g>}
    {item === 'top_rugby' && <path d="M91 164h58v11H91zM102 138l18 10 18-10-5 15-13-3-13 3z" fill={CREAM} strokeWidth="2" />}
    {item === 'top_sweater_vest' && <>
      <path d="M91 138l29 20 29-20 4 49q-33 9-66 0z" fill="#9178ae" />
      <path d="M98 144l22 16 22-16m-52 40h60" fill="none" stroke="#efe0b9" strokeWidth="2.5" />
      <path d="M111 172l9-8 9 8-9 8z" fill="#ebbb8d" strokeWidth="1.4" />
    </>}
    {item === 'top_striped_tee' && <path d="M92 155h56m-56 11h56m-56 11h56m-73-18 12 5m66 0 12-5" fill="none" stroke={CREAM} strokeWidth="4" />}
    {item === 'top_tee' && <path d="M120 158v18m-9-9h18m-13-4 8 8m0-8-8 8" stroke="#98565c" strokeWidth="2.5" />}
  </g>
}

function Outerwear({ item, color }: { item: string; color?: string }) {
  const varsity = item === 'outer_varsity'
  return <g {...outline} fill={color}>
    <path d="M95 136q-16 3-21 17l-9 20 17 8 8-14-3 22 24 2 3-54zm50 0q16 3 21 17l9 20-17 8-8-14 3 22-24 2-3-54z" />
    {varsity ? <>
      <path d="M94 138q-15 2-20 15l-9 20 17 8 8-14zm52 0q15 2 20 15l9 20-17 8-8-14z" fill={CREAM} />
      <path d="M89 187l21 1m20 0 21-1M69 170l14 7m88-7-14 7" fill="none" stroke="#d69886" strokeWidth="3" />
      <path d="M134 154h10v9l-5 5-5-5z" fill="#e8b773" strokeWidth="1.5" />
    </> : <>
      <path d="M100 137l-9 14 12 3-5 6 13 15 3-38zm40 0 9 14-12 3 5 6-13 15-3-38z" fill="#667ca0" strokeWidth="2" />
      <path d="M93 173h9m37 0h8" stroke="#e9c98b" strokeWidth="2" />
    </>}
  </g>
}

function Face({ item }: { item: string }) {
  const wink = item === 'face_wink', calm = item === 'face_calm', grin = item === 'face_grin'
  return <>
    <g fill="#d67476" opacity=".57"><ellipse cx="82" cy="113" rx="10" ry="5" /><ellipse cx="158" cy="113" rx="10" ry="5" /></g>
    <g fill="none" stroke={INK} strokeLinecap="round">
      <path d="M86 87q5-4 11-2m46 0q6-2 11 2" strokeWidth="2.5" />
      {(wink || calm) && <path d="M140 100q5-7 12 0" strokeWidth="3.4" />}
      {calm && <path d="M88 100q6-7 12 0" strokeWidth="3.4" />}
    </g>
    {!calm && [94, ...(wink ? [] : [146])].map((x) => <g key={x}>
      <ellipse cx={x} cy="101" rx={item === 'face_spark' ? 7 : 5.4} ry={item === 'face_spark' ? 9 : 7.2} fill={INK} />
      {item === 'face_spark' ? <path d={`M${x - 5} 99h8m-4-4v8`} stroke={CREAM} strokeWidth="1.8" strokeLinecap="round" />
        : <circle cx={x - 1.6} cy="98.5" r="2" fill={CREAM} />}
    </g>)}
    <path d="M117 108q3-2 6 0" fill="none" stroke={INK} strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
    {grin ? <path d="M108 117q12 4 24 0-2 13-12 13t-12-13z" fill="#8e4b58" stroke={INK} strokeWidth="2.5" />
      : <path d={calm ? 'M115 121q5 3 10 0' : 'M111 118q9 11 18 0'} stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />}
  </>
}

const HAIR: Record<string, string> = {
  hair_crop: 'M55 92C44 48 77 22 113 22c31-5 57 6 69 31 7 12 8 24 2 42l-11-28q-21 4-47-11-15 21-56 21l-9 17z',
  hair_bob: 'M50 123Q40 66 61 44q18-23 58-23 42-1 60 25 21 25 12 77l-16 4-4-53q-30 6-52-17-19 20-51 18l-2 52z',
  hair_curls: 'M52 94q-17-7-8-25-5-16 10-24-2-16 16-19 7-13 24-8 14-12 29-5 17-9 28 4 20-2 27 15 20 4 18 24 14 13-3 26l-12 12-9-23q-13 1-17-11-14 8-24 1-14 15-30 7-14 15-31 6l-8 22z',
  hair_bangs: 'M53 92Q41 50 76 31q35-21 75-5 37 12 39 51l-6 19-13-23-20 4-7-13-17 19-8-13-19 13-4-11-22 7-13 15z',
  hair_buns: 'M57 87Q43 60 68 39q-24 0-27-19-2-16 17-17 23-1 25 25 18-9 38-8 19 0 37 7 4-26 25-24 18 1 17 18-2 19-25 19 25 21 9 49l-13-19q-29 4-50-17-22 21-51 17z',
  hair_quiff: 'M54 92Q35 58 65 34l-9-6 24-3 1-13q31 13 67-7l-8 18 23-8-4 12q38 15 28 63l-12-22q-18-5-32-16-32 17-69 18l-11 24z',
  hair_buzz: 'M55 81q-8-32 26-52 17-10 40-10 47 0 62 36 5 11 1 24l-9-15q-14-20-54-20-38 0-54 18z',
  hair_pony: 'M55 88Q43 47 82 27q56-25 92 16 17-6 24 7 6 10 1 21 22 14 13 46-7 24 10 29-32 4-39-21-5-17 3-40l-11-16q-30 4-58-22-23 27-48 28l-7 16z',
}

function Hair({ item, color }: { item: string; color: string }) {
  return <g {...outline}>
    <path d={HAIR[item]} fill={color} />
    <path d={item === 'hair_curls' ? 'M64 54q-4-10 7-11m9-10q6-8 16-3m12-4q7-6 17-1'
      : item === 'hair_buzz' ? 'M78 40q32-21 66-8' : 'M69 55q22-23 59-22m-57 32q20-14 43-18'}
    fill="none" stroke="#fff" opacity=".25" strokeWidth="3" />
  </g>
}

function Headwear({ item, color }: { item: string; color?: string }) {
  return <g {...outline} fill={color}>
    {item === 'hat_beanie' && <>
      <path d="M61 55q-1-34 35-44 35-11 64 11 15 11 19 35z" />
      <path d="M81 48q-2-20 14-31m11 30q1-22 9-33m10 32q-1-22-5-34m27 32q-4-18-14-28" fill="none" stroke="#a35c4b" strokeWidth="2" />
      <path d="M59 48q47-12 119-3l4 16q-55-6-121 5z" fill="#e79d6f" /><rect x="121" y="46" width="15" height="11" rx="2" fill={CREAM} strokeWidth="1.5" />
    </>}
    {item === 'hat_cap' && <>
      <path d="M59 57q0-36 42-40 46-3 64 37z" />
      <path d="M84 55q4-26 18-37" fill="none" stroke="#a7c9ac" strokeWidth="2" />
      <path d="M91 56q53-14 88 0t-9 15q-24-12-69-9z" fill="#88ad90" />
    </>}
    {item === 'cap' && <>
      <path d="M81 40h77v23q-38-12-77 1z" /><path d="M55 33l65-26 66 26-66 25z" />
      <path d="M120 33l49 4v35" fill="none" stroke="#edbc70" strokeWidth="3" /><path d="M166 69h6l2 12h-10z" fill="#edbc70" strokeWidth="1.5" />
    </>}
    {item === 'hat_headphones' && <>
      <path d="M51 91Q45 29 89 17q31-11 62 0 44 12 38 74" fill="none" stroke={INK} strokeWidth="13" />
      <path d="M51 91Q45 29 89 17q31-11 62 0 44 12 38 74" fill="none" stroke={color} strokeWidth="8" />
      <rect x="43" y="80" width="19" height="35" rx="8" /><rect x="178" y="80" width="19" height="35" rx="8" />
      <path d="M50 89v16m140-16v16" stroke="#eac2cc" strokeWidth="2.6" />
    </>}
    {item === 'hat_bucket' && <>
      <path d="M57 53l16-31q49-22 95 0l13 31z" />
      <path d="M63 44q61-11 113 0l5 10q-63-6-124 2z" fill="#a47b70" />
      <path d="M55 51q65-13 130 0l12 20q-66-19-154 4z" fill="#eaca91" />
      <path d="M55 66q63-17 128-5" fill="none" stroke="#b68d70" strokeWidth="2" />
    </>}
  </g>
}

function Accessory({ item, color }: { item: string; color?: string }) {
  return <g {...outline} fill={color}>
    {item === 'glasses' && <>
      <path d="M75 93l-12-5m102 5 12-5m-45 11q-12-9-24 0" fill="none" stroke={color} strokeWidth="4" />
      <g fill="#fff4da" fillOpacity=".14" stroke={color} strokeWidth="4">
        <rect x="72" y="90" width="37" height="25" rx="10" /><rect x="131" y="90" width="37" height="25" rx="10" />
      </g>
    </>}
    {item === 'bowtie' && <>
      <path d="M120 149l-16-7q-6-2-6 4v13q0 6 6 4l16-7 16 7q6 2 6-4v-13q0-6-6-4z" />
      <rect x="115" y="146" width="10" height="13" rx="3" fill="#d77b76" strokeWidth="2" />
    </>}
    {item === 'acc_backpack' && <>
      <path d="M151 149q26-15 35 5l5 24q3 12-10 14l-24 3-7-27z" />
      <path d="M169 168l14-3 4 15-15 3zm-19-26q7 2 9 11l2 21-7 4-4-23-8-10zM92 143q-12 12-8 27l7 3q-3-14 9-29z" fill="#88a78c" strokeWidth="2" />
      <path d="M176 172l6-1" stroke={CREAM} strokeWidth="2" />
    </>}
    {item === 'acc_pencil' && <g transform="rotate(27 176 179)">
      <path d="M169 146v55l7 15 7-15v-55z" /><path d="M169 146v-8q0-7 7-7t7 7v8z" fill="#d17b8c" />
      <path d="M169 200h14l-7 16z" fill="#f9d9ac" /><path d="M175 151v45" stroke="#ad7851" strokeWidth="2" />
    </g>}
    {item === 'acc_scarf' && <>
      <path d="M136 149l15 3 3 33-15 4-5-28z" /><path d="M93 141q27 12 54-2l5 11q-34 16-60-1z" />
      <path d="M142 181l10-3m-11 7 2 7m5-9 2 7" stroke="#dc9c91" strokeWidth="2.5" />
    </>}
    {item === 'acc_keychain' && <>
      <circle cx="150" cy="181" r="5" fill="none" stroke="#f1c27d" strokeWidth="3" />
      <path d="M149 185q-9 20 9 25 19 3 20-14-11 4-17-2l-5-11z" />
      <path d="M147 194l12-2m-7 13 12-9m0 14 5-11" fill="none" stroke="#504458" strokeWidth="4" />
    </>}
  </g>
}

function AvatarLayer({ layer, item, hairColor }: { layer: Layer; item?: string; hairColor: string }) {
  const entry = item ? ITEMS.get(item) : undefined
  const color = entry?.layer === layer ? entry.color : undefined
  if (layer === 'background') return <Background item={entry?.layer === layer ? item : undefined} />
  if (!item || entry?.layer !== layer) return null
  switch (layer) {
    case 'skin': return <Skin color={color ?? '#f4c6a4'} />
    case 'bottoms': return <Bottoms item={item} color={color} />
    case 'shoes': return <Shoes item={item} color={color} />
    case 'top': return <Top item={item} color={color} />
    case 'outerwear': return <Outerwear item={item} color={color} />
    case 'face': return <Face item={item} />
    case 'hair': return <Hair item={item} color={hairColor} />
    case 'headwear': return <Headwear item={item} color={color} />
    case 'accessory': return <Accessory item={item} color={color} />
    case 'effect': return null // Reserved for a future crown aura.
  }
}

export function Avatar({ size = 48, alt = '', className = '', ...source }: AvatarSource & { size?: number; alt?: string; className?: string }) {
  const outfit = resolveOutfit(source)
  const color = outfit.hairColor ?? DEFAULT_OUTFIT.hairColor
  return (
    <svg viewBox={size <= 40 ? '35 0 170 170' : '0 0 240 240'} width={size} height={size}
      role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}
      className={`block shrink-0 rounded-[23%] ${className}`}>
      <AvatarLayer layer="background" item={outfit.background} hairColor={color} />
      <ellipse cx="120" cy="224" rx="49" ry="8" fill={INK} opacity=".2" />
      {LAYERS.slice(1).map((layer) => <AvatarLayer key={layer} layer={layer} item={outfit[layer]} hairColor={color} />)}
    </svg>
  )
}

const DETAIL_VIEW: Partial<Record<Layer, string>> = {
  top: '61 124 118 76', outerwear: '61 124 118 76', bottoms: '76 166 88 52', shoes: '75 195 90 35',
  hair: '28 -3 184 156', skin: '42 17 156 141', face: '63 64 114 74', headwear: '33 -1 174 124', background: '0 0 240 240',
}

export function AvatarItemArt({ item, hairColor }: { item: AvatarItem; hairColor: string }) {
  const view = item.id === 'glasses' ? '60 76 120 54' : item.id === 'acc_backpack' || item.id === 'acc_pencil' ? '75 122 126 105'
    : item.layer === 'accessory' ? '76 131 112 91' : DETAIL_VIEW[item.layer]
  return <svg viewBox={view} className="size-full" aria-hidden>
    {item.layer === 'face' && <rect x="70" y="68" width="100" height="72" rx="36" fill="#f4c6a4" />}
    <AvatarLayer layer={item.layer} item={item.id} hairColor={hairColor} />
  </svg>
}
