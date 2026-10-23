# Crimsprint

Duolingo-style SAT practice: onboarding, adaptive diagnostic, skill path, 8-item lessons with explanations, mistake budget, streaks, spaced review, daily quests, weekly leagues, achievements, a full two-module adaptive mock test with a score estimate, a progress dashboard, and an admin content tool. It uses no third-party branding, and its 592 items are original (20+ per skill across all 29 official skills).

Design docs: [docs/duolingo-mechanics-map.md](docs/duolingo-mechanics-map.md) → [docs/sat-spec.md](docs/sat-spec.md) → [docs/mechanics-to-sat.md](docs/mechanics-to-sat.md).

## Setup

1. Create a Supabase project. In **Authentication → Sign In / Providers**, turn on **Allow anonymous sign-ins**.
2. In the Supabase **SQL editor**, run the files in [`supabase/migrations/`](supabase/migrations/) in order, then [`supabase/seed.sql`](supabase/seed.sql). Alternatively, insert only the skills and load the questions with `node scripts/load-items.ts`, which signs in once and waits for you to make the printed user an admin. That's how the hosted project was seeded.
3. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key. Optionally add a Desmos API key for the graphing calculator; without one, a built-in scientific calculator is used.
4. Run the app:

```bash
npm install
```

```bash
npm run dev
```

5. To use `/admin`, open it once, then run the `update … set is_admin = true` statement it shows you in the SQL editor.

## Layout

| Path | What |
|---|---|
| `supabase/migrations/0001_init.sql` | Schema, RLS, and every rule: grading (incl. SAT grid-in rules), mastery (Elo/1PL), Leitner review, streak, sessions |
| `supabase/migrations/0002_*.sql` | Quests, leagues, achievements (via triggers), mock test (server-timed, adaptive, score estimate), progress, reports, admin |
| `scripts/math-templates*.ts` | Original math item templates; each answer computed and checked by substitution |
| `data/items/rw.json`, `data/items/rw/*.json` | Original Reading and Writing items (compact format: key first, rationales in order) |
| `scripts/build-seed.ts` | Validates all items and writes `data/items/math.json` and `supabase/seed.sql` (`npm run seed`) |
| `supabase/migrations/0006_*.sql`, `0007_*.sql` | Learning path (units, chests, unit tests, diagnostic placement); profile, shop, weekly quests, timed drills, review-every-mistake |
| `src/app/globals.css` | The only place colors are defined (theme tokens, light/dark) |
| `design/raccoon-source.png` → `scripts/mascot.ts` | Mascot cut-out, head badge, favicon and the six avatar colors (recolored from the token file) |
| `scripts/trace.ts` | Traces the mascot into `public/mascot/raccoon.svg` (four flat colors) |
| `scripts/screenshots.ts` | Review screenshots of the running app at desktop, tablet and phone sizes, light and dark (`@lesson` walks a lesson) |
| `tests/` | `npm test`: runs the real migration in PGlite (in-process Postgres) and checks theme contrast |

Answer keys never reach the browser. The `items` table has no RLS policy, so items are served only through security-definer RPCs that strip answers.

## Mascot poses (TODO)

`src/components/Mascot.tsx` has four poses (idle, celebrating, encouraging, sleeping). All of them are the one source illustration plus original overlays (closed eyes, "z"s, confetti) and CSS motion, which stops under reduced motion. Drawing true poses in the same style (arms up for celebrating, a thumbs-up for encouraging, curled up asleep) needs an illustrator.

