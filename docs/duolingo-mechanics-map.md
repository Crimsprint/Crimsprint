# Duolingo web: learning-loop mechanics map (Phase 1)

Captured 2026-10-23 from `https://www.duolingo.com`, using the **Math** course because it is the closest match to SAT practice.

**How it was captured**
- REA `capture_browser_scenario`: headless Chrome 155, a fresh profile for every run, 390×844 (phone) viewport, network request and response bodies retained. REA evidence IDs are listed under Sources.
- The in-app browser pane (desktop viewport) was used to step through screens interactively. Those screenshots are labelled "pane".
- Everything here is **logged-out / guest only**. No credentials were entered.

**Labels**
- **[OBSERVED via REA]**: seen in a REA capture (DOM, accessibility tree, network body, or tracking event).
- **[OBSERVED, pane]**: seen in the interactive browser pane, not in a REA capture.
- **[ASSUMPTION — unverified]**: inferred and not proven.

The `NN-name.png/jpg` names in the Evidence column refer to screenshots taken during the research session. They are not kept in this repository because they contain Duolingo's art. The REA network and accessibility evidence quoted below is reproduced as text.

---

## 1. Mechanics table

| # | Mechanic | What it does | Evidence | Confidence | SAT equivalent |
|---|---|---|---|---|---|
| 1 | **Course picker** | `/register` lists subjects as buttons (languages, Chess, Math). Picking one creates a guest ("trial") account straight away, with no email or password. | `02-course-picker.png`. `POST /2023-05-23/users` returns `{id}`, with body `{distinctId, timezone, currentCourseId, fromLanguage, landingUrl, …}`. Tracking event `$create_alias`, then `trackingProperties.trial_account: true`. **[OBSERVED via REA]** | High | Let a learner start without signing up: create an anonymous user, then upgrade it to a full account (Supabase anonymous sign-in → link identity). |
| 2 | **Onboarding as a URL-addressed step machine** | `/welcome?welcomeStep=<step>`. Each step is one question with a disabled **Continue** button that enables once an answer is chosen. A progress bar runs across the top. Math order: intro → intro → `mathLearningContext` → `learningReason` → `hdyhau` → `dailyGoal` → `mathSelection` → 2 motivation screens → first lesson. | Accessibility tree shows `button "Continue" [disabled]` until a radio is selected (`03-user-type.png`). Step names come from the URL. **[OBSERVED via REA]** | High | `/onboarding?step=goal|testDate|targetScore|dailyMinutes|diagnostic`, with one question per screen. |
| 3 | **User type** | Single choice: Student / Adult learner. | `PATCH /1/users/{id}/math-onboarding {"userType":"student"}` **[OBSERVED via REA]** | High | "Who are you": student grade, test date. |
| 4 | **Learning reason** | Multi-select checkboxes (Practice skills, Homework, Study for a test, …). | `math-onboarding {"learningReasons":"test","userType":"student"}`. A parallel `PATCH /users/{id} {"motivation":"test"}` was rejected **422**, because the generic `motivation` enum is language-only (`none, travel, work, …`). **[OBSERVED via REA]** | High | Goal: target score / first-time vs retake. |
| 5 | **"How did you hear" survey** | Marketing attribution question shown inside onboarding. | `PATCH /users/{id} {"acquisitionSurveyReason":"googleSearch"}` (`05-hdyhau.jpg`) **[OBSERVED via REA]** | High | Optional. Skip for v1. |
| 6 | **Daily goal** | 5 / 10 / 15 / 20 min per day (Casual / Regular / Serious / Intense). Stored as an **XP target, not minutes**. | Picking "10 min / day" sent `PATCH /users/{id} {"xpGoal":20}`. The default before picking was `xpGoal: 10` (`06-daily-goal.jpg`). **[OBSERVED via REA]** The exact minutes→XP table for 5/15/20 is **[ASSUMPTION — unverified]**; only 10 min → 20 XP was observed. | High (10→20), Low (others) | Daily goal stored as points, with minutes shown in the UI. |
| 7 | **Placement by self-report** | "Let's pick a starting point!" offers Grade 2–12. The choice picks the section the path starts in. There was no placement *test* at this step for Math. | `07-placement-grade.jpg`. Grade 5 led to a session `sectionGroup: "grade_5_grades_3"`, `math_level: "grade_5"`, `absolute_unit_index: 64` of `num_sections: 794`. **[OBSERVED via REA]** | High | Self-reported score band seeds the starting point, then the diagnostic refines it (our diagnostic is better than self-report). |
| 8 | **Jump-ahead / placement test** | An offer to "Pass this test to jump ahead to Section 3!" with Continue / Maybe later. | `13-jump-ahead-test.jpg` **[OBSERVED, pane]**. The account context is unclear; see the open questions. The pass threshold and item count were not observed. | Low | "Test out" of a unit: a short mastery check that unlocks the next unit. |
| 9 | **Motivation interstitials** | Two screens with no input ("It can be hard to stay motivated…", "…designed to be fun like a game!"), shown right before the first lesson. | `08-motivation.jpg` **[OBSERVED, pane + REA URL trace]** | High | A short "how this works" screen (streak + daily goal). |
| 10 | **First lesson starts immediately after onboarding** | No path or home screen first. The guest lands directly in `/lesson/unit/65/level/1`. | REA step trace: the URL changes to `/lesson/unit/65/level/1` on the last Continue. **[OBSERVED via REA]** | High | After the diagnostic, drop straight into the first micro-lesson. |
| 11 | **Lesson = server-built batch of 15 challenges** | `POST /2023-05-23/sessions` returns `{id, challenges[15], type:"MATH_LESSON", skillId, levelSessionIndex, metadata{mathJson, progressActionJson}, isLlmGenerated:false, trackingProperties{math_challenge_ids, activity_uuid}}`. The request declares the client's supported `challengeTypes` (74 values). | API shape in §2. **[OBSERVED via REA]** | High | `POST /api/sessions {skillId}` returns 5–10 items picked by the scheduler. |
| 12 | **Repeats inside a lesson** | The 15 challenge IDs contained **2 duplicates** (0-based positions 7 & 11, 9 & 10), so some items are planned to recur in the same session. The tracking event has a `repetition_number` field. | `session_start.math_challenge_ids` **[OBSERVED via REA]**. Why those items repeat is **[ASSUMPTION — unverified]**. | Medium | Re-ask a missed item later in the same session before it ends. |
| 13 | **Item format: prompt / answer area / grader** | Each challenge is a JSON blob: `layout`, `instruction` (LaTeX), `shirt` (the prompt: text, table, or `\duoblank{n}` blanks), `pants` (the answer UI: buttons, or an embedded HTML widget), `grading_function` (a JS function string), `hint`, `calculator_functions`. Layouts seen: `selectOne` ×3, `typeFill` ×4, `match` ×1, `shirtPantsInteractive` ×7. | Session response **[OBSERVED via REA]** | High | Item schema: `stem` (KaTeX/MDX), `choices` / `gridIn`, `answer`, `explanation`, `distractorRationales`, `skill`, `difficulty`. |
| 14 | **Grading happens in the client** | The answer key is embedded in `grading_function` (for example `correctAnswers = ["button_1"]`) and runs in the browser. It returns `[isCorrect, feedback]`. No network call is made per answer except an analytics event. | Session body and the network trace (no grading request between Check clicks) **[OBSERVED via REA]** | High | **Don't copy this.** Shipping answers to the client makes them trivially readable, which matters for a mock test that gives a score. Grade on the server for mock tests. Client grading is acceptable for low-stakes practice. |
| 15 | **Answer-choice shuffle** | `button_0` (the correct answer, "16") rendered last of three. | Pane screenshot compared with the blob **[OBSERVED, pane]** | Medium | Shuffle choices per attempt, and store the displayed order with each response. |
| 16 | **Check → feedback sheet → Continue** | The Check button stays disabled until something is selected. Correct shows a bottom sheet with a check icon, "Good job!" / "Great!", Continue, and Report. Incorrect shows an X icon, "Incorrect", "Correct Answer: 8", Continue, and Report. Choices become `[disabled]` after checking. | Accessibility tree: `heading "Incorrect"`, `math "Correct Answer: 8"` (`10-…`, `11-…`, `09-lesson-item.png`) **[OBSERVED via REA + pane]** | High | Same flow, plus our explanation and "why each wrong answer is wrong". Status shown with icon + text + colour. |
| 17 | **Per-answer telemetry** | The `canonical_math_challenge_response` event has `challenge_id, correct, math_user_response, time_taken (ms), order_index, repetition_number, math_challenge_layout, math_hint_tapped, math_help_tapped, current_hearts_segments, session_id`. | `/api/1/sync/batch` request body **[OBSERVED via REA]** | High | `responses` table: `item_id, correct, chosen, ms, position, attempt_no, hint_used`. This is the input to mastery and spaced review. |
| 18 | **Progress bar** | Top bar inside the lesson. It **advanced after an incorrect answer too** (shorter step). | Pane screenshots 10 → 11 **[OBSERVED, pane]**. The exact formula is **[ASSUMPTION — unverified]**. | Medium | Fill = answered / total. Re-queued items extend the bar rather than letting it go backwards. |
| 19 | **Hearts (lives)** | The account carries `health {hearts:5, maxHearts:5, secondsPerHeartSegment:21600 (6 h), useHealth:true, eligibleForFreeRefill:true}`. **In the first onboarding lesson, two wrong answers did not reduce hearts** (`current_hearts_segments` stayed 5) and no heart counter was shown in the lesson header. | User GET + answer events + accessibility tree **[OBSERVED via REA]**. Whether hearts apply to Math, or only after the first lesson, is **[ASSUMPTION — unverified]**. | Medium | Mistake budget per session (default 5), refilled over time. Off for diagnostic and mock test. |
| 20 | **In-lesson calculator ("Toolkit")** | The TOOLKIT button opens an on-screen calculator (π, xⁿ, √, arrows, digits, operators, %, =). The event field `is_math_workspace_button_shown`. | `12-toolkit-calculator.jpg`, accessibility tree `button "TOOLKIT"` **[OBSERVED]** | High | Built-in graphing calculator (Desmos or an alternative) in lessons and the mock test. |
| 21 | **Report an item** | A REPORT link on every feedback sheet. | Accessibility tree / screenshots **[OBSERVED]** | High | "Report a problem with this question", sent to an admin queue. |
| 22 | **Daily goal → XP and reward chests** | The user has `xpGoal`, `xpGains[]`, `xp_summaries` (per-day XP), and `rewardBundles` of type `DAILY_GOAL` containing gem chests (e.g. 13 and 8 gems). | User GET + `GET /users/{id}/xp_summaries?startDate=` **[OBSERVED via REA]** | High (data), — (UI not seen) | Daily goal ring: points per day, with a small reward when it's met. |
| 23 | **Streak** | Fields `streak`, `streakData{currentStreak, previousStreak, longestStreak{length,startDate,endDate,achieveDate}}`, `timezone`, `timezoneOffset`. | User GET **[OBSERVED via REA]**. The increment and timezone rules were not observed, so they are **[ASSUMPTION — unverified]**. | Medium | Streak stored per local calendar day using the user's IANA timezone. |
| 24 | **Streak goals (milestones)** | `GET /users/{id}/streak-goal-next-options` returns tiers `7d / 14d / 30d / 50d` with a `dayInterval` each. `streak-goal-current` returns `{hasActiveGoal, streakGoal{lastCompleteGoal, checkpoints[], nextSelectedGoal}}`. | Response body **[OBSERVED via REA]** | High | Streak milestones (7/14/30/50 days), each with a badge. |
| 25 | **Streak freeze (shop)** | Shop item `streak_freeze`: "Protect your streak if you miss a day… Equip up to 2", price 425 gems. | `GET /2023-05-23/shop-items` **[OBSERVED via REA]** | High | 1–2 "rest day" tokens earned by meeting the goal, not bought. |
| 26 | **Gems (currency)** | `gemsConfig {gems:500, gemsPerSkill:25}` for a new guest. | User GET **[OBSERVED via REA]** | High | Skip for v1. A currency adds economy design with little learning value. |
| 27 | **Daily quests** | A new user is assigned 3 daily quests on account creation, e.g. `daily_quest_name: "perfect_lessons_core_daily_quest"`, `daily_quest_difficulty: 0`. There is a `/quests` route. | `daily_quest_assigned` ×3 events **[OBSERVED via REA]**. The quest list UI was not seen (the route redirected; see #30). | Medium | Daily challenges: "finish 2 lessons", "3 correct in a row", "1 hard item". |
| 28 | **Leagues / leaderboards** | Event attributes `leaderboard_alias: "leagues"`, `leaderboard_league: 0`, `disable_leaderboards`. There is a `/leaderboard` route and a persistent notification `WEB_LEADERBOARDS_INTRODUCTION`. | Events + user GET **[OBSERVED via REA]**. Group size, promotion and demotion were not observed, so **[ASSUMPTION — unverified]**. | Low | Weekly leagues of about 30 users, ranked by points. Promotion/demotion rules are ours to design. |
| 29 | **Mistakes inbox (spaced review)** | `GET /v2/mistakes/users/{id}/courses/MATH_BT?requestType=INBOX` returns `{mistakes:[]}`, and `/count` returns `{numberMistakes}`. This is a per-user, per-course store of past mistakes that the client can query. | Response bodies **[OBSERVED via REA]**. The resurfacing schedule is server-side and not visible, so **[ASSUMPTION — unverified]**. | Medium | `review_queue` per user: missed items plus due dates (SM-2 / Leitner). "Review mistakes" session. |
| 30 | **Home, path and practice hub need a started course** | For the guest, `/learn` and `/practice-hub` redirect to `/onboarding/add-course`. `/leaderboard` and `/quests` load but showed no data. | REA step URLs (step 28 → `/onboarding/add-course`) **[OBSERVED via REA]** | High | — |
| 31 | **Path structure (unit → level → session)** | The lesson URL is `/lesson/unit/{unit}/level/{level}`. Session metadata gives `sectionId` → `levelId` / `curriculumNodeId` → `levelSessionIndex`, plus `num_sessions_in_node`, `level_index_in_unit`, `completesCurriculumNode:true`, `isFinalLevel`, `isRedoingPassedNode`, `path_position_*_active_unit_index / _node_index`. | Session request/response + `session_start` **[OBSERVED via REA]**. **Lock/unlock rules and the visual path were not observed** (#30). | Medium (structure), — (locking) | Section (R&W / Math) → Domain → Skill unit → Level (difficulty tier) → Session. A node unlocks when the previous one is complete. |
| 32 | **Reminders / notifications on web** | `practiceReminderSettings: {}`, a `webNotificationIds` field, the `notifications_enabled` event attribute, and `persistentNotifications` (`WEB_TO_APP_CONVERSION`, `WEB_LEADERBOARDS_INTRODUCTION`, `WEB_PROGRESS_QUIZ_INTRODUCTION`, `WEB_PLUS_TREE`), which are one-time in-app intro banners. | User GET **[OBSERVED via REA]**. No push prompt was seen. | Medium | One-time intro banners plus an optional daily email/push reminder. |
| 33 | **Progress quiz** | Persistent notification `WEB_PROGRESS_QUIZ_INTRODUCTION`. | User GET **[OBSERVED via REA]**. The feature itself was not seen. | Low | A periodic mini-check that estimates score movement, a lighter version of the mock test. |
| 34 | **Lesson completion screen** | **Not observed.** Completing the 15-item lesson needs the interactive `shirtPantsInteractive` / `typeFill` widgets, which the scripted headless run cannot answer reliably. | — | — | Completion: points earned, accuracy, time, streak +1, daily-goal ring. |
| 35 | **Achievements** | **Not observed** (needs a signed-in profile). | — | — | Badges (chocolate accent): first lesson, 7-day streak, first mock test, domain mastered. |
| 36 | **Client feature flags / experiments** | `GET /2023-05-23/config` returns `clientExperiments{name:{condition, rollout, conditions[], status}}` and `featureFlags`. The user GET also requests `experiments{…}` (e.g. `path_web_sections_overview`, `momentum_web_progress_bar_curving`). | Response body **[OBSERVED via REA]** | High | Out of scope for v1. A simple flags table is enough later. |

---

## 2. API shapes (field names and types only; values stripped)

```jsonc
// POST /2023-05-23/users            → creates guest
req  {distinctId, signal{siteKey, token, vendor}, timezone, currentCourseId, fromLanguage, landingUrl, initialReferrer, lastReferrer}
resp {id:int}

// GET /2023-05-23/users/{id}?fields=…   (profile; selected fields)
{ id, totalXp, xpGoal:int, xpGains:[], streak:int,
  streakData{currentStreak, previousStreak, longestStreak{length, startDate, endDate, achieveDate}},
  timezone, timezoneOffset,
  health{healthEnabled, hearts, maxHearts, secondsPerHeartSegment, secondsUntilNextHeartSegment, useHealth, unlimitedHeartsAvailable, eligibleForFreeRefill},
  gemsConfig{gems, gemsPerSkill, useGems},
  courses[{id:"MATH_BT", subject:"math", topic, xp, fromLanguage}], currentCourseId,
  rewardBundles[{id, rewardBundleType:"DAILY_GOAL", rewards[{rewardType:"CHEST", currency:"GEMS", amount, consumed}]}],
  practiceReminderSettings{}, persistentNotifications[str], sessionCount, … }

// POST /2023-05-23/sessions           → start lesson
req  {type:"MATH_LESSON", skillId, levelId, levelSessionIndex:int, isFinalLevel, isRedoingPassedNode,
      challengeTypes[74 str], juicy, isV2,
      metadata{mathJson:"{skillId, sectionGroup, fallbackSkillIds[], isOnboardingSession, …}",
               progressActionJson:"{type:'math_lesson', body{sectionId, levelId, curriculumNodeId, completesCurriculumNode}}"}}
resp {id, type, skillId, nodeId, levelSessionIndex, isLlmGenerated:bool,
      challenges[15]{id, type:"mathChallengeBlob", challengeSchemaVersion{major,minor,patch},
                     challengeBlob:"{layout, instruction, shirt, pants, grading_function, hint, calculator_functions}"},
      trackingProperties{math_challenge_ids[], activity_uuid, num_challenges_gt_challenge_blob},
      feedbackProperties{seed, contentVersion, codeVersion, cdnUrl}, metadata{…echo…}}

// PATCH /1/users/{id}/math-onboarding  {userType, learningReasons}
// PATCH /2023-05-23/users/{id}         {xpGoal} | {acquisitionSurveyReason} | {motivation}(422 for math)
// GET /users/{id}/streak-goal-current       {hasActiveGoal, streakGoal{userId, lastCompleteGoal, checkpoints[], nextSelectedGoal{length, dayInterval, tier}}}
// GET /users/{id}/streak-goal-next-options  {currentStreakOptions[{length, dayInterval, tier}] ×4, previous…, longest…}
// GET /v2/mistakes/users/{id}/courses/{course}?requestType=INBOX  {mistakes:[]}
// GET /v2/mistakes/users/{id}/courses/{course}/count              {numberMistakes:int}
// GET /2023-05-23/users/{id}/xp_summaries?startDate=YYYY-MM-DD     {summaries:[]}
// GET /2023-05-23/shop-items                                       {shopItems[{id, name, price, currencyType, …}]}
// POST /api/1/sync/batch   analytics batch: {event_type, event_timestamp, attributes{…}}
```

Sequence of tracking events across the guest flow **[OBSERVED via REA]**:
`app_open → course_picker_load → course_selected → $create_alias → welcome → daily_quest_assigned ×3 → math_user_type_show/tap → learning_reason_load/tap → acquisition_survey_reason_load/tap → daily_goal_load/tap → welcome_fork_load → math_onboarding_level_tap → session_start → canonical_math_challenge_response (per answer)`

---

## 3. Design takeaways for the SAT build

1. **Copy:** the one-question-per-screen onboarding, the 15-ish-item server-built session, Check → feedback sheet → Continue, the per-answer telemetry record, the mistakes store with spaced review, streak milestones, and the daily goal stored as points.
2. **Do differently:**
   - Server-side grading for anything that produces a score (#14).
   - A real diagnostic instead of self-reported grade placement (#7).
   - Explanations on every item, which Duolingo's math blobs had none of (`hint: null` on all 15).
   - Mistake budget off for diagnostic and mock test (#19).
3. **Skip for v1:** gems and shop (#25–26), acquisition survey (#5), experiments infra (#36).

---

## 4. Not observed (blockers)

- **Lesson completion screen, path/skill-tree UI with lock states, streak increment, leagues UI, achievements, practice hub.** All of these need either a completed lesson (blocked by interactive widgets in headless automation) or a signed-in account. Both options are in the Phase 1 report.
- **Server-side item selection and spaced-review scheduling.** These are not visible from the client by nature.

## Sources

REA evidence records (session-local, exported bundles in the scratchpad):
- `ev_eaddeffc…ca0ce78`: full onboarding, lesson start, two answers (network bodies).
- `ev_7d4d0eb4…ccaf1`: onboarding, then `/learn`, `/leaderboard`, `/quests`, `/practice-hub`.
- Earlier runs (`landing`, `register`, `math1–3`) cover the landing page, course picker, and onboarding accessibility trees.
