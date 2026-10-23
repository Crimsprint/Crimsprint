# Mechanics → SAT mapping (Phase 3)

**Inputs**
- [duolingo-mechanics-map.md](duolingo-mechanics-map.md): the `#n` references below point to its rows.
- [sat-spec.md](sat-spec.md): the `[S1]` and similar references point to its sources.
- [../data/skill-taxonomy.json](../data/skill-taxonomy.json)

**Labels**
- **[OBSERVED]**: the pattern was seen in Phase 1. The design copies its behaviour, with our own branding.
- **[VERIFIED]**: an official SAT fact from Phase 2.
- **[ASSUMPTION — unverified]**: our design. This covers everything Phase 1 could not observe (completion screen, path locking, streak rules, leagues, achievements), designed from scratch as agreed.

Every number below is a starting value we can change later, not a claim about Duolingo.

---

## 1. Summary

| Duolingo mechanic | SAT form | Basis |
|---|---|---|
| Guest-first start (#1) | Anonymous user on first tap, upgraded to email/Google later | [OBSERVED] |
| One-question onboarding steps (#2–7) | `/onboarding?step=` goal → test date → scores → daily goal → diagnostic | [OBSERVED] pattern |
| Self-reported grade placement (#7) | **Adaptive diagnostic** (24 items) seeds per-skill mastery | [ASSUMPTION] |
| Daily goal stored as points (#6) | Minutes shown in the UI, stored as points | [OBSERVED] 10 min → 20 points; other options [ASSUMPTION] |
| Skill path (#31) | Section → domain → skill unit → 3 tier levels → unit check | Structure [OBSERVED]; locking [ASSUMPTION] |
| Jump-ahead test (#8) | Per-unit "test out" | [OBSERVED, pane]; rules [ASSUMPTION] |
| 15-challenge server session (#11) | 8-item micro-lesson on one skill | [OBSERVED] pattern; size [ASSUMPTION] |
| In-session repeats (#12) | A missed item is re-asked once at the end | [OBSERVED] duplicates; rule [ASSUMPTION] |
| Client-side grading (#14) | **Server-side grading everywhere** | Deliberate change |
| Check → feedback sheet (#16) | Same flow, plus explanation and "why each wrong answer is wrong" | [OBSERVED] + new |
| Per-answer telemetry (#17) | `responses` row per attempt | [OBSERVED] fields |
| Hearts (#19) | Mistake budget per lesson; off in diagnostic, review and mock test | [ASSUMPTION] (deliberate change) |
| Toolkit calculator (#20) | Graphing calculator in Math lessons and mock test | [OBSERVED] + [VERIFIED] Desmos in Bluebook |
| Report (#21) | "Report a problem", sent to an admin queue | [OBSERVED] |
| Streak, milestones, freeze (#23–25) | Streak with 7/14/30/50-day milestones; freezes earned, not bought | Fields [OBSERVED]; rules [ASSUMPTION] |
| Daily quests (#27) | 3 daily challenges | Count [OBSERVED]; content [ASSUMPTION] |
| Leagues (#28) | Weekly leagues, opt-out | [ASSUMPTION] |
| Mistakes inbox (#29) | Spaced-review queue + "Practice weak skills" | Store [OBSERVED]; schedule [ASSUMPTION] |
| Completion screen (#34) | Designed from scratch | [ASSUMPTION] |
| Achievements (#35) | Designed from scratch | [ASSUMPTION] |
| *new* | Full adaptive mock test mirroring Bluebook | [VERIFIED] structure; scoring [ASSUMPTION] |
| *new* | Progress dashboard | [ASSUMPTION] |
| Gems/shop (#25–26), survey (#5), experiments (#36), friends | **Skipped in v1** | — |

---

## 2. Onboarding

Guest-first. The first tap creates a Supabase anonymous user, mirroring Duolingo's trial account (#1). Once there is progress worth saving, "Save your progress" upgrades it to an email or Google account.

Screens, one question each, with Continue disabled until answered (#2, [OBSERVED] pattern):

1. **Goal:** first SAT / retake.
2. **Test date:** a date picker, or "not booked yet".
3. **Scores:** current score (optional, 400–1600 in steps of 10) and target score (required). Both are validated to the official scale [VERIFIED S1 Table 2].
4. **Daily goal:** 5 / 10 / 15 / 20 min, stored as **10 / 20 / 30 / 40 points**. Only 10 → 20 was observed; the linear mapping is [ASSUMPTION].
5. **Diagnostic offer:** "Take a 25-min diagnostic" (recommended) or "Start from the beginning". Skipping sets every skill's mastery to its prior (see §4).
6. Then straight into the diagnostic or the first lesson. There is no home screen first (#10, [OBSERVED]).

**Points (shared by daily goal, leagues and quests) [ASSUMPTION]**
- 2 points for a correct item, 1 point for an incorrect one, +3 for completing a lesson. Re-asked items earn nothing.
- One 8-item lesson earns about 15–19 points, so the 10-minute goal is roughly one lesson. That fits the SAT's ~1.2–1.6 min per question [VERIFIED S1 Table 7].

---

## 3. Learning path

**Structure.** Section → Domain → Skill unit → 3 levels (easy, medium, hard) → unit check. That makes 29 units across the 8 domains in the taxonomy. Duolingo's unit / level / session nesting (#31) is the model.

**Node states**

| State | Rule [ASSUMPTION] | Theme token |
|---|---|---|
| Locked | Previous level in this unit not complete | `--color-locked` (slate) icon on gray-200 |
| Current | First unlocked, incomplete level | crimson ring |
| Completed | Level passed (see below) | `--color-success` + check icon |

**Rules [ASSUMPTION]**
- **Pass a level:** finish a lesson at that tier with ≥ 75% of first attempts correct (6 of 8). The rule is proportional because some tiers hold fewer than 8 items. A lesson ended by the mistake budget does not pass.
- **Unit order:** units are independent across domains. The learner can start any domain's first unit, which suits SAT prep better than one long line. Within a unit, the levels run in sequence.
- **Recommended next:** a highlighted node on the unit with the lowest mastery × domain weight (domain shares [VERIFIED S1]).
- **Test out ("jump ahead", #8):** an 8-item mixed-tier check on any locked unit. ≥ 87.5% correct (7 of 8) marks all of its levels complete. The mistake budget is off.

---

## 4. Mastery model

**Model (Elo / Rasch-1PL style) [ASSUMPTION]**
- Each `(user, skill)` has an ability **θ**.
- Each item has a difficulty **b**, seeded from its tier: easy −1.0, medium 0.0, hard +1.0.
- Probability of answering correctly: `P = 1 / (1 + e^-(θ − b))`.
- After each **first** attempt on an item: `θ ← θ + K·(correct − P)`, where `K = max(0.2, 0.8 / √(1 + n))` and `n` is the number of prior attempts on that skill. K starts large and settles down.
- The prior is θ = 0, or the diagnostic estimate.
- Retries and the end-of-lesson re-ask don't update θ, so seeing an answer can't game mastery.
- **Mastery %** = `P(correct on a medium item)` = `σ(θ)`. Bands: < 40% weak, 40–70% developing, ≥ 70% strong.

**Why this model.** It is one formula, updates online, needs no calibration data on day one, and stays compatible with real 1PL IRT if we later fit `b` from response data.

**Diagnostic [ASSUMPTION]**
- 24 items: 3 per domain × 8 domains.
- Per domain, start on a medium item; a correct answer moves the next item up a tier, a wrong one moves it down.
- Domain θ comes from the same update (with K = 0.8 fixed), then copies to each skill in that domain as its prior.
- No feedback during the diagnostic. A summary is shown at the end.

---

## 5. Lessons

- **Size:** 8 items, one skill. Within the 5–10 range in the brief; smaller than Duolingo's 15 (#11) because SAT items take longer.
- **Selection [ASSUMPTION]:** items within ±0.5 of the learner's θ in that level's tier. Prefer items not seen in 14 days, and include up to 2 items that are due for spaced review on the same skill.
- **Item types:**
  - MCQ (4 options) [VERIFIED].
  - Grid-in numeric, graded by the official entry rules [VERIFIED S7].
  - Passage-based MCQ, 25–150 words [VERIFIED S1].
- **Choice shuffle:** per attempt, with the displayed order stored (#15).
- **Flow:** select → **Check** (disabled until an answer is given) → feedback sheet → Continue (#16).
  - **Correct:** success background, white text, check icon, "Correct", plus the explanation (collapsed).
  - **Incorrect:** white background, crimson top border, ink text, X icon, "Incorrect", the correct answer, the explanation, and the rationale for the chosen distractor.
  - Correctness is never shown by colour alone (theme rule 5).
- **Re-ask:** a missed item is appended once to the end of the queue (#12). The progress bar is answered ÷ (total + re-asks), so it never moves backwards (#18).
- **Mistake budget:** 5 per lesson, shown as a counter.
  - Hitting 0 ends the lesson with "Review these mistakes", and nothing is locked.
  - The budget resets with each lesson. Unlike Duolingo's 6-hour heart regeneration (#19), there is no time lockout, because blocking practice hurts test prep.
  - Off in the diagnostic, review sessions, test-out (on by default in lessons, user-configurable) and the mock test. [ASSUMPTION]
- **Grading:** on the server, by RPC, for **every** mode. Answers never reach the client before submission. This deliberately departs from #14.
- **Calculator:** Math lessons have a calculator button (#20). Graphing, per Bluebook [VERIFIED].
- **Report:** a link on every feedback sheet (#21).

**Completion screen (designed from scratch) [ASSUMPTION]**
- Points earned, accuracy (x/8), and total time with a per-item average.
- Mastery change for the skill (e.g. "Linear functions 52% → 58%").
- Daily goal ring progress and streak status (+1 if this is today's first completed session).
- "N items added to review", and any quest progress.
- Primary button: Continue. Secondary: Review mistakes.

---

## 6. Spaced review [ASSUMPTION]

**Item level (Leitner boxes)**
- A missed item enters box 1. Intervals are box 1 = 1 day, 2 = 3 d, 3 = 7 d, 4 = 14 d, 5 = 30 d.
- A correct answer promotes the item one box; a wrong one sends it back to box 1. Correct in box 5 retires it.
- This is our version of the mistakes store (#29).

**Skill level.** "Practice weak skills" builds an 8-item lesson from the 2 lowest-mastery skills (< 40%), weighted by domain share.

**Review session.** Up to 10 due items, any skill, with no mistake budget. The home screen shows a "N due for review" badge.

Leitner over SM-2 because it has five fixed intervals, is easy to test, and its behaviour is easy to explain to students.

---

## 7. Gamification [ASSUMPTION unless noted]

### Streak
- `streak_days` + `last_active_local_date` + `timezone` (an IANA name, captured at signup). Field set modelled on #23.
- **Day key** = the local date in the user's stored timezone when a session completes.
- One completed session (lesson, review, test-out or mock module) extends the streak. The daily goal is tracked separately.
- **Rules:**
  - `last == today` → no change.
  - `last == today − 1` → +1.
  - `last == today − 2` and a freeze is held → consume the freeze, +1.
  - Otherwise → reset to 1.
- **Timezone edges (unit-tested):**
  - Changing timezone never yields two increments on one calendar day.
  - Day keys are computed server-side from the stored timezone, never from the client clock.
  - DST transitions are tested.
  - Changing timezone after already counting today doesn't count again.
- **Freezes:** earn 1 at each milestone, hold at most 2 (the cap is [OBSERVED] in #25). They are never sold.
- **Milestones:** 7 / 14 / 30 / 50 days ([OBSERVED] tiers, #24), each with a badge.

### Daily goal
A ring showing points today against the goal. Meeting it fires a small celebration. There is no currency.

### Daily quests
- 3 per day (count [OBSERVED] #27), drawn at the start of the local day from a pool:
  - finish 2 lessons
  - get 5 correct in a row
  - answer 1 hard item correctly
  - clear 5 review items
  - spend 15 min in practice
  - complete a mock module
- Quests give points only.

### Weekly leagues
- Cohorts of up to 30 learners, at 5 tiers. Names are our own and neutral: **Pencil, Notebook, Compass, Protractor, Summit**.
- Ranked by weekly points. The week resets Monday 00:00 UTC.
- The top 7 are promoted and the bottom 5 relegated. Pencil has no relegation and Summit no promotion.
- Opt-out setting (Duolingo has a similar flag, #28). Only display handles are shown, never real names, since many users are minors.

### Achievements
Chocolate accent, used only here:

| Achievement | Trigger |
|---|---|
| First Step | First lesson |
| Diagnosed | Diagnostic done |
| On a Roll | 7-day streak |
| Fortnight | 14-day streak |
| Month Strong | 30-day streak |
| Half-Century | 50-day streak |
| Domain Master | All units in a domain ≥ 70% mastery |
| Full Run | First full mock test |
| Comeback | Retire 25 review items |
| Sharpshooter | 100% on a hard-tier lesson |

---

## 8. Mock test (new)

**Structure [VERIFIED S1]:** Reading and Writing, then Math.
- 2 modules each: 27 items / 32 min and 22 items / 35 min.
- A 10-minute break between sections.
- **We score all items** and include no unscored items, a deliberate difference.

**Bluebook behaviour mirrored [VERIFIED S1]**
- Free navigation within a module. No return to Module 1 or to Reading and Writing.
- Module 1 auto-submits at time-out.
- Flag for review, plus a module review screen showing answered, unanswered and flagged.
- The timer can be hidden until 5 minutes remain. Under 5 minutes, a crimson banner with white text (theme brief).
- Calculator (graphing) and reference sheet in Math. Highlight and notes in Reading and Writing: **v2, skipped in v1**.
- Reading and Writing order within a module: Craft and Structure → Information and Ideas → Standard English Conventions → Expression of Ideas, easiest to hardest within each skill (Standard English Conventions ordered by difficulty only) [VERIFIED S1 Table 9].

**Assembly [ASSUMPTION]**
- Module 1 is about one-third each of easy, medium and hard, with domain counts proportional to the official shares.
- Module 2 has a "higher" variant (tilted medium/hard) and a "lower" variant (tilted easy/medium).
- **Routing:** if Module 1 accuracy is ≥ 60%, the student gets the higher variant. College Board does not publish its threshold.

**Score estimate [ASSUMPTION]**
- Per section, find θ by 1PL maximum likelihood over all items using their `b` values.
- Map to the 200–800 scale with a linear transform clamped to that range, rounded to 10.
- Shown as **"Estimated 560–620"** (±30) with a permanent label: *"Estimate only, not an official College Board score."*
- The total is the sum of the two sections, shown as a range.

Grading is **server-side only**. Items are served one module at a time and answer keys never reach the client.

**Results:** section and total estimate ranges, per-domain accuracy, time per question, flagged-but-wrong items, and "add all misses to review".

---

## 9. Progress dashboard [ASSUMPTION]

- **Mastery** by domain and skill, as bars.
- **Accuracy** and **median time per question** compared with the SAT pace (1.19 min for Reading and Writing, 1.59 min for Math [VERIFIED]).
- **Trend:** weekly mastery and mock estimates over time.
- **Days to test** and the gap to the target score.
- Charts are single-series crimson bars with direct value labels, a hover title, and a table view. The brief's five-colour order (crimson, slate, chocolate, putty, success) failed a colour-blindness and contrast check: chocolate and putty fall outside the usable lightness range, slate reads as grey, and crimson is 2:1 on the dark surface. So no chart depends on telling colours apart. [Validated with the dataviz palette checker]

---

## 10. Theme hooks (applied in Phase 4)

| Theme brief item | Where it lands |
|---|---|
| CTA crimson / white | Start lesson, Check, Continue |
| Progress bar crimson on gray-200 | §5 lesson bar |
| Node states | §3 table |
| Feedback sheets | §5 flow |
| Streak and goal ring crimson | §7 |
| Timer banner < 5 min | §8 |
| Chart order | §9 |

---

## 11. Skipped in v1

- Gems, shop and premium.
- The acquisition survey.
- Friends and social feed.
- Experiments infrastructure.
- Push and email reminders, and in-app intro banners (#32).
- Highlights and notes in the mock test.
- Progress quiz (#33); the mock test covers it.
