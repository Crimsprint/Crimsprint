export type CrownRules = { first_week: string; min_active_members: number; min_winner_points: number }

type ScoredMember = { points: number; me: boolean }

const pointLabel = (n: number) => n === 1 ? 'point' : 'points'

export function crownBanner(weekEnd: string, rules: CrownRules, members: ScoredMember[]): { title: string; detail?: string } {
  // Both dates are UTC Mondays. A week that ends on first_week still precedes the first eligible week.
  if (weekEnd <= rules.first_week) return { title: 'Crowns start next week. Finish #1 to wear one.' }

  const active = members.filter((member) => member.points > 0).length
  if (active < rules.min_active_members) return {
    title: `Crowns unlock when ${rules.min_active_members} players in your league score this week`,
    detail: `${active} of ${rules.min_active_members} players have scored.`,
  }

  const title = 'Finish #1 this week to earn the crown'
  const myRank = members.findIndex((member) => member.me)
  if (myRank < 0) return { title }

  if (myRank === 0) {
    const needed = rules.min_winner_points - members[0].points
    if (needed > 0) return {
      title: `You're #1. Reach ${rules.min_winner_points} points to claim the crown`,
      detail: `${needed} more ${pointLabel(needed)} needed.`,
    }
    return { title, detail: "You're on track for the crown" }
  }

  const gap = members[0].points - members[myRank].points
  return {
    title,
    detail: gap === 0 ? 'Tied on points · 1 more point to take the lead' : `${gap} ${pointLabel(gap)} behind #1`,
  }
}
