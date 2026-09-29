# Pathfinder — Product Spec v1.0

Owner: Devin Alexander · Course: AI-Assisted Application Development · Date: Sept 28, 2026
Supersedes: Grad Program ROI spec v0.3 (its model and Scorecard sections are carried forward unchanged as Appendix A).

## 1. One-sentence pitch

You name the job you want; Pathfinder shows you how to get there, what it costs, whether the market wants that job right now, and what to do next — then keeps watching the market for you.

## 2. Problem

People pick careers and pay for degrees on hunches. The facts they'd need — how many of these jobs exist, what they pay, whether the field is growing, what employers actually ask for, what a program costs and what its graduates earn — are all public but scattered across five government sites and a hundred job boards. Nobody assembles them per person, and nobody keeps them current after the decision is made.

## 3. User

Primary: a college senior or early-career person (roughly 20–30) with a target job in mind and a question about how to reach it. Works for anyone deciding between "go back to school" and "get there another way." Secondary (later): university career offices.

## 4. What it does, in reading order

Every screen answers the same question from a different angle. The user enters two things to start: **the job they want** (occupation search, mapped to a federal SOC code) and **where they are** (state or metro). Everything else is optional and pre-filled.

### 4.1 The job right now
- How many people do this job, median pay, pay range (10th–90th percentile), and projected growth over ten years — national and for the user's state. Source: BLS OEWS and Employment Projections (Appendix B).
- Typical entry education and whether a license or certification is usually required. Source: BLS/O*NET.
- Live demand: number of postings for this title in the user's region in the last 30 days, and the median advertised salary. Source: Adzuna postings API.
- One plain-language line generated from the numbers, e.g. "Financial analysts: 350,000 jobs nationally, growing about as fast as average, 140 openings near San Luis Obispo this month."

### 4.2 The path
- Two or three routes to the target job, side by side: (a) the graduate program route, (b) certification plus a stepping-stone role, (c) apply now. Each route shows time to target, out-of-pocket cost, and expected pay at each step.
- Route (a) uses the existing ROI model (Appendix A) with Scorecard data for the program: payback year, NPV, breakeven starting salary, cumulative-cash chart. This is the current app, embedded as one card.
- Stepping-stone roles come from O*NET's related-occupations and typical-career-ladder data; the user can edit the path.
- Every number carries its source and a confidence label (Appendix A3 ladder).

### 4.3 The news
- The 5–8 most relevant articles from the last 60 days about this occupation and its industry, filtered to the user's region when available. Source: NewsAPI (or GDELT as the free fallback).
- AI summary, three fixed headings, two sentences each: **Demand** (hiring, layoffs, openings), **Pay** (raises, comp trends), **Technology and AI** (what is being automated, what is being reported). Each sentence links to the article it came from. The summary states what was reported; it does not render a verdict on whether AI will take the job.

### 4.4 Next moves
- Skills and credentials ranked by how often they appear in current postings for the target job: "SQL appears in 62% of postings, Python 41%, CFA 18%." Source: Adzuna posting text, counted server-side.
- Top hiring employers in the region by posting count.
- The cheapest program that satisfies the typical education requirement, from Scorecard.
- AI-written paragraph that turns the above into three concrete actions, citing only numbers on screen.

### 4.5 Saved paths and weekly alerts (the retention feature)
- A signed-in user saves a path (target job + region + chosen route). Supabase stores it.
- A scheduled job runs weekly: re-pulls postings count, median advertised salary, and news for each saved path; stores a snapshot.
- If postings moved more than 15% or a new article matches, the user gets an email: "Openings for financial analyst near SLO: 140 → 95 (−32%) this month. 2 new articles." Email via Resend.
- The saved-path page shows the history as a small chart: postings and advertised salary over time. This is the app's own data and grows the longer someone uses it.

## 5. What the AI does and does not do
- Does: summarize news under fixed headings with citations; write the "next moves" paragraph from on-screen numbers; map free-text job titles to SOC codes when search is ambiguous.
- Does not: predict salaries, predict whether AI will replace a job, rate programs, or produce any number that is not traceable to a source or the ROI model.

## 6. Design rules
- One page per section, four cards on the home screen, details one click deep. Never more than six numbers visible on a card.
- Every figure: value, source, as-of date, confidence label. Hover or tap reveals the source.
- Plain language everywhere; define a term once where it first appears.
- Blank states are honest: "No postings data for this region; showing national" rather than a zero.

## 7. Stack
Next.js (App Router) + TypeScript · Supabase (auth, Postgres, cached API responses, saved paths, weekly snapshots) · Vercel (hosting + cron for the weekly job) · Recharts · Claude API for summaries · Resend for email. All external keys in environment variables. Cache every external response with a timestamp; the UI reads the cache, and a refresh job updates it, so the app stays fast and within free-tier rate limits.

## 8. Schedule against course milestones
- **Week 6 — MVP turn-in (Oct 5):** the existing ROI calculator, deployed on Vercel, plus section 4.1 for one occupation pulled live from BLS. Demonstrates the primary workflow: pick a job, see the market, see the money.
- **Week 7:** occupation search mapped to SOC codes; BLS state-level data; Adzuna postings count and salary; caching layer.
- **Week 8:** the path screen (4.2) with the ROI card embedded and Scorecard lookup wired in with the fallback ladder.
- **Week 9:** news feed and AI summary (4.3); next moves with posting-skill counts (4.4); deploy.
- **Week 10 — peer testing:** classmates enter their own target job; capture confusion and missing data cases.
- **Week 11:** accounts, saved paths, weekly job, email alerts (4.5); fixes from testing.
- **Week 12 — final product:** polish, honest blank states, source labels everywhere, final deploy.
- **Week 13 — presentation:** open on the home screen for one job, walk the four cards, end on the alerts chart.

## 9. Out of scope (v1)
Resume matching · cover letters · applying to jobs · interview prep · non-U.S. jobs · Reddit/Glassdoor sentiment · salary negotiation · multiple regions at once · comparing two target jobs (v2).

## 10. Risks and the plan for each

Verified Sept 28, 2026 (live calls from Devin's machine):

- **BLS OEWS API — works, no key needed.** `POST https://api.bls.gov/publicAPI/v2/timeseries/data/` with `{"seriesid":[...]}`. Series ID format confirmed: `OEU` + area type (`N` national, `S` state, `M` metro) + 7-digit area code (`0000000` national, `0600000` California, `0042020` San Luis Obispo–Paso Robles MSA) + 6-digit industry (`000000` all) + 6-digit SOC without hyphen (`132051` financial analysts) + 2-digit data type (`01` employment, `04` annual mean wage, `13` annual median wage). Latest year is 2025 (the "no data 2023/2024" messages are noise; ignore). Financial analysts: national employment 361,980, median $102,740, mean $116,800; California employment 45,380, median $109,110; SLO metro (`0042020`) median $102,970. This note originally gave `0042200` for San Luis Obispo; that code is Santa Maria–Santa Barbara ($97,720), and the error was caught on Sept 28, 2026 by `scripts/verify-metros.ts` and confirmed against the BLS CBSA code list. Unregistered use is capped at 25 queries/day and 25 series per query — register a free key (500/day, 50 per query) and cache.
- **GDELT news API — works but rough.** Free, no key, one request per 5 seconds enforced; a bare occupation query returns loosely related business news (a "financial analyst" search returned stock-pick articles and local business features). Needs tight query phrasing (title + "hiring" / "jobs" / "layoffs", plus industry terms) and AI relevance filtering before summarizing. Treat as fallback; prefer NewsAPI once a key exists.
- **Not yet tested (need free registration):** O*NET Web Services (occupation search, related roles), Adzuna (postings and salary), NewsAPI. First task of week 7: register all three and repeat this check. Adzuna is the one the "next moves" skill counts depend on; if its free tier is too thin, fall back to O*NET's skills list for the occupation (static but authoritative).
- **Job title to SOC mapping is fuzzy.** Use O*NET's title crosswalk first; fall back to an AI suggestion the user confirms. Seed a lookup table of the 50 most common target titles.
- **Scorecard gaps (only ~1/3 of graduate programs have earnings).** Fallback ladder in A3; label the level used.
- **API limits or outages during a demo.** The UI never calls an external API directly; a refresh job fills a Supabase cache and the pages read from it. Seed the cache with 20 common occupations so demos never depend on a live call.
- **Scope creep.** Each week ships one section. Nothing from section 9 gets built before week 12.

---

## Appendix B — Labor market and news data sources

- **BLS OEWS** (Occupational Employment and Wage Statistics): employment count, median and percentile wages by SOC code, national and by state/metro. Public API v2 at `https://api.bls.gov/publicAPI/v2/timeseries/data/` with a free registration key; series IDs encode area + occupation + data type. Annual release (May reference). Confirm exact series-ID format against the BLS docs before coding; if the API proves awkward, the annual OEWS flat files are downloadable and can be loaded into Supabase once.
- **BLS Employment Projections**: 10-year projected growth and typical entry education per occupation; published as downloadable tables (no live API needed — load once per year).
- **O*NET Web Services** (`https://services.onetcenter.org/`): occupation search, related occupations, tasks and skills, education requirements; free API key.
- **Adzuna Jobs API** (`https://api.adzuna.com/v1/api/jobs/us/search/`): postings by title and location, count and salary histogram; free developer tier with daily call limits — cache and refresh weekly.
- **NewsAPI** (`https://newsapi.org/`): keyword news search; free developer tier (delayed, limited results). Fallback: GDELT 2.0 doc API, free and unlimited but noisier.
- **College Scorecard**: see Appendix A3.

All sources are U.S. federal or free-tier commercial; none require scraping.

---

## Appendix A — ROI model and Scorecard data (carried forward from Grad ROI spec v0.3)

## A1. ROI model inputs

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

## A2. ROI model (annual steps, year k = 1 … H, after-tax cash)

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

## A3. Data: College Scorecard

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

