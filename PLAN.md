# Pathfinder — Build plan

Seven builds, in order. Each has a goal and acceptance checks. Run one with
`/build N`; every build follows [CLAUDE.md](CLAUDE.md) and ends with
`npm test` and `npm run build` passing.

---

## Build 1

Full text to follow.

---

## Build 2 — Any job title, more metros

**Goal:** Any job title a user types maps to a federal SOC code via O*NET, so
the app is no longer limited to the seed occupation table. Add verified metro
areas for the 10 largest states, checked with `scripts/verify-metros.ts`.

**Acceptance checks:**
- Typing a common title (e.g. "nurse", "data scientist", "electrician") returns
  matching occupations with SOC codes; choosing one loads the job page.
- Titles not in the old seed table now work end to end.
- No match shows a plain "We couldn't find that job" message, not an error.
- O*NET credentials, if needed, live only in `.env.local` and Vercel.
- Metros added for the 10 largest states by population; every metro code
  passes `scripts/verify-metros.ts` against BLS before it is added.
- Existing California metros (including SLO, 42020) are unchanged.
- `npm test` and `npm run build` pass.

---

## Build 3 — Program data from College Scorecard

**Goal:** A program search backed by College Scorecard fills in tuition,
typical debt, and first-year graduate earnings, each labelled with its source
and a confidence level, and ends in one three-number results sentence.

**Acceptance checks:**
- Searching by school and program returns matching Scorecard programs.
- Choosing one fills tuition, typical debt, and first-year earnings in the
  calculator; each shows source, year, and a confidence label (e.g. based on
  sample size or data suppression).
- Fields Scorecard does not report are left blank with a plain note
  ("Not reported for this program"), never filled with a guess.
- The results sentence states three numbers: what this program's grads start
  at, what BLS says the job typically pays, and the breakeven starting salary.
- The user can still type any value by hand to override.
- `npm test` and `npm run build` pass.

---

## Build 4 — Scenarios, part-time, and reimbursement

**Goal:** Show a range, not a single guess: three scenarios (pessimistic,
base, optimistic) as a toggle with a band on the chart, plus a part-time study
option and a tuition reimbursement input.

**Acceptance checks:**
- A toggle switches results between pessimistic, base, and optimistic; the
  assumptions behind each are stated in plain language.
- The cumulative-cash chart shows a shaded band from pessimistic to optimistic
  around the selected line.
- A part-time option lengthens the program and keeps some working income
  during study; results update accordingly.
- A tuition reimbursement input (employer amount per year) reduces
  out-of-pocket cost.
- Any change to `src/lib/model.ts` is matched by updates to
  `grad_roi_test_cases.xlsx` and `src/lib/model.test.ts`, with new
  hand-verified cases for part-time and reimbursement.
- `npm test` and `npm run build` pass.

---

## Build 5 — Caching, resilience, and page tests

**Goal:** Cache BLS and Scorecard responses in a Supabase database, handle
outages gracefully, label data as "latest available", and add basic page tests.

**Acceptance checks:**
- BLS and Scorecard responses are stored in Supabase and reused until stale;
  repeat lookups do not call the upstream API.
- When a source is down or returns nothing, the page shows a friendly "This
  data isn't available right now" state and the rest of the page still works.
- Figures are labelled "latest available" with their year.
- Basic tests cover that the main pages render and handle a data-unavailable
  response.
- Supabase keys live only in `.env.local` and Vercel; new dependencies are
  named before they are added.
- `npm test` and `npm run build` pass.

---

## Build 6 — Accounts, saved paths, and alerts

**Goal:** Users sign in with Supabase auth, save paths (job, place, and
program choices), and get a weekly email when data for a saved job changes.

**Acceptance checks:**
- Users can sign up, sign in, and sign out.
- A signed-in user can save a path and see their saved paths; other users
  cannot see them (row-level security on).
- A weekly job compares the latest data for each saved job with what was last
  sent and emails the user only when something changed, in plain language
  with source and year.
- Users can turn alerts off.
- Email and auth secrets live only in `.env.local` and Vercel.
- `npm test` and `npm run build` pass.

---

## Build 7 — News summary (cut if junk)

**Goal:** A short news summary for the chosen job under fixed headings, using
NewsAPI with tight queries. If testing shows the results are mostly junk, cut
the feature.

**Acceptance checks:**
- The summary appears under fixed headings (e.g. hiring, pay, industry
  changes), each item linked to its source with a date.
- A spot check across several jobs shows mostly relevant articles; if not, the
  feature is removed and NOTES.md records why.
- A heading with nothing relevant says so instead of showing filler.
- `NEWSAPI_KEY` lives only in `.env.local` and Vercel.
- `npm test` and `npm run build` pass.
