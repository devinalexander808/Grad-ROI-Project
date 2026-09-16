# Grad Program ROI — Product Spec v0.3

Owner: Devin Alexander · Course: AI-Assisted Application Development · Date: Sept 9, 2026 (v0.3: model formulas finalized to match the test workbook)

## 1. One-sentence pitch

An honest financial model that tells a person whether a specific graduate program pays off for them, using real earnings data and their own numbers, with the uncertainty shown instead of hidden.

## 2. User

A college senior or young professional deciding between (a) enrolling in a specific graduate program and (b) continuing to work. They know their salary and savings; they do not know finance. Secondary users (later): university career centers, employers with tuition reimbursement.

## 3. Core promise (what the app does that a chatbot or spreadsheet does not)

1. Pulls real per-program earnings and debt data from the federal College Scorecard rather than guessing.
2. Combines it with the user's own salary, savings, and loan terms in a consistent model.
3. Shows results as scenarios and breakeven conditions, never a single "worth it" verdict.
4. Labels every number with where it came from and how confident we are.
5. Remembers the user's programs and offers so the comparison updates as the decision unfolds.

## 4. Inputs

**About you (Path A baseline)**
- `S0` current (or offered) annual salary, pre-tax
- `g_work` expected annual raise rate if you keep working (default 3%)
- `t` effective tax rate applied to all income (default 25%; user-adjustable; one flat rate keeps the model explainable)
- `d` discount rate for present value (default 5%)
- `H` horizon in years from today (default 10; user can set 5–20)

**About the program (Path B)**
- School + program (search → Scorecard match), credential level
- `L` program length in years (fractional allowed, e.g. 0.83 for a 10-month program)
- `T` tuition and fees for the whole program (user enters or pulls Scorecard cost where available)
- `Sch` scholarships and grants (total)
- `PT` part-time earnings per year while enrolled, pre-tax (default 0)
- `Living` extra living cost per year attributable to the program (default 0; e.g. relocation)
- `gap` months of job search after finishing before salary starts (base default 3)
- `S1` starting salary after the program, pre-tax — default from Scorecard (see §6), user can override
- `g_grad` annual raise rate after the program (default = `g_work` + 1 pt; user-adjustable)

**Loans**
- `B` amount borrowed (default = T − Sch, capped at 0 minimum)
- `r` interest rate (default 8%), `N` term in years (default 10)
- Payments start when the program ends (grace period ignored in v1; note it in provenance)

## 5. Model (annual steps, year k = 1 … H, after-tax cash)

**Path A — keep working**

    CF_A(k) = S0 · (1 + g_work)^(k−1) · (1 − t)

**Path B — attend the program** (one formula for every year, using fractions so partial years prorate)

    C_sch  = (T − Sch − B) / L + Living − PT · (1 − t)      cash cost per school-year (borrowed money excluded; it comes back as P)
    sf(k)  = clamp(L − (k − 1), 0, 1)                        fraction of year k spent in school
    ts     = L + gap / 12                                    time (years) when the new salary starts
    wf(k)  = clamp(k − ts, 0, 1)                             fraction of year k spent earning S1
    kf     = floor(ts) + 1                                   first working year
    exp(k) = max(0, k − kf)                                  raises applied (0 in the first working year)
    lf(k)  = clamp(min(k, L + N) − max(k − 1, L), 0, 1)      fraction of year k inside the loan term
    P      = B · r / (1 − (1 + r)^(−N))                      annual loan payment (0 if B = 0)

    CF_B(k) = −C_sch · sf(k) + S1 · (1 + g_grad)^exp(k) · (1 − t) · wf(k) − P · lf(k)

**Comparison**

    Diff(k)      = CF_B(k) − CF_A(k)
    CumDiff(k)   = Σ_{j=1..k} Diff(j)
    NPV          = Σ_{k=1..H} Diff(k) / (1 + d)^k

**Outputs shown to the user**
- Payback year: the first `k` where `CumDiff(k) ≥ 0`, or "not within H years"
- NPV over the horizon (positive means the program is worth more than working, in today's dollars)
- Breakeven starting salary `S1*`: the value of `S1` that makes `NPV = 0`. NPV is linear in S1, so it has a closed form: with `m(k) = (1 + g_grad)^exp(k) · (1 − t) · wf(k) / (1 + d)^k` for k ≤ H, `S1* = (S1 · Σm − NPV) / Σm` (undefined if Σm = 0, i.e. no working years inside the horizon). Headline sentence: "This program pays off within H years if you earn at least $S1* to start. Graduates of this program typically start at $S1 (Scorecard median)."
- Ten-year cumulative cash chart, both paths, with the crossover marked

**Scenarios (v1: three fixed cases; v2: Monte Carlo)**
- Base: `S1` = Scorecard median, `gap` = 3 months, `g_grad` as entered
- Pessimistic: salary uplift (S1 − S0) halved, `gap` = 9 months, `g_grad` = `g_work`
- Optimistic: uplift × 1.25, `gap` = 0, `g_grad` as entered
- v2: sample `S1` from a lognormal fit to Scorecard 25th/50th/75th percentiles where available; run 5,000 trials; report the probability the program pays off within H and the 10th–90th percentile band on NPV.

**Rules**
- Every input has a sane default and a plain-language tooltip.
- Round only for display; keep full precision in the model.
- The model is a pure function (inputs → outputs) with unit tests against hand-verified cases. Ship no UI feature that changes the model without a test.

## 6. Data: College Scorecard

- Source: U.S. Dept. of Education College Scorecard API (free key via api.data.gov; key lives in an env var, never in the repo).
- Endpoint: `GET https://api.data.gov/ed/collegescorecard/v1/schools?api_key=…&school.name=<name>&fields=id,school.name,latest.programs.cip_4_digit&all_programs_nested=true`
- Response shape (verified Sept 9, 2026 against Cal Poly SLO, which returns 125 programs, 48 at graduate level): `results[0]["latest.programs.cip_4_digit"]` is an array; each program has `code` (4-digit CIP, e.g. "5213"), `title`, `credential.level` (5 = master's, 8 = graduate/professional certificate observed; treat ≥ 5 as graduate), `credential.title`, `counts.ipeds_awards1/2` (recent completions), `earnings`, `debt`, `repayment`.
- Earnings fields (exact paths):
  - `earnings["1_yr"].overall_median_earnings` → default `S1`
  - `earnings["1_yr"].working_not_enrolled.overall_count` → sample size behind it
  - `earnings["4_yr"].overall_median_earnings` → used to sanity-check `g_grad`
  - `earnings["4_yr"].overall_median_earnings_national`, `overall_p25_earnings_national`, `overall_p75_earnings_national` → national distribution for the same CIP + credential; feeds fallback level 3 and the v2 Monte Carlo spread
  - `earnings["5_yr"]` and `earnings.highest` also exist; ignore in v1
- Debt fields (graduate programs use Stafford + Grad PLUS, not parent PLUS):
  - `debt.staff_grad_plus.all.eval_inst.median` → default `B` when the user has no better number
  - `debt.staff_grad_plus.all.eval_inst.average`, `.count`, `.median_payment` (monthly, 10-yr) → shown on the detail screen
- Suppression: suppressed values come back as `null` (not the string "PrivacySuppressed" used in the CSV). The median can be null while the average is present (Cal Poly CIP 5213 master's: debt count 18, median null, average 30,820). Handle each field independently.
- Coverage observed at Cal Poly: 16 of 48 graduate programs have a 1-year earnings median; the rest are null. Expect similar or worse elsewhere, so the fallback ladder is core, not edge.
- Reference values (Cal Poly SLO, master's level; data pooled over 2014-15 to 2019-20 completers, federal-aid recipients only):
  - CIP 5213 Management Sciences and Quantitative Methods (the CIP family business analytics programs usually report under; confirm the MSBA maps here): 1-yr median 73,268 (n=18); 4-yr median 131,448 (n=24); national 4-yr median 124,807, p25 93,429, p75 167,728; debt avg 30,820 (n=18).
  - CIP 5202 Business Administration (MBA): 1-yr median 69,350 (n=18); 4-yr median 108,148 (n=32); debt median 20,500, monthly payment 233 (n=19).
- Rate limit: 1,000 requests per hour per key; cache everything.
- Fallback ladder for `S1` (try in order, and label which level was used):
  1. This program at this school — median earnings, most recent cohort
  2. Same CIP field at this school, any credential level
  3. Same program (CIP + credential) at peer schools (same state and control type), median of medians
  4. National BLS median wage for the occupation the degree most commonly leads to
  5. No data — ask the user for a number and label it "your estimate"
- Confidence label on every figure: **High** (level 1, cohort n not suppressed), **Medium** (levels 2–3), **Low** (level 4), **Your input** (level 5 or any override).
- Cache Scorecard responses in the database; refresh monthly.

## 7. Screens

1. **Start** — five fields (salary, raise rate, tax rate, horizon, discount rate) with defaults pre-filled. One button: "Add a program."
2. **Add a program** — search school and program; app fills what Scorecard knows; user fills tuition, length, scholarships, loans. Provenance shown inline as fields populate.
3. **Compare** — the main screen. Cards per program: payback year, NPV, breakeven salary vs. typical salary. Scenario toggle (base / pessimistic / optimistic). Cumulative cash chart. "Keep working" always shown as the baseline.
4. **Program detail** — every number, its source, its confidence, and an "edit" to override. This is the honesty screen.
5. **Workspace** — saved programs and offers; edit a scholarship and everything recomputes. Requires an account (Supabase auth).
6. **Memo (v2)** — AI-written one-page summary of the comparison in plain English, citing the numbers on screen and nothing else. Shareable link.

## 8. Stack

Next.js (App Router) + TypeScript · Supabase (auth, Postgres, Scorecard cache) · Vercel (deploy) · model implemented in TypeScript as a pure module with tests (Vitest) so no second service is needed · charts with a single library (Recharts) · Claude API for the memo in v2 only. Build with Claude Code against this spec; keep this file in the repo as `SPEC.md` and update it when scope changes.

## 9. Schedule against course milestones

- **Week 4 (planning):** this spec finalized; Scorecard API key; field names confirmed; five hand-worked test cases (spreadsheet) for the model.
- **Week 5:** repo, model module + tests passing, deployed "hello world" on Vercel.
- **Week 6 — MVP turn-in:** Start → Add program (manual inputs, no API yet) → Compare with base scenario, chart, payback, NPV, breakeven salary. Deployed.
- **Weeks 7–9:** Scorecard integration + fallback ladder + confidence labels; three scenarios; accounts and saved workspace; program detail screen.
- **Week 10 — peer testing:** classmates run their own decision; collect where they got confused.
- **Weeks 11–12:** fixes from testing; memo (v2) if time; design polish; final deploy.
- **Week 13:** presentation — lead with one chart and one sentence: "here's what the program has to be true for it to pay off."

## 10. Out of scope (v1)

Non-U.S. programs · tax brackets and state taxes (one flat rate only) · income-driven loan repayment · non-financial value of the degree · undergraduate decisions · admissions odds.

## 11. Open questions

- Resolved: use `earnings["1_yr"].overall_median_earnings` as `S1`. Use the 4-year median to check `g_grad`: for Cal Poly CIP 5213, 73,268 → 131,448 over three years implies ~21%/yr, far above the 4% default. Decide whether to (a) keep a conservative default and show the implied rate on the detail screen, or (b) derive `g_grad` from the data when both points exist. Recommendation: (a) for v1; a 21% implied rate on n≈20 is too noisy to drive the model.
- New: the national p25/p50/p75 at 4 years give a ready-made spread for the pessimistic/base/optimistic scenarios. Consider replacing the fixed "halve the uplift" rule with p25/p50/p75 scaled to the 1-year figure when they exist, falling back to the fixed rule when they don't.
- New: map program names to CIP codes. Business analytics may sit under 52.13 (Management Sciences and Quantitative Methods) or the newer 30.71 (Data Analytics). Search both; show the user which CIP title the data came from.
- Should the horizon default be 10 years or "until age 40"? Decide after the first five user tests.
- Whether to show pre-tax alongside after-tax. Default: after-tax only, with a toggle if testers ask.
