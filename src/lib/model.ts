/**
 * Grad Program ROI model — SPEC.md §5.
 *
 * Pure function: inputs in, numbers out. No rounding anywhere (SPEC §5 Rules:
 * "Round only for display; keep full precision in the model").
 */

export interface ModelInputs {
  /** Current (or offered) annual salary, pre-tax. */
  S0: number;
  /** Expected annual raise rate if you keep working. */
  g_work: number;
  /** Effective tax rate applied to all income. */
  t: number;
  /** Discount rate for present value. */
  d: number;
  /** Horizon in years from today. */
  H: number;
  /** Program length in years (fractional allowed). */
  L: number;
  /** Tuition and fees for the whole program. */
  T: number;
  /** Scholarships and grants (total). */
  Sch: number;
  /** Part-time earnings per year while enrolled, pre-tax. */
  PT: number;
  /** Extra living cost per year attributable to the program. */
  Living: number;
  /** Months of job search after finishing before salary starts. */
  gap: number;
  /** Starting salary after the program, pre-tax. */
  S1: number;
  /** Annual raise rate after the program. */
  g_grad: number;
  /** Amount borrowed. */
  B: number;
  /** Loan interest rate. */
  r: number;
  /** Loan term in years. */
  N: number;
}

export interface YearRow {
  /** Year index, 1 … H. */
  k: number;
  /** sf(k): fraction of year k spent in school. */
  schoolFraction: number;
  /** wf(k): fraction of year k spent earning S1. */
  workingFraction: number;
  /** exp(k): number of post-program raises applied. */
  raiseExponent: number;
  /** lf(k): fraction of year k inside the loan term. */
  loanFraction: number;
  /** CF_A(k): after-tax cash from keeping the current job. */
  cfA: number;
  /** CF_B(k): after-tax cash from attending the program. */
  cfB: number;
  /** Diff(k) = CF_B(k) − CF_A(k). */
  diff: number;
  /** CumDiff(k) = Σ_{j≤k} Diff(j). */
  cumDiff: number;
  /** 1 / (1 + d)^k. */
  discountFactor: number;
  /** Present value of Diff(k). */
  pvDiff: number;
  /** m(k): sensitivity of the NPV to S1 in year k. */
  m: number;
}

export interface ModelResult {
  /** P: annual loan payment (0 when nothing is borrowed). */
  loanPayment: number;
  /** C_sch: cash cost per school-year, borrowed money excluded. */
  schoolCostPerYear: number;
  /** ts: time in years when the new salary starts. */
  salaryStart: number;
  /** kf: first working year. */
  firstWorkingYear: number;
  /** One row per year k = 1 … H. */
  years: YearRow[];
  /** NPV of (program − keep working) over the horizon. */
  npv: number;
  /** Σ m(k): the NPV's sensitivity to S1. */
  sumM: number;
  /** First k with CumDiff(k) ≥ 0, or null if that never happens within H. */
  paybackYear: number | null;
  /** S1* making NPV = 0; null when Σm = 0 (no working years in the horizon). */
  breakevenS1: number | null;
  /** CumDiff(H): undiscounted cumulative difference at the horizon. */
  cumDiffAtHorizon: number;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function runModel(inputs: ModelInputs): ModelResult {
  const {
    S0, g_work, t, d, H, L, T, Sch, PT, Living, gap, S1, g_grad, B, r, N,
  } = inputs;

  // C_sch = (T − Sch − B) / L + Living − PT · (1 − t)
  const schoolCostPerYear = (T - Sch - B) / L + Living - PT * (1 - t);
  // ts = L + gap / 12
  const salaryStart = L + gap / 12;
  // kf = floor(ts) + 1
  const firstWorkingYear = Math.floor(salaryStart) + 1;
  // P = B · r / (1 − (1 + r)^(−N))
  const loanPayment = B === 0 ? 0 : (B * r) / (1 - Math.pow(1 + r, -N));

  const years: YearRow[] = [];
  let cumDiff = 0;
  let npv = 0;
  let sumM = 0;
  let paybackYear: number | null = null;

  for (let k = 1; k <= H; k++) {
    const schoolFraction = clamp(L - (k - 1), 0, 1);
    const workingFraction = clamp(k - salaryStart, 0, 1);
    const raiseExponent = Math.max(0, k - firstWorkingYear);
    const loanFraction = clamp(
      Math.min(k, L + N) - Math.max(k - 1, L),
      0,
      1,
    );

    const cfA = S0 * Math.pow(1 + g_work, k - 1) * (1 - t);
    const cfB =
      -schoolCostPerYear * schoolFraction +
      S1 * Math.pow(1 + g_grad, raiseExponent) * (1 - t) * workingFraction -
      loanPayment * loanFraction;

    const diff = cfB - cfA;
    cumDiff += diff;

    const discountFactor = 1 / Math.pow(1 + d, k);
    const pvDiff = diff * discountFactor;
    const m =
      Math.pow(1 + g_grad, raiseExponent) *
      (1 - t) *
      workingFraction *
      discountFactor;

    npv += pvDiff;
    sumM += m;

    if (paybackYear === null && cumDiff >= 0) {
      paybackYear = k;
    }

    years.push({
      k,
      schoolFraction,
      workingFraction,
      raiseExponent,
      loanFraction,
      cfA,
      cfB,
      diff,
      cumDiff,
      discountFactor,
      pvDiff,
      m,
    });
  }

  // NPV is linear in S1, so the breakeven salary has a closed form.
  const breakevenS1 = sumM === 0 ? null : (S1 * sumM - npv) / sumM;

  return {
    loanPayment,
    schoolCostPerYear,
    salaryStart,
    firstWorkingYear,
    years,
    npv,
    sumM,
    paybackYear,
    breakevenS1,
    cumDiffAtHorizon: years.length > 0 ? years[years.length - 1].cumDiff : 0,
  };
}
