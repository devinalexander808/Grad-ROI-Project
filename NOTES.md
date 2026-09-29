# Development log — Pathfinder

Course: AI-Assisted Application Development. Spec: [SPEC.md](SPEC.md).
One entry per commit, oldest first. Built with Claude Code; deployed on Vercel.

---

## 2026-09-14 — `2027bd3` Initial Next.js app

- **Built:** Next.js (App Router) + TypeScript + Tailwind scaffold, ESLint config,
  `AGENTS.md`/`CLAUDE.md` (the Next.js version here has breaking changes, so
  agents read `node_modules/next/dist/docs/` before writing code).
- **Prompt intent:** Stand up an empty app that builds and deploys.
- **Bugs:** None.

## 2026-09-15 — `ed02035` Add ROI model with 5 hand-verified tests

- **Built:** `src/lib/model.ts`, a pure function for the Grad ROI model (now
  SPEC Appendix A): yearly after-tax cash for both paths, cumulative difference,
  NPV, payback year, and closed-form breakeven starting salary. No rounding.
  `src/lib/model.test.ts` covers the five hand-worked cases in
  `grad_roi_test_cases.xlsx` to within $1. Added Vitest.
- **Prompt intent:** Implement the model exactly as specified and prove it
  against numbers worked by hand before building any UI.
- **Bugs:** Vitest 5 peer dependency needed `@types/node` ^24; bumped it.

## 2026-09-27 — `aa1a212` Add BLS job snapshot page, occupation table, and nav

- **Built:** SPEC §4.1 "The job right now". `/api/occupation/[soc]` calls
  BLS OEWS for employment and median/mean wage (national, state, San Luis Obispo
  metro) with a 24-hour in-process cache. `/job` page with a searchable
  20-occupation seed table (`src/lib/occupations.ts`), state picker, and a
  six-figure card where every number carries its source and year. Also: the
  calculator UI on `/`, the cumulative-cash chart, shared formatters, top nav.
  SPEC rewritten from Grad ROI v0.3 to Pathfinder v1.0.
- **Prompt intent:** Ship the week-6 MVP: pick a job, see the market, see the
  money.
- **Bugs:** None in this commit; the next one fixed the problems deployment
  exposed.

## 2026-09-28 — `6767f87` Return JSON on every BLS failure path; redact key; add timeout

- **Built:** The API route catches everything and always answers with a JSON
  body. `bls.ts` reads responses as text before parsing, adds an 8-second
  `AbortController` timeout, and redacts the API key from logs and error
  messages. The Job page reads text first and shows a readable error when the
  body isn't JSON.
- **Prompt intent:** Make every BLS failure show up on screen as a clear
  message instead of a crash.
- **Bug 1 — Vercel empty 500, "Unexpected end of JSON input":** On Vercel the
  Job page showed a JSON parse error instead of data. The route let exceptions
  escape (and a slow BLS call could outlive the function), so the platform
  answered with an empty or HTML 500 and the client's `response.json()` threw.
  **Fix:** wrap the whole handler in `try/catch` returning JSON; read BLS and
  API responses as text and parse them explicitly; cap the BLS call at 8s so it
  fails before Vercel's 10s function limit.
- **Bug 2 — BLS rejected `BLS_API_KEY` as invalid:** The key saved in the
  environment variable had a trailing period, so BLS refused it. Its error
  message echoed the key back, which would have leaked it to the browser and
  logs. **Fix:** corrected the environment variable value; in code, redact the
  key from any BLS text before it is logged or returned.

## 2026-09-28 — `5151066` Connect job page to ROI calculator; add next moves card; fix chart label

- **Built:** `src/lib/selection.ts` stores the chosen job, state and BLS state
  median in localStorage, with a `useSelection` hook. The Job page saves the
  selection and adds "Use this in the ROI calculator" (hidden, with a note,
  when there is no state median). The calculator shows a "Planning for…"
  banner, a "Use BLS median" chip on starting salary, and says when the salary
  came from BLS. New "Next moves" card (SPEC §4.4, first slice): breakeven
  salary against the BLS median, and one next step.
- **Prompt intent:** Make the Job page feed the calculator, and turn the result
  into a concrete next step.
- **Bug 1 — chart label clipped:** "Pays off in year N" was centred over the
  payback dot and ran off the right edge when payback was late. **Fix:** anchor
  the label on whichever side of the dot has room.
- **Bug 2 — lint error, `set-state-in-effect`:** The first version copied the
  BLS median into the salary field inside a `useEffect`, which the React hooks
  lint rule rejects. **Fix:** compute the salary during render instead. It uses
  the median until the user edits the field, so a typed salary is never
  overwritten.

---

## How I work with Claude Code

1. **One bounded task at a time.** Each prompt names the files, the exact
   behaviour, and what must not change (e.g. "keep `model.ts` untouched",
   "nothing else on this page changes"). The spec sections are cited so the
   agent reads them first.
2. **Review the diff.** Claude stops before committing and shows the diff
   summary. I read it, ask for follow-ups if needed (e.g. wording, hidden vs.
   disabled), and only then approve.
3. **Tests and build must pass.** `npm test` (the model's hand-verified cases)
   and `npm run build` run on every change; lint runs too. A red result is
   fixed before anything else.
4. **Commit.** One commit per task, with a message I write.
5. **Vercel auto-deploys** from `main` on push. Bugs that only show up in
   production (like the empty 500) get their own bounded fix-up task.
