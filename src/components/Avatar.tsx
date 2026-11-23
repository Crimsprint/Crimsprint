'use client'

import { useId } from 'react'
import { useCrownTimeLeft } from './Crown'
import { DEFAULT_OUTFIT, ITEMS, LAYERS, resolveOutfit, type AvatarItem, type AvatarSource, type Layer } from '../lib/avatar'

const INK = '#2e2435'
const CREAM = '#fff1d6'
const MUZZLE = '#fff4e4'
const MASK = '#2d2934'
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

const TAIL = 'M136 185c24 7 37-2 40-19 3-20 16-40 35-48 14-6 24 5 22 22-5 45-36 76-84 77-14 0-23-6-23-16 0-7 4-13 10-16z'
const HEAD = 'M41 75q4-30 30-39 17-6 35-6t35 6q26 9 30 39l11 19-8 3 15 10-13 6 6 5q-27 23-76 26-49-3-76-26l6-5-13-6 15-10-8-3z'
const STARTER_FUR = ITEMS.get(DEFAULT_OUTFIT.fur)!.color!

function RaccoonHead({ color }: { color: string }) {
  return <g {...outline}>
    {[false, true].map((flip) => <g key={String(flip)} transform={flip ? 'translate(212) scale(-1 1)' : undefined}>
      <path d="M50 76Q34 65 30 29q-2-17 13-12 29 7 42 34z" fill={color} />
      <path d="M53 60Q42 50 39 29q20 3 34 22z" fill={MASK} stroke={MUZZLE} strokeWidth="3.5" />
    </g>)}
    <path d={HEAD} fill={color} />
    <path d="M39 101q7-1 14-5l-7 11 15-3-8 10 16-1-4 9q-15-1-28-9l6-2-11-5zM173 101q-7-1-14-5l7 11-15-3 8 10-16-1 4 9q15-1 28-9l-6-2 11-5z"
      fill={MUZZLE} stroke="none" opacity=".9" />
    <path d="M106 83q-20-20-41-7c-12 6-17 20-29 24 9 12 23 19 41 18 15-1 24-7 29-16 5 9 14 15 29 16 18 1 32-6 41-18-12-4-17-18-29-24q-21-13-41 7z"
      fill={MASK} stroke="none" />
    <path d="M48 85q7-14 20-18 18-6 32 9l-3 7q-18-11-33-1l-12 7zM164 85q-7-14-20-18-18-6-32 9l3 7q18-11 33-1l12 7z"
      fill={MUZZLE} stroke="none" />
    <path d="M106 99c-7 0-10 10-19 11-18 2-16 17-3 24q22 9 44 0c13-7 15-22-3-24-9-1-12-11-19-11z" fill={MUZZLE} stroke="none" />
    <path d="M96 109q10-5 20 0c4 3-1 9-10 12-9-3-14-9-10-12z" fill="#191720" stroke="none" />
    <path d="M100 109q4-2 7-1" fill="none" stroke="#fff" strokeWidth="1.8" opacity=".76" />
    <path d="M79 118l7 2m-8 3 7 1m48-6-7 2m8 3-7 1" fill="none" opacity=".45" strokeWidth="1.5" />
  </g>
}

function Raccoon({ color }: { color: string }) {
  const tailClip = useId()
  return <>
    <defs><clipPath id={tailClip}><path d={TAIL} /></clipPath></defs>
    <g data-avatar-part="ringed-tail">
      <path d={TAIL} fill={color} />
      <g clipPath={`url(#${tailClip})`}>
        <path d="M146 179q-5 25 10 46m10-48q4 21 23 34m-11-47q10 16 36 20m-24-41q17 2 42 14"
          fill="none" stroke={MASK} strokeWidth="12" />
        <path d="M208 112q-6 20 30 32l6-38z" fill={MASK} />
        <path d="M134 209q69 2 91-72" fill="none" stroke="#1b1721" strokeWidth="10" opacity=".18" />
        <path d="M192 154q7-19 20-25" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".28" />
      </g>
      <path d={TAIL} fill="none" {...outline} />
    </g>

    <g {...outline} fill={color}>
      <path d="M91 139q-21 3-29 21l-9 17q-5 13 6 17 11 4 16-7l7-11q-1 17 2 25l-8 15q-2 7 6 8h16q5 0 6-8l2-14 2 14q1 8 6 8h16q8-1 6-8l-8-15q3-8 2-25l7 11q5 11 16 7 11-4 6-17l-9-17q-8-18-29-21z" />
      <ellipse cx="106" cy="175" rx="21" ry="24" fill={MUZZLE} stroke="none" opacity=".86" />
      <path d="M54 178q8-2 18 8-6 12-14 7-8-3-4-15zm104 0q-8-2-18 8 6 12 14 7 8-3 4-15zm-80 35q11 2 24-3l-3 11H79zm56 0q-11 2-24-3l3 11h20z" fill={MASK} stroke="none" />
      <path d="M60 184l3-3m1 6 3-3m85 0-3-3m-1 6-3-3" fill="none" stroke="#fff" opacity=".48" strokeWidth="1.4" />
    </g>
    <RaccoonHead color={color} />
  </>
}

function FurStyle({ item, color }: { item: string; color: string }) {
  return <g fill={color} {...outline}>
    {item === 'style_tuft' && <path d="M82 37q7-7 16-8l-5-11 15 8 11-12-2 13 15 2-12 9" />}
    {item === 'style_ears' && <>
      <path d="M34 23l-6-7 11 1 2-7 7 9m130 4 6-7-11 1-2-7-7 9" />
      <path d="M46 47l3-5 4 5 4-3 1 8m108-5-3-5-4 5-4-3-1 8" fill={MUZZLE} strokeWidth="1.5" />
    </>}
    {item === 'style_cheeks' && <>
      <path d="M39 104l-21 8 16 4-10 7 19 1 3 7 13-4m114-23 21 8-16 4 10 7-19 1-3 7-13-4" />
      <path d="M35 115q11 4 17 0m125 0q-11 4-17 0" fill="none" stroke={MUZZLE} strokeWidth="2.5" />
    </>}
    {item === 'style_sleek' && <path d="M80 47q14-10 29-9m-3 8q17-6 29-1" fill="none" stroke={MUZZLE} opacity=".6" strokeWidth="2.5" />}
    {item === 'style_messy' && <path d="M71 42l10-9-3-11 14 5 4-15 13 13 12-8 1 9 17-1-6 13 10 2" />}
    {item === 'style_curl' && <path d="M78 40q-1-12 12-13-2-13 11-15 11-5 17 8 14-3 19 9 4 9-4 14m-25-24q-6 7 0 12 5 3 8-1" />}
  </g>
}

function Face({ item }: { item: string }) {
  const wink = item === 'face_wink', calm = item === 'face_calm'
  const spark = item === 'face_spark'
  return <>
    <g fill="#de896f" opacity=".66"><ellipse cx="83" cy="116" rx="5.5" ry="2.7" /><ellipse cx="129" cy="116" rx="5.5" ry="2.7" /></g>
    <g fill="none" stroke={MUZZLE} strokeLinecap="round" strokeWidth="3">
      {(wink || calm) && <path d="M130 97q7-9 14-1" />}
      {calm && <path d="M68 96q7-8 14 1" />}
    </g>
    {!calm && [76, ...(wink ? [] : [136])].map((x) => <g key={x}>
      <ellipse cx={x} cy="94" rx={spark ? 10 : 8.5} ry={spark ? 12 : 10} fill={MUZZLE} />
      <ellipse cx={x + 1} cy="95" rx={spark ? 7 : 6} ry={spark ? 8.5 : 7} fill="#1b1923" />
      {spark ? <path d={`M${x - 3} 93h8m-4-4v8`} stroke={CREAM} strokeWidth="1.8" strokeLinecap="round" />
        : <circle cx={x - 1} cy="92" r="2.3" fill="#fff" />}
    </g>)}
    {item === 'face_grin' ? <g {...outline} strokeWidth="2">
      <path d="M94 121q12 4 24 0-2 12-12 12t-12-12z" fill="#69394a" />
      <path d="M101 130q5-4 10 0" fill="none" stroke="#ea9291" />
    </g> : <path d={calm ? 'M101 124q5 4 10 0' : 'M94 121q3 8 12 2 9 6 12-2'} {...outline} fill="none" strokeWidth="2" />}
  </>
}

function Bottoms({ item, color }: { item: string; color?: string }) {
  if (item === 'bottom_pleats') return <g fill={color} {...outline}>
    <path d="M80 177q26 7 53 0l9 24q-9 6-17 1-9 5-18 0-9 5-18 0-9 5-18-1z" />
    <path d="M93 183l-4 19m17-18v18m15-19 4 19" opacity=".65" strokeWidth="2" />
    <path d="M81 182q26 7 52 0" fill="none" stroke={CREAM} opacity=".38" strokeWidth="1.6" />
  </g>
  const shorts = item === 'bottom_shorts'
  return <g {...outline} fill={color}>
    <path d={shorts ? 'M81 177q26 6 50 0l8 20q-11 7-26 3l-7-8-7 8q-15 4-26-3z'
      : 'M81 177q26 6 50 0l6 21 3 10q-12 6-29 3l-5-12-5 12q-17 3-29-3l3-10z'} />
    {item === 'bottom_denim' && <path d="M76 203q12 5 25 2l-1 6q-15 3-27-3zm60 0q-12 5-25 2l1 6q15 3 27-3z" fill="#a1b6c9" strokeWidth="1.7" />}
    {item === 'bottom_chinos' && <path d="M86 186q4 6 9 8m31-8q-4 6-9 8m-5 11 21-1" fill="none" strokeWidth="1.8" />}
    {item === 'bottom_joggers' && <path d="M84 190l-4 14m48-14 4 14m-33-18 7 5 7-5" stroke={CREAM} opacity=".48" fill="none" strokeWidth="1.7" />}
    {shorts && <path d="M82 186l-4 10m52-10 4 10m-44 0 8-1" stroke="#b6ded0" fill="none" strokeWidth="2" />}
  </g>
}

function Shoes({ item, color }: { item: string; color?: string }) {
  const tall = item === 'shoes_boots' || item === 'shoes_high'
  return <g {...outline} fill={color}>
    {[false, true].map((flip) => <g key={String(flip)} transform={flip ? 'translate(212) scale(-1 1)' : undefined}>
      <path d={tall ? 'M80 202l19 3 4 15q-12 6-34 2l1-6q1-7 10-10z' : 'M80 208q8 4 19 0l4 12q-12 6-34 2l1-6q1-6 10-8z'} />
      <path d="M70 219q14 3 33-1v5q-17 6-34 2z" fill={item === 'shoes_loafers' ? '#b07c5f' : CREAM} strokeWidth="1.6" />
      {item === 'shoes_loafers' ? <path d="M80 214q7 2 14-1" stroke="#e9b68a" fill="none" strokeWidth="2" />
        : item === 'shoes_track' ? <path d="M88 212l-7 7m13-8-6 7" stroke={CREAM} fill="none" strokeWidth="2" />
          : <path d="M85 210h8m-11 4h8" stroke={item === 'shoes_canvas' ? '#997f7d' : CREAM} fill="none" strokeWidth="1.7" />}
    </g>)}
  </g>
}

function Top({ item, color }: { item: string; color?: string }) {
  return <g {...outline} fill={color}>
    <path d="M88 138q18 7 36 0 17 1 26 14l10 18q-9 8-20 9l-4-9 2 14q-32 11-64 0l2-14-4 9q-11-1-20-9l10-18q9-13 26-14z" />
    {item === 'top_hoodie' && <>
      <path d="M82 140q8 15 24 17 18-2 24-17" fill="#753e51" />
      <path d="M98 154l-3 10m19-10 3 10" stroke={CREAM} strokeWidth="1.8" />
      <path d="M96 170q10-2 20 0l5 9q-15 4-30 0z" fill="#bd6772" strokeWidth="1.9" />
    </>}
    {item === 'top_sweater' && <g fill="none" stroke="#f3d18c" strokeWidth="2.4">
      <path d="M91 151q-6 5 0 10t0 10 0 10m15-30q-6 5 0 10t0 10 0 10m15-30q-6 5 0 10t0 10 0 10m-43 0q28 9 56 0" />
    </g>}
    {item === 'top_rugby' && <path d="M78 164q28 7 56 0v9q-28 7-56 0zm12-25 16 7 16-7-5 12-11-2-11 2z" fill={CREAM} strokeWidth="1.8" />}
    {item === 'top_sweater_vest' && <>
      <path d="M79 141l27 16 27-16 5 43q-32 11-64 0z" fill="#9178ae" />
      <path d="M86 146l20 13 20-13m-49 37q29 8 58 0" fill="none" stroke="#efe0b9" strokeWidth="2.2" />
      <path d="M98 172l8-8 8 8-8 7z" fill="#ebbb8d" strokeWidth="1.5" />
    </>}
    {item === 'top_striped_tee' && <path d="M81 153q25 7 50 0m-52 10q27 7 54 0m-55 10q28 7 56 0m-77-8 13 5m72 0 13-5" fill="none" stroke={CREAM} strokeWidth="3.5" />}
    {item === 'top_tee' && <>
      <path d="M91 140q4 8 15 8 11 0 15-8" fill="none" stroke="#ad695d" strokeWidth="2" />
      <path d="M99 162q7-6 14 0l-2 10-5 3-5-3z" fill="#a51c30" strokeWidth="1.3" />
      <path d="M104 165h.01m4 0h.01m-3 4h2" stroke={CREAM} strokeWidth="1.5" />
    </>}
  </g>
}

function Outerwear({ item, color }: { item: string; color?: string }) {
  const varsity = item === 'outer_varsity'
  return <g {...outline} fill={color}>
    <path d="M86 140q-17 1-25 13l-12 20 21 11 7-11-3 15q11 5 26 5l3-47zm40 0q17 1 25 13l12 20-21 11-7-11 3 15q-11 5-26 5l-3-47z" />
    {varsity ? <>
      <path d="M84 141q-15 2-23 12l-12 20 21 11 7-11zm44 0q15 2 23 12l12 20-21 11-7-11z" fill={CREAM} />
      <path d="M77 186q12 4 22 4m14 0q10 0 22-4m-82-15 17 9m90-9-18 9" fill="none" stroke="#d69886" strokeWidth="2.8" />
      <path d="M121 155h10v9l-5 5-5-5z" fill="#e8b773" strokeWidth="1.5" />
    </> : <>
      <path d="M89 141l-11 13 13 3-5 7 13 12 4-30zm34 0 11 13-13 3 5 7-13 12-4-30z" fill="#7791ae" strokeWidth="1.9" />
      <path d="M80 176l9 2m34 0 9-2" stroke="#e9c98b" strokeWidth="1.8" />
    </>}
  </g>
}

function Headwear({ item, color }: { item: string; color?: string }) {
  return <g {...outline} fill={color}>
    {item === 'hat_beanie' && <>
      <path d="M58 60q-5-20 15-32 30-19 59-3 23 13 24 34z" />
      <path d="M76 52q0-14 10-24m8 22q1-15 9-25m13 25q-1-16-5-23m25 25q-3-15-11-21" fill="none" stroke="#a35c4b" strokeWidth="2" />
      <path d="M56 52q44-10 101 0l1 14q-55-7-102 2z" fill="#e79d6f" /><rect x="112" y="53" width="13" height="9" rx="2" fill={CREAM} strokeWidth="1.5" />
    </>}
    {item === 'hat_cap' && <>
      <path d="M56 57q6-31 37-32 38-2 53 26l-34 9z" />
      <path d="M78 54q3-20 16-29" fill="none" stroke="#a7c9ac" strokeWidth="1.8" />
      <path d="M83 55q46-16 82-3 13 5 4 12-6 4-16 1-25-10-62-4z" fill="#88ad90" />
    </>}
    {item === 'cap' && <>
      <path d="M75 43h62l7 17q-38-8-76 1z" /><path d="M48 37l58-23 58 23-58 21z" />
      <path d="M106 37l44 2v26" fill="none" stroke="#edbc70" strokeWidth="2.8" /><path d="M147 63h6l2 12h-10z" fill="#edbc70" strokeWidth="1.5" />
    </>}
    {item === 'hat_headphones' && <>
      <path d="M37 91Q41 42 72 32q32-12 67 0 31 10 36 59" fill="none" stroke={INK} strokeWidth="12" />
      <path d="M37 91Q41 42 72 32q32-12 67 0 31 10 36 59" fill="none" stroke={color} strokeWidth="7" />
      <rect x="26" y="78" width="18" height="34" rx="8" /><rect x="168" y="78" width="18" height="34" rx="8" />
      <path d="M33 87v15m146-15v15" stroke="#eac2cc" strokeWidth="2.1" />
    </>}
    {item === 'hat_bucket' && <>
      <path d="M60 53l11-24q37-17 71 0l10 24z" />
      <path d="M64 45q43-9 84 0l4 9q-45-6-92 0z" fill="#a47b70" />
      <path d="M59 51q48-11 95 0l11 18q-48-15-119 2z" fill="#eaca91" />
      <path d="M55 65q54-13 100-3" fill="none" stroke="#b68d70" strokeWidth="1.8" />
    </>}
  </g>
}

function CrownHeadwear() {
  return <g data-avatar-part="crown" {...outline}>
    <path d="M74 25l15 8 17-21 17 21 15-8-6 23q-26 7-52 0z" fill="#f6bd5a" />
    <path d="M79 43q27 7 54 0l-2 8q-25 6-50 0z" fill="#d99047" />
    <path d="M99 36l7-8 7 8-7 8z" fill="#a51c30" strokeWidth="2" />
    <path d="M86 40l5 1m30 0 5-1" fill="none" stroke={CREAM} strokeWidth="2.5" />
  </g>
}

function Eyewear({ item, color }: { item: string; color?: string }) {
  return <g {...outline} fill={color}>
    {item === 'glasses' && <g fill="none" stroke={color} strokeWidth="3.2">
      <path d="M59 87l-14-5m108 5 14-5m-47 11q-14-10-28 0" />
      <circle cx="76" cy="94" r="17" /><circle cx="136" cy="94" r="17" />
      <path d="M66 91l6-6m54 6 6-6" stroke={CREAM} opacity=".72" strokeWidth="1.8" />
    </g>}
    {item === 'eye_sunglasses' && <>
      <path d="M52 86l8 2m92 0 8-2m-39 6q-15-7-30 0" stroke="#191822" strokeWidth="4" fill="none" />
      <path d="M56 84q21-5 41 1l-4 13q-4 10-17 10-14 0-17-9zM156 84q-21-5-41 1l4 13q4 10 17 10 14 0 17-9z" stroke="#1c1826" />
      <path d="M67 94l7-8m-3 14 12-12m44 6 7-8m-3 14 12-12" stroke="#dbb2b3" strokeOpacity=".8" strokeWidth="2.1" />
    </>}
    {item === 'eye_visor' && <>
      <path d="M48 87q58-18 116 0l-7 15q-4 6-16 6h-21l-14-7-14 7H71q-12 0-16-6z" />
      <path d="M59 88q46-12 91-1" fill="none" stroke="#d6fff0" strokeWidth="2.8" />
      <path d="M77 105l13-21m5 20 13-21m20 23 11-18" stroke="#23686b" strokeWidth="2" opacity=".75" />
    </>}
    {item === 'eye_stars' && <>
      <path d="M93 93q13-8 26 0" fill="none" stroke={color} strokeWidth="4" />
      {[76, 136].map((x) => <g key={x} transform={`translate(${x} 94)`}>
        <path d="M0-20l6 12 14 2-10 10 3 14-13-6-13 6 3-14-10-10 14-2z" />
        <path d="M0-13l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" fill="#67385c" strokeWidth="1.3" />
        <path d="M-4 1l6-6" fill="none" stroke="#f8c9d4" strokeWidth="1.6" />
      </g>)}
    </>}
  </g>
}

function Accessory({ item, color }: { item: string; color?: string }) {
  return <g {...outline} fill={color}>
    {item === 'bowtie' && <>
      <path d="M106 149l-13-6q-5-2-5 3v11q0 5 5 3l13-6 13 6q5 2 5-3v-11q0-5-5-3z" />
      <rect x="102" y="146" width="8" height="11" rx="3" fill="#d77b76" strokeWidth="1.7" />
    </>}
    {item === 'acc_backpack' && <>
      <path d="M137 154q24-14 33 4l5 18q4 12-8 16l-22 6-8-15z" />
      <path d="M151 174l16-5 4 13-16 5zm-23-31q14 2 18 27l-6 5q-4-20-17-30zM84 142q-13 11-12 29l6 4q2-20 12-29z" fill="#88a78c" strokeWidth="1.8" />
      <path d="M157 177l7-2" stroke={CREAM} strokeWidth="2" />
    </>}
    {item === 'acc_pencil' && <g transform="rotate(24 151 181)">
      <path d="M144 148v54l7 13 7-13v-54z" /><path d="M144 148v-7q0-7 7-7t7 7v7z" fill="#d17b8c" />
      <path d="M144 201h14l-7 14z" fill="#f9d9ac" /><path d="M150 153v43" stroke="#ad7851" strokeWidth="1.8" />
      <path d="M152 180q5-2 8 1l-2 7q-2 4-7 1-3-3 1-9z" fill={MASK} strokeWidth="1.5" />
    </g>}
    {item === 'acc_scarf' && <>
      <path d="M118 144l14 1 7 33-14 6-8-25z" /><path d="M79 138q26 12 54-1l5 10q-32 16-63 0z" />
      <path d="M126 176l10-4m-9 8 2 7m4-9 2 7" stroke="#dc9c91" strokeWidth="2" />
    </>}
    {item === 'acc_keychain' && <>
      <circle cx="136" cy="181" r="4.5" fill="none" stroke="#f1c27d" strokeWidth="2.5" />
      <path d="M135 185q-10 17 7 23 16 3 18-11-10 3-15-2l-4-9z" />
      <path d="M132 194l10-2m-7 10 12-7m-1 13 5-10" fill="none" stroke="#504458" strokeWidth="3.5" />
    </>}
  </g>
}

function Aura({ item, motion = false }: { item?: string; motion?: boolean }) {
  const glow = useId()
  if (!item) return null
  const color = item === 'effect_study_flame' ? '#ffad61' : item === 'effect_crimson' ? '#fa5576'
    : item === 'effect_galaxy' ? '#9677f1' : '#ffcf77'
  return <g data-avatar-part="aura" data-aura={item} className={motion ? 'avatar-aura-motion' : undefined}>
    <defs><radialGradient id={glow}>
      <stop offset=".35" stopColor={color} stopOpacity=".06" />
      <stop offset=".72" stopColor={color} stopOpacity=".6" />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </radialGradient></defs>
    <ellipse cx="115" cy="117" rx="113" ry="110" fill={`url(#${glow})`} />
    {item === 'effect_sparkle' && <g fill="#ffe3a0" stroke="#a97d48" strokeWidth="1.2">
      <path d="M21 64l3 9 9 3-9 3-3 9-3-9-9-3 9-3zm178-26 4 11 11 4-11 4-4 11-4-11-11-4 11-4zm18 137 3 8 8 3-8 3-3 8-3-8-8-3 8-3zm-175-40 3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
      <circle cx="213" cy="95" r="3" /><circle cx="18" cy="164" r="2.5" /><circle cx="52" cy="205" r="2" />
    </g>}
    {item === 'effect_study_flame' && <>
      <path d="M52 203C16 188 4 170 19 130c3 18 9 22 16 26-4-18 5-29 15-42-6 19 12 32 9 50-2 11-3 24-7 39zM184 202c40-20 56-47 42-75-3 11-8 18-17 23-1-23-10-34-21-48 5 23-9 36-7 57 0 13 4 26 3 43z"
        fill="#f87859" fillOpacity=".78" stroke="#ffd783" strokeWidth="2" />
      <path d="M43 195q-18-12-13-35 3 13 10 16-1-13 8-24 5 27-5 43zm153-4q20-16 19-33-7 12-14 13 0-17-9-24-9 28 4 44z" fill="#ffe0a0" />
      <g fill="#e56c53"><circle cx="218" cy="107" r="3.4" /><circle cx="23" cy="109" r="2.6" /><circle cx="196" cy="73" r="2.3" /></g>
    </>}
    {item === 'effect_crimson' && <g fill="none" stroke="#f77e87">
      <circle cx="116" cy="118" r="96" strokeWidth="4" /><circle cx="116" cy="118" r="104" strokeDasharray="2 8" strokeWidth="2.5" />
      <path d="M21 111q-4-42 18-64m174 42q12 48-8 80M31 164q8 23 30 36" stroke="#ffe2ac" strokeWidth="3" strokeLinecap="round" />
      <path d="M19 88l5 5-5 5-5-5zm197 36 6 6-6 6-6-6zm-21-81 5 5-5 5-5-5z" fill="#ffd2ba" />
    </g>}
    {item === 'effect_galaxy' && <>
      <ellipse cx="116" cy="121" rx="112" ry="71" transform="rotate(-28 116 121)" fill="none" stroke="#ae85ef" strokeWidth="8" strokeOpacity=".64" />
      <ellipse cx="116" cy="121" rx="112" ry="71" transform="rotate(-28 116 121)" fill="none" stroke="#eee0ff" strokeWidth="2" />
      <path d="M10 149q25 47 110 12 80-34 97-85M22 179q24 21 64 17" fill="none" stroke="#b483ed" strokeWidth="2.6" strokeLinecap="round" />
      <g fill="#eee0ff" stroke="#8958bb" strokeWidth="1.2">
        <path d="M197 31l4 10 10 4-10 4-4 10-4-10-10-4 10-4zM26 139l3 9 9 3-9 3-3 9-3-9-9-3 9-3zm191-21 3 6 6 3-6 3-3 6-3-6-6-3 6-3z" />
        <circle cx="173" cy="200" r="3.2" /><circle cx="221" cy="83" r="3.3" /><circle cx="46" cy="199" r="2.1" />
      </g>
    </>}
    {item === 'effect_champion' && <g fill="#ffe7a2" stroke="#bd8643" strokeWidth="2">
      <path d="M19 65l3 7 7 3-7 3-3 7-3-7-7-3 7-3zm190-26 4 9 9 4-9 4-4 9-4-9-9-4 9-4zm13 121 3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
      <circle cx="29" cy="113" r="2.5" /><circle cx="218" cy="108" r="3" />
      <path d="M108 199q-73 0-88-70m88 70q75 0 94-70" fill="none" strokeWidth="3" />
      <path d="M37 167q-19 0-22-19 17 5 22 19zm34 23q-23 5-33-14 24-1 33 14zm108-23q19 0 22-19-17 5-22 19zm-34 23q23 5 33-14-24-1-33 14z" />
    </g>}
  </g>
}

function AvatarLayer({ layer, item, fur }: { layer: Layer; item?: string; fur: string }) {
  const entry = item ? ITEMS.get(item) : undefined
  if (!item || entry?.layer !== layer) return null
  const color = entry.color
  switch (layer) {
    case 'fur': return <Raccoon color={fur} />
    case 'bottoms': return <Bottoms item={item} color={color} />
    case 'shoes': return <Shoes item={item} color={color} />
    case 'top': return <Top item={item} color={color} />
    case 'outerwear': return <Outerwear item={item} color={color} />
    case 'face': return <Face item={item} />
    case 'furStyle': return <FurStyle item={item} color={fur} />
    case 'headwear': return <Headwear item={item} color={color} />
    case 'eyewear': return <Eyewear item={item} color={color} />
    case 'accessory': return <Accessory item={item} color={color} />
    case 'effect': return <Aura item={item} />
    case 'background': return <Background item={item} />
  }
}

type AvatarProps = AvatarSource & { size?: number; alt?: string; className?: string }

export function Avatar({ crown_expires_at, ...props }: AvatarProps) {
  const champion = useCrownTimeLeft(crown_expires_at) !== null
  return <AvatarArt {...props} champion={champion} />
}

export function AvatarArt({ size = 48, alt = '', className = '', champion, ...source }: Omit<AvatarProps, 'crown_expires_at'> & {
  champion: boolean
}) {
  const outfit = resolveOutfit(source)
  const fur = ITEMS.get(outfit.fur ?? DEFAULT_OUTFIT.fur)?.color ?? STARTER_FUR
  return (
    <svg viewBox={size <= 40 ? '8 9 224 224' : '0 0 240 240'} width={size} height={size}
      role={alt ? 'img' : undefined} aria-label={alt ? (champion ? `${alt}, weekly champion` : alt) : undefined} aria-hidden={alt ? undefined : true}
      className={`block shrink-0 rounded-[23%] ${className}`}>
      <Background item={outfit.background} />
      <Aura item={champion ? 'effect_champion' : outfit.effect} motion={champion || size >= 80} />
      <ellipse cx="117" cy="223" rx="64" ry="8" fill={INK} opacity=".23" />
      {LAYERS.slice(2).map((layer) => layer === 'headwear' && champion
        ? <CrownHeadwear key={layer} />
        : <AvatarLayer key={layer} layer={layer} item={outfit[layer]} fur={fur} />)}
    </svg>
  )
}

const DETAIL_VIEW: Record<Layer, string> = {
  top: '44 130 124 69', outerwear: '41 132 130 70', bottoms: '65 170 82 48', shoes: '64 197 84 37',
  fur: '10 7 192 144', furStyle: '10 4 192 144', face: '39 61 135 78', headwear: '18 7 176 112',
  eyewear: '38 66 136 52', accessory: '46 131 134 88', effect: '0 0 240 240', background: '0 0 240 240',
}

export function AvatarItemArt({ item, fur }: { item: AvatarItem; fur?: string }) {
  const furColor = (item.layer === 'fur' ? item.color : ITEMS.get(fur ?? DEFAULT_OUTFIT.fur)?.color) ?? STARTER_FUR
  const facePreview = item.layer === 'fur' || item.layer === 'furStyle' || item.layer === 'face'
  const view = item.id === 'bowtie' ? '82 138 48 29' : DETAIL_VIEW[item.layer]
  return <svg viewBox={view} className="size-full" aria-hidden>
    {facePreview && <RaccoonHead color={furColor} />}
    {(item.layer === 'fur' || item.layer === 'furStyle') && <Face item={DEFAULT_OUTFIT.face} />}
    {item.layer !== 'fur' && <AvatarLayer layer={item.layer} item={item.id} fur={furColor} />}
  </svg>
}
