import { expect, it } from 'vitest'
import { crownBanner } from '../src/lib/crownBanner'

const rules = { first_week: '2026-11-23', min_active_members: 3, min_winner_points: 50 }
const eligibleWeekEnd = '2026-11-30'
const members = (ownRank: number, ...scores: number[]) => scores.map((points, rank) => ({ points, me: rank === ownRank }))

it('announces the start even if the current pre-launch leader meets all scoring thresholds', () => {
  expect(crownBanner(rules.first_week, rules, members(0, 70, 30, 20))).toEqual({
    title: 'Crowns start next week. Finish #1 to wear one.',
  })
})

it('counts only point earners and shows the progress toward the configured active-player minimum', () => {
  expect(crownBanner(eligibleWeekEnd, rules, members(0, 65, 2, 0, 0))).toEqual({
    title: 'Crowns unlock when 3 players in your league score this week',
    detail: '2 of 3 players have scored.',
  })
})

it('shows how many points the leader still needs once the cohort has enough scorers', () => {
  expect(crownBanner(eligibleWeekEnd, rules, members(0, 39, 20, 12))).toEqual({
    title: "You're #1. Reach 50 points to claim the crown",
    detail: '11 more points needed.',
  })
})

it('shows that the leader is on track exactly at both thresholds', () => {
  expect(crownBanner(eligibleWeekEnd, rules, members(0, 50, 20, 12))).toEqual({
    title: 'Finish #1 this week to earn the crown',
    detail: "You're on track for the crown",
  })
})

it('keeps the gap and tie messages for a player behind the lead', () => {
  expect(crownBanner(eligibleWeekEnd, rules, members(1, 52, 51, 12)).detail).toBe('1 point behind #1')
  expect(crownBanner(eligibleWeekEnd, rules, members(1, 52, 52, 12)).detail).toBe('Tied on points · 1 more point to take the lead')
})
