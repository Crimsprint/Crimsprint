/** Whole days from today (local) to an ISO date. */
export function daysUntil(isoDate: string, today = new Date()) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000)
}

/** "2d 4h", "5h 12m" or "12m" until `end`. */
export function timeLeft(end: Date, now = new Date()) {
  const m = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 60_000))
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`
}

/** Next local midnight (daily quests reset in the learner's time zone). */
export const nextMidnight = (now = new Date()) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

/** 00:00 UTC on an ISO date: when a league week (and its weekly quests) ends. */
export const utcDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`)
