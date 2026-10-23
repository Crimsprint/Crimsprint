// Display copy for achievement codes awarded in supabase/migrations/0002_gamification_mock_admin.sql.
export const ACHIEVEMENTS: Record<string, { title: string; how: string }> = {
  first_step: { title: 'First Step', how: 'Finish your first lesson' },
  diagnosed: { title: 'Diagnosed', how: 'Complete the diagnostic' },
  streak_7: { title: 'On a Roll', how: 'Reach a 7-day streak' },
  streak_14: { title: 'Fortnight', how: 'Reach a 14-day streak' },
  streak_30: { title: 'Month Strong', how: 'Reach a 30-day streak' },
  streak_50: { title: 'Half-Century', how: 'Reach a 50-day streak' },
  domain_master: { title: 'Domain Master', how: 'Reach 70% mastery on every skill in a domain' },
  full_run: { title: 'Full Run', how: 'Finish a full mock test' },
  comeback: { title: 'Comeback', how: 'Retire 25 review questions' },
  sharpshooter: { title: 'Sharpshooter', how: 'Get 100% on a hard lesson' },
}
