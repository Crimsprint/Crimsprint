# Weekly league crowns

The league week runs from Monday 00:00 UTC to the next Monday 00:00 UTC. At the cutoff, each cohort with at least three eligible point earners can award a crown to its top scorer if they earned at least 50 points. A learner is active for this rule once they earn a point that week. Anonymous accounts and learners opted out at the cutoff are excluded from the ranking and active count. The first learner to reach the winning score wins a tie. If the recorded timestamps are identical, the ID provides a stable final order.

The crown is visible from the cutoff for seven days. Leaving leagues hides the active crown and public profile immediately. A crown already won stays in the learner's history, and the award does not pass to a runner-up when someone changes their opt-out setting after the cutoff.

## Storage and rollout

Apply [0014_weekly_league_crowns.sql](../supabase/migrations/0014_weekly_league_crowns.sql) after 0013 and before deploying the crown client. The two thresholds are in the single row in `league_crown_rules`. The first eligible period is the first full UTC league week after installation, because older totals lack the exact times and opt-out history needed to judge ties fairly.

Crown reads use the existing UTC league totals and cohort memberships. The migration adds a timestamp when a score changes and records opt-out transitions. It does not schedule a job or store award rows. Crown history is derived from retained league data, so historical results can change if accounts or scores are deleted. Tuning the rules applies to all eligible weeks.

New RPCs provide the crowned own avatar, own profile history, leaderboard rows, and the allowlisted public profile. A public profile link is visible to signed-in league participants who share the current cohort, or who were in the champion's previous cohort. Existing RPCs and owner-only table access continue to work with the previous client.
