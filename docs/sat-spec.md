# SAT spec (Phase 2)

Verified 2026-10-23. The primary source is College Board's **Assessment Framework for the Digital SAT Suite, Version 4, September 2026** (cited as *Framework*), backed up by the satsuite.collegeboard.org pages listed under Sources.

**Labels**
- **[VERIFIED from source + URL]**: stated in an official College Board source. The source number is in brackets, e.g. [S1].
- **[ASSUMPTION — unverified]**: our own design choice, not an official College Board fact.

---

## 1. Check of the brief's claims

| # | Claim in brief | Verdict | Official fact |
|---|---|---|---|
| 1 | Two sections: R&W 54 Q, Math 44 Q | ✅ Correct, with a nuance | R&W **54 = 50 operational + 4 pretest (unscored)**. Math **44 = 40 operational + 4 pretest**. [S1 Table 7, §2.3.2] [S4] [S5] |
| 2 | 2 modules per section; Module 1 sets Module 2 difficulty | ✅ Correct | "Two-stage adaptive test design." Module 1 is a routing module with a broad mix of easy, medium and hard questions. Module 2 is of higher or lower average difficulty depending on Module 1 performance. [S1 §2.3.1] [S2] |
| 3 | R&W ~27 Q / 32 min; Math ~22 Q / 35 min per module | ✅ Exact, not approximate | R&W module = 25 operational + 2 pretest = **27**, 32 min. Math module = 20 operational + 2 pretest = **22**, 35 min. Section totals are 64 and 70 min, 134 min overall, with a 10-min break between sections. [S1 Table 7] [S2] |
| 4 | Calculator allowed on all Math; Desmos built into Bluebook | ✅ Correct | "A built-in Desmos® calculator is available for the entire Math section. Students can toggle between scientific and graphing options." [S1 §universal tools]. "Use of a calculator is permitted for all questions." [S7]. Students may bring an approved handheld calculator instead. |
| 5 | Math: multiple choice + student-produced response | ✅ Correct, with the split added | ≈**75% four-option MC / ≈25% SPR**. On the SAT, MC is 28–32 questions and SPR 8–12. [S1 Table 7, Table 20]. **All R&W questions are four-option MC.** [S1 Table 7] [S7] |
| 6 | 4 content domains per section | ✅ Correct | See §3. [S1 Tables 10 & 16] [S6] |
| 7 | Score scale and section ranges | ✅ Filled in | **Total 400–1600; each section 200–800; both in 10-point steps.** [S1 Table 2] [S8] |
| — | *(not in brief)* How scoring works | ⚠️ Correction to keep in mind | Scores use **Item Response Theory**, not raw percent correct. Question difficulty and guessing likelihood matter, and two students with the same number correct can get different scores. **Pretest questions don't count. There is no penalty for wrong answers.** Students "aren't advantaged or disadvantaged" by which Module 2 they get. [S8] |

## 2. Test structure **[VERIFIED]**

| | Reading and Writing | Math |
|---|---|---|
| Modules | 2, separately timed | 2, separately timed |
| Questions per module | 27 (25 operational + 2 pretest) | 22 (20 operational + 2 pretest) |
| Time per module | 32 min | 35 min |
| Average time per question | 1.19 min | 1.59 min |
| Question types | Discrete, four-option MC, single best answer | Four-option MC (≈75%) + SPR (≈25%) |
| Stimulus | 25–150 words per passage or passage pair; one question per passage; may include a table or bar/line graph | ≈30% of questions in context; most in-context questions are ≤50 words |
| Subjects | Literature, history/social studies, humanities, science | Science, social studies, real-world topics |
| Text complexity | Grades 6–8, 9–11, 12–14 | N/A |

[S1 Table 7] [S3] [S7]

**Navigation and tools (these are requirements for our mock test) [VERIFIED S1 §universal tools, §2.3.1]**
- Students can move freely *within* a module. They **cannot go back** to Module 1 once in Module 2, or to R&W once in Math.
- When Module 1 time runs out, the test moves automatically to Module 2.
- **Mark for review:** flag a question and return to it within the module.
- **Timer:** a countdown per module. It can be hidden **until 5 minutes remain**, after which it can't be hidden. This matches the theme brief's "under 5 min = crimson banner".
- Math reference sheet, built-in calculator, highlights and notes.

**R&W question order within a module [VERIFIED S1 Table 9]**
- Domains run in this order: Craft and Structure → Information and Ideas → Standard English Conventions → Expression of Ideas.
- Within each domain, questions are grouped by skill and then ordered easiest to hardest.
- Standard English Conventions is the exception: easiest to hardest regardless of skill.

**SPR entry rules [VERIFIED S7]**
- Up to 5 characters for a positive answer, 6 for a negative one (including the minus sign).
- Fractions that don't fit: enter the decimal equivalent.
- Decimals that don't fit: truncate or round at the 4th digit.
- Mixed numbers: enter as an improper fraction (7/2) or decimal (3.5). Never "3 1/2".
- No `%`, `,` or `$`.
- If more than one answer is correct, enter only one.
- Acceptable forms of 2/3: `2/3`, `.6666`, `.6667`, `0.666`, `0.667`. Not acceptable: `0.66`, `.66`, `0.67`, `.67`.

Our grid-in grader must follow these rules exactly.

## 3. Content domains and skills **[VERIFIED: names are the official wording]**

### Reading and Writing (50 operational) [S1 Table 10] [S4] [S6]

| Domain | Share / # operational Q | Skills (official testing points) |
|---|---|---|
| Information and Ideas | ≈26% / 12–14 | Central Ideas and Details; Command of Evidence (Textual, Quantitative); Inferences |
| Craft and Structure | ≈28% / 13–15 | Words in Context; Text Structure and Purpose; Cross-Text Connections |
| Expression of Ideas | ≈20% / 8–12 | Rhetorical Synthesis; Transitions |
| Standard English Conventions | ≈26% / 11–15 | Boundaries; Form, Structure, and Sense |

### Math (40 operational) [S1 Tables 16, 20] [S5] [S6]

| Domain | Share / # operational Q | MC / SPR | Skills (official testing points) |
|---|---|---|---|
| Algebra | ≈35% / 13–15 | 10–11 / 3–4 | Linear equations in one variable; Linear equations in two variables; Linear functions; Systems of two linear equations in two variables; Linear inequalities in one or two variables |
| Advanced Math | ≈35% / 13–15 | 10–11 / 3–4 | Equivalent expressions; Nonlinear equations in one variable and systems of equations in two variables; Nonlinear functions |
| Problem-Solving and Data Analysis | ≈15% / 5–7 | 4–5 / 1–2 | Ratios, rates, proportional relationships, and units; Percentages; One-variable data: distributions and measures of center and spread; Two-variable data: models and scatterplots; Probability and conditional probability; Inference from sample statistics and margin of error; Evaluating statistical claims: observational studies and experiments |
| Geometry and Trigonometry | ≈15% / 5–7 | 4–5 / 1–2 | Area and volume; Lines, angles, and triangles; Right triangles and trigonometry; Circles |

**Totals:** 10 R&W skills (11 if Command of Evidence is split into Textual and Quantitative) and 19 Math skills.

## 4. What is ours, not College Board's **[ASSUMPTION — unverified]**

- **Sub-skills.** College Board publishes skills, and sub-elements only for Command of Evidence (Textual / Quantitative). Every other sub-skill in `data/skill-taxonomy.json` is our own breakdown of the official skill description, for lesson design. Each one is marked `"source": "assumption"`.
- **Difficulty tiers.** College Board uses the words "easy, medium-difficulty, and hard" [S1 §2.2.3] but publishes no per-skill rubric. The tier descriptors in the taxonomy are ours.
- **Score estimate.** Real scoring uses IRT parameters that College Board doesn't publish. Our mock-test score must be labelled an **estimate**.
- **Module-2 routing threshold.** Not published. Ours will be a documented heuristic.

## 5. Out of scope
- The **SAT Essay**, offered only in select school-day administrations. It does not affect section or total scores. [S1 Table 7 footnote]
- PSAT 8/9, PSAT/NMSQT and PSAT 10 variants. Their domain weights and score scales differ. [S1 Tables 2, 17, 18]

## Sources
- [S1] College Board, *Assessment Framework for the Digital SAT Suite*, v4, Sept 2026: https://satsuite.collegeboard.org/media/pdf/assessment-framework-for-digital-sat-suite.pdf. Tables 2, 7, 9, 10, 16, 20; §2.3.1–2.3.3; universal tools list.
- [S2] Test structure: https://satsuite.collegeboard.org/sat/whats-on-the-test/structure
- [S3] R&W section: https://satsuite.collegeboard.org/sat/whats-on-the-test/reading-writing
- [S4] R&W specifications: https://satsuite.collegeboard.org/k12-educators/about/alignment/reading
- [S5] Math specifications: https://satsuite.collegeboard.org/k12-educators/about/alignment/math and https://satsuite.collegeboard.org/sat/whats-on-the-test/math/overview
- [S6] Content domains: https://satsuite.collegeboard.org/higher-ed-professionals/sat-validity/content-domains
- [S7] Bluebook test directions (Math module directions, SPR rules): https://satsuite.collegeboard.org/media/pdf/english-sat-test-directions-bb.pdf
- [S8] How scores are calculated: https://satsuite.collegeboard.org/scores/what-scores-mean/how-scores-calculated
- [S9] Calculator on entire Math section: https://blog.collegeboard.org/everything-you-need-know-about-digital-sat
