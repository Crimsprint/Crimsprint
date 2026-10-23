/** Whole days from today (local) to an ISO date. */
export function daysUntil(isoDate: string, today = new Date()) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000)
}
