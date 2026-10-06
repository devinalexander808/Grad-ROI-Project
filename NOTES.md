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
  BLS OEWS for employment and median/mean wage (national, state, and a metro
  labelled San Luis Obispo — actually Santa Barbara; see `0042200` fix below)
  with a 24-hour in-process cache. `/job` page with a searchable
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

## 2026-09-28 — `5852892` Add metro area picker; carry metro median into calculator

- **Built:** Optional "Metro area" dropdown on `/job`, filtered to the chosen
  state and reset when the state changes. The card became a table (Jobs /
  Median / Mean × National / State / Metro), with "n/a" for figures BLS doesn't
  publish. The selection carries an optional metro median, and the calculator
  banner, BLS chip and Next moves use it when present, else the state median.
- **Prompt intent:** Let the user narrow pay to their metro and have the
  calculator use the most local median.
- **Bugs:** None found at the time. The metro table had one entry, and its code
  was wrong (next entry).

## 2026-09-28 — Add verified California metros; fix SLO metro code (42020, was 42200)

- **Built:** `scripts/verify-metros.ts` (run with `npx tsx`, not part of the
  app) asks BLS for the 2025 financial analyst median for each candidate
  California metro via `fetchSeries`. All 16 returned data, and `METROS` now
  lists them, sorted by name. The default metro changed to `0042020`.
- **Prompt intent:** Add California metros, but only codes proven against the
  live API.
- **Bug — `0042200` mislabelled as San Luis Obispo:** From the first BLS commit
  (`aa1a212`, Sept 27) the app, SPEC §10 and the code comments called
  `0042200` San Luis Obispo. It is Santa Maria–Santa Barbara ($97,720); SLO is
  `0042020` ($102,970). It went unnoticed because BLS's wage data API returns
  numbers but no area names. Every code returned a plausible median, so the
  label could not be wrong in any visible way. The verify script checked both
  codes. Both had data, so the numbers couldn't settle it, and the BLS CBSA
  code list confirmed which was which. **Fix:** relabel `0042200`, add
  `0042020`, change the default, and correct SPEC §10, `bls.ts` and the route
  comment.
- **Lesson:** "The API returned data" is not verification of what the data
  describes. Check labels against the source's own code list.

## 2026-10-03 — Add CLAUDE.md, PLAN.md, and /build and /ship commands

- **Built:** `CLAUDE.md` now holds the standing rules (below the existing
  `@AGENTS.md` import): model frozen unless the workbook and tests change, no
  silent new dependencies, `npm test` + `npm run build` green on every task,
  diff summary before any commit, no commits unless asked, one NOTES.md entry
  per commit, secrets only in `.env.local` and Vercel, plain-language UI with
  source and year on every figure. `PLAN.md` lays out Builds 1–7 with goals and
  acceptance checks (Build 1 is a placeholder). `.claude/commands/build.md`
  (`/build N`) implements a PLAN section and stops with a diff summary;
  `.claude/commands/ship.md` (`/ship <message>`) writes the NOTES entry, runs
  tests and build, then commits and pushes.
- **Prompt intent:** Turn the way I already work with Claude Code into
  repeatable commands, so each remaining build is one bounded `/build` and one
  `/ship`.
- **Bugs:** None.

## 2026-10-03 — Add Build 1 spec to PLAN.md

- **Built:** Replaced the Build 1 placeholder in `PLAN.md` with the full spec:
  a three-step start screen on `/` (where you are now, the job you want, the
  program you're considering), the calculator moved to `/calculator` with the
  start-screen inputs on top and everything else under "Adjust assumptions",
  a shared `occupation-picker.tsx`, new optional `profile` and `program`
  objects in `selection.ts`, and a "Model limits" note.
- **Prompt intent:** Pin down Build 1 so `/build 1` has exact steps and
  acceptance checks; no app code changes yet.
- **Bugs:** None.

## 2026-10-03 — Add guided start screen; move calculator to /calculator

- **Built:** PLAN Build 1. `/` is now a three-step Start screen: where you are
  now (salary, experience, highest degree), the job you want (occupation,
  state, metro, with the BLS median shown inline with source and year), and
  the program you're considering (name, tuition, length). It saves as you type
  to new optional `profile` and `program` stores in `selection.ts`, and "See if
  it pays off" opens `/calculator?from=start`. The calculator moved to
  `/calculator` (heading now "ROI calculator"): the five Start screen inputs
  sit on top under "From your start screen", the other 14 fold under "Adjust
  assumptions" (closed by default, one-sentence hints), and a "Model limits"
  card lists flat tax, no job-landing risk, and no non-money value. The job
  search and state/metro pickers plus the BLS lookup moved into a shared
  `occupation-picker.tsx` used by the Job page and the Start screen. Nav is now
  Start / Job / Calculator; the tab title is "Pathfinder". `model.ts`
  untouched, no new dependencies.
- **Prompt intent:** Nobody should face 19 inputs first. Ask three short
  questions, then show the answer with every assumption still one click away.
- **Bug — amount borrowed ignored the Start screen tuition:** The first draft
  pre-filled tuition but left amount borrowed at the $40,000 default, so a
  $55,000 program modelled $15,000 of tuition as paid in cash. Caught in diff
  review before shipping. **Fix:** when the Start screen supplies tuition,
  amount borrowed starts at SPEC Appendix A's default, max(T − Sch, 0), from
  the tuition and scholarships on screen, until the user edits it.
- **Verified:** In the browser, Start ($62,000, MS Finance, $55,000, 1.5
  years, San Luis Obispo) → calculator showed all five values and the SLO
  median ($102,970); the Job page's button still pre-fills only the starting
  salary.

## 2026-10-03 — Add College Scorecard program search with confidence labels

- **Built:** PLAN Build 3 (Build 2 not yet done; nothing here depends on it).
  `src/lib/scorecard.ts` is a server-side College Scorecard client modelled on
  `bls.ts` (8s timeout, key redacted from logs and errors, 24-hour in-process
  cache) with `/api/schools?q=` for school search and `/api/schools/[id]` for
  one school's graduate programs. Each program gets first-year pay and typical
  debt with an A3 confidence label (High / Medium) or an honest blank, and
  tuition is always blank. A shared `program-search.tsx` picker sits in Start
  screen step 3 and on the calculator; either pick is saved to the `program`
  store. On the calculator, Scorecard first-year pay fills Starting salary
  (ahead of the BLS median) and typical debt fills Amount borrowed, never over
  a typed number; pre-filled fields show their source and confidence, and the
  headline card has the three-number sentence (program grads' start pay / BLS
  typical pay / breakeven). Nine new tests for the ladder logic.
  `model.ts` untouched, no new dependencies.
- **Prompt intent:** Replace hand-typed program numbers with the Department
  of Education's, and be plain about what it doesn't publish.
- **Found in the data, not bugs in the code:** Scorecard has no graduate
  tuition (only the school's undergraduate price) and no cohort year for
  program-level figures, so figures are labelled "latest release, retrieved
  Oct 2026". The SPEC A3 reference values had gone stale: Cal Poly CIP 5213
  master's is now $96,886 (n=26), not $73,268 (n=18). SPEC updated.
- **Bug — bachelor's pay standing in for graduate programs:** The first draft
  followed A3 ladder step 2 literally ("same CIP field, any credential
  level"), so 20 of Cal Poly's 48 graduate programs showed a bachelor's
  median labelled Medium (e.g. Agricultural Business master's at $52,778),
  understating graduate pay. Caught in diff review. **Fix:** the fallback only
  uses another graduate-level (≥ 5) program in the same field; otherwise
  "No first-year pay data for this program". A test asserts a bachelor's-only
  field comes back as no data, and SPEC A3 step 2 now says so.
- **Verified:** In the browser, Cal Poly → CIP 5213 master's showed $96,886
  (High, 26 graduates), debt $30,820 (Medium, average; median suppressed),
  tuition "Not reported", and the calculator pre-filled both with the
  three-number sentence; typing over Starting salary switched its label to
  "Your input". Not re-checked in the browser after the graduate-only fix.

---

## 2026-10-05 — Add O*NET job search, 48 verified metros, dropdown fix, and O*NET credit

- **Built:** PLAN Build 2. `src/lib/onet.ts` is a server-side O*NET Web
  Services v2 client modelled on `bls.ts` (8s timeout, key redacted, 24-hour
  in-process cache). `/api/occupations/search?q=` maps a typed title to
  O*NET-SOC codes; "29-1141.03" becomes BLS SOC "291141", and O*NET-only
  codes (not ".00") are labelled "BLS publishes wages for the broader group
  <title>". The picker shows the seed jobs instantly with "More jobs from
  O*NET" below; no match says "We couldn't find that job". Jobs outside the
  seed table take their title and description from O*NET on the Job page.
  The seed table grew from 20 to 59 jobs, each checked against BLS with the
  new `scripts/verify-occupations.ts`. The dropdown now has an opaque
  surface, border, shadow, z-30, its own 280px scroll, one highlighted row for
  mouse and arrow keys, and Enter to select. 48 metros added for TX, FL, NY,
  IL, PA, OH, GA, NC, MI and NJ (NY, Philadelphia and Allentown also list
  under NJ), all verified with `scripts/verify-metros.ts`; California
  unchanged. The O*NET pick is saved in the selection (`onetCode`,
  `onetTitle`, `broaderGroup`) and restored on the Start screen and the Job
  page, which now opens on the saved job. O*NET credit added to the site
  footer. 9 new tests in `onet.test.ts`. No new dependencies.
- **Prompt intent:** Any job title should work, not just a seed list, and
  local pay should exist for the biggest states, with every code checked
  against BLS before it ships.
- **Bug — dropdown opened far below the input:** In the two-column grid the
  picker cell stretched to the taller state/metro column, and the list was
  anchored to the bottom of that cell, about 70px below the input, so you had
  to scroll to find it. Caught in the browser. **Fix:** the cell is
  `self-start` and the list hangs off the input itself.
- **Bug — Cleveland metro returned no data:** 17460 (Cleveland–Elyria) has no
  2025 OEWS series. **Fix:** OMB's 2023 delineation re-coded it as 17410,
  which verified.
- **Bug — O*NET pick lost on reload:** Only the SOC was saved, so "Critical
  Care Nurses" came back as Registered Nurses without its broader-group note;
  and switching between two O*NET jobs with the same SOC made no new BLS
  request, so the new pick was never saved. **Fix:** the O*NET fields are
  stored in the selection, and saving runs in its own effect keyed on the
  pick as well as the BLS answer.
- **Not added:** Purchasing agent (131023) has no BLS series; OEWS publishes
  it only inside 131020, which was not checked.
- **Verified:** In Chrome, "nurse", "electrician" and "systems architect"
  return O*NET matches; Electricians in Dallas loads BLS figures; Critical
  Care Nurses survives a reload on both pages; the dropdown is readable with
  the light and dark theme colours.

## 2026-10-05 — Fix native dropdown colors in dark mode

- **Built:** Two unlayered rules in `globals.css`: `select` gets
  `background-color: var(--surface)` and `color: var(--ink)`, so the select
  itself is opaque and beats Tailwind's `bg-transparent`; `select option`
  gets the same colours as a backstop for the open list. `color-scheme` was
  already `light` on `:root` and `dark` in the dark block, and there is no
  `data-theme` selector, so nothing changed there. All five selects (state,
  metro area, highest degree, the calculator's select field, graduate
  program) already use the shared field classes inside an opaque field shell.
- **Prompt intent:** Native dropdowns must be readable in both themes, not a
  blank white list.
- **Bug — native select lists looked blank in dark mode:** The selects were
  `bg-transparent`, and Chrome on Windows paints the open list from the
  select's own background, so it fell back to white behind white dark-mode
  text. **Fix:** the two rules above. In Chrome, dark-mode options now compute
  to `rgb(26, 26, 25)` with white text. The popup itself is drawn by the OS
  and was not captured in a screenshot.

## 2026-10-05 — Add scenarios band, part-time study, tuition reimbursement; fix payback rule

- **Built:** PLAN Build 4. New `src/lib/scenarios.ts` holds pure transforms on
  the model's own inputs: part-time study sets `L` and `PT`, and employer
  reimbursement of R a year adds R · L to `Sch`. Reimbursement is capped at
  tuition after scholarships, and borrowing at what is left to pay. The three
  SPEC A2 scenarios are a pessimistic / base / optimistic toggle on the
  calculator, each explained in one plain sentence with its figures, and the
  cumulative-cash chart shades a band from pessimistic to optimistic behind
  the selected line. A new "How you'll study and pay" card holds the
  part-time switch, part-time length (starts at 2× full-time), pay kept
  (starts at your salary) and tuition reimbursement. Study mode, those
  fields and the scenario are saved in a new `pathfinder.study` store and
  survive a reload. The payback rule changed in `model.ts`, SPEC A2 and the
  workbook: the first year cumulative cash reaches zero *and stays there*.
  All five workbook cases are unchanged (4 / none / none / 6 / none). The
  workbook gains a `Build4_StudyScenarios` sheet with the 12 scenario cases
  and the payback case, recalculated in Excel. 13 new tests (12 in
  `scenarios.test.ts`, 1 in `model.test.ts`). No new dependencies.
- **Prompt intent:** Show a range, not a single guess, and cover the common
  real case of studying part-time on an employer's dime, without bending the
  frozen model.
- **Bug — "Pays off in year 1" for part-time study:** With full pay kept and
  the tuition borrowed, year 1's difference was exactly 0. The old rule
  ("first k with CumDiff ≥ 0") called that payback, though cumulative cash
  went negative from year 2. Caught in the browser. **Fix:** payback is now
  the start of the final run of years with CumDiff ≥ 0. That case now pays
  back in year 7, with a test.
- **Bug — scenarios could cross:** Read literally, A2 makes pessimistic
  *better* than base for a pay cut (halving a cut) or a job search over 9
  months. **Fix:** each scenario takes the worse (or better) of its rule and
  the entered value.
- **Bug — negative school cost on screen:** "What this assumes" read
  "Out-of-pocket school cost of −$45,000" when pay while studying covers
  the cost. **Fix:** it now says you net that amount per school-year.

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
