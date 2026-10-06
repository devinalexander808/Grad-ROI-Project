/**
 * Build 4 — scenarios, part-time study and tuition reimbursement, as pure
 * transforms on the model's inputs. `model.ts` is untouched: every option here
 * is expressed through inputs SPEC Appendix A already has.
 *
 * - Part-time study sets the program length `L` and the pay kept while
 *   enrolled `PT` (A1: "PT part-time earnings per year while enrolled").
 * - Reimbursement is money toward tuition you never pay back, which is what
 *   `Sch` means (A1: "scholarships and grants"), so R per school-year adds
 *   R · L to Sch. C_sch spreads (T − Sch − B) evenly over the school years, so
 *   each school-year's cost drops by exactly R.
 * - Scenarios follow A2 "Scenarios (v1: three fixed cases)".
 */

import { runModel, type ModelInputs, type ModelResult } from "./model";

export interface StudyOptions {
  partTime: boolean;
  /** Program length in years when studying part-time. */
  partTimeLength: number;
  /** Pre-tax pay per year kept while studying part-time. */
  payWhileStudying: number;
  /** Employer tuition reimbursement per school-year. */
  reimbursementPerYear: number;
}

export const FULL_TIME: StudyOptions = {
  partTime: false,
  partTimeLength: 0,
  payWhileStudying: 0,
  reimbursementPerYear: 0,
};

export interface StudyAdjustment {
  inputs: ModelInputs;
  /** Total reimbursement counted, after capping at what tuition leaves. */
  reimbursementTotal: number;
  /** Set when the amount borrowed was cut to what is left to pay. */
  borrowingCappedAt: number | null;
}

/**
 * Applies part-time study and reimbursement to the full-time inputs.
 *
 * Reimbursement is capped at tuition after scholarships: an employer does not
 * pay you more than the bill. Borrowing is then capped at what is left, since
 * the model's B pays tuition; otherwise C_sch would turn into a cash surplus.
 */
export function applyStudyOptions(
  base: ModelInputs,
  options: StudyOptions,
): StudyAdjustment {
  const L = options.partTime ? options.partTimeLength : base.L;
  const PT = options.partTime ? options.payWhileStudying : base.PT;

  const leftAfterScholarships = Math.max(base.T - base.Sch, 0);
  const reimbursementTotal = Math.min(
    Math.max(options.reimbursementPerYear, 0) * L,
    leftAfterScholarships,
  );
  const Sch = base.Sch + reimbursementTotal;

  const leftToPay = Math.max(base.T - Sch, 0);
  const capBorrowing = reimbursementTotal > 0 && base.B > leftToPay;
  const B = capBorrowing ? leftToPay : base.B;

  return {
    inputs: { ...base, L, PT, Sch, B },
    reimbursementTotal,
    borrowingCappedAt: capBorrowing ? leftToPay : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Scenarios                                                                   */
/* -------------------------------------------------------------------------- */

export const SCENARIOS = ["pessimistic", "base", "optimistic"] as const;
export type Scenario = (typeof SCENARIOS)[number];

/** SPEC A2: the pessimistic job search is 9 months; the optimistic one, none. */
export const PESSIMISTIC_GAP_MONTHS = 9;

/**
 * The inputs for one scenario. SPEC A2:
 * - Base: the inputs as entered.
 * - Pessimistic: salary uplift (S1 − S0) halved, gap 9 months, g_grad = g_work.
 * - Optimistic: uplift × 1.25, gap 0, g_grad as entered.
 *
 * Read literally, A2 makes "pessimistic" better than base whenever the
 * entered values are already worse than its fixed ones: a pay cut halved is a
 * smaller cut, a 12-month search beats 9. So each scenario takes the worse
 * (or better) of its rule and the entered value, and the three never cross.
 */
export function scenarioInputs(base: ModelInputs, scenario: Scenario): ModelInputs {
  if (scenario === "base") return base;

  const uplift = base.S1 - base.S0;
  const halved = base.S0 + uplift * 0.5;
  const boosted = base.S0 + uplift * 1.25;

  if (scenario === "pessimistic") {
    return {
      ...base,
      S1: Math.min(halved, boosted),
      gap: Math.max(base.gap, PESSIMISTIC_GAP_MONTHS),
      g_grad: Math.min(base.g_grad, base.g_work),
    };
  }
  return {
    ...base,
    S1: Math.max(halved, boosted),
    gap: 0,
  };
}

export type ScenarioResults = Record<
  Scenario,
  { inputs: ModelInputs; result: ModelResult }
>;

/** Runs the model once per scenario. */
export function runScenarios(base: ModelInputs): ScenarioResults {
  const run = (scenario: Scenario) => {
    const inputs = scenarioInputs(base, scenario);
    return { inputs, result: runModel(inputs) };
  };
  return {
    pessimistic: run("pessimistic"),
    base: run("base"),
    optimistic: run("optimistic"),
  };
}

/** One point of the chart's band: the low and high cumulative cash for year k. */
export interface BandPoint {
  k: number;
  low: number;
  high: number;
}

/** Pessimistic-to-optimistic band of cumulative cash, year by year. */
export function cumulativeBand(results: ScenarioResults): BandPoint[] {
  const low = results.pessimistic.result.years;
  const high = results.optimistic.result.years;
  return low.map((y, i) => ({
    k: y.k,
    low: Math.min(y.cumDiff, high[i].cumDiff),
    high: Math.max(y.cumDiff, high[i].cumDiff),
  }));
}
