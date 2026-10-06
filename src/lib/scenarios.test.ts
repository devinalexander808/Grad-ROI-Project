import { describe, expect, it } from "vitest";
import { runModel, type ModelInputs } from "./model";
import {
  FULL_TIME,
  applyStudyOptions,
  cumulativeBand,
  runScenarios,
  scenarioInputs,
} from "./scenarios";

/**
 * Hand-worked cases for part-time study and reimbursement. The numbers are
 * chosen so every year can be checked on paper: no raises, no discounting
 * (d = 0, so NPV = CumDiff(H)), no loan, no job search.
 *
 * Shared: S0 $60,000, t 25%, so keeping your job pays 45,000 a year after tax.
 * After the program S1 = $80,000 → 60,000 a year after tax, +15,000 a year.
 */
const BASE: ModelInputs = {
  S0: 60000, g_work: 0, t: 0.25, d: 0, H: 5,
  L: 1, T: 20000, Sch: 0, PT: 0, Living: 0,
  gap: 0, S1: 80000, g_grad: 0,
  B: 0, r: 0.08, N: 10,
};

const DOLLAR = 1;
function expectDollars(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(DOLLAR);
}

function cumDiffs(inputs: ModelInputs): number[] {
  return runModel(inputs).years.map((y) => y.cumDiff);
}

describe("full-time reference (no options)", () => {
  // C_sch = 20,000. Year 1: −20,000 − 45,000 = −65,000. Years 2–5: +15,000.
  // CumDiff: −65,000, −50,000, −35,000, −20,000, −5,000 → never pays back.
  it("matches the hand calculation", () => {
    const { inputs } = applyStudyOptions(BASE, FULL_TIME);
    expect(inputs).toEqual(BASE);
    const out = runModel(inputs);
    cumDiffs(inputs).forEach((v, i) =>
      expectDollars(v, [-65000, -50000, -35000, -20000, -5000][i]),
    );
    expect(out.paybackYear).toBeNull();
  });
});

describe("part-time study", () => {
  // Two years part-time, keeping the full $60,000 job.
  // C_sch = 20,000 / 2 − 60,000 · 0.75 = 10,000 − 45,000 = −35,000, so the
  // program path nets +35,000 in each school year: diff −10,000 in years 1–2.
  // Salary starts at ts = 2: years 3–5 diff +15,000.
  // CumDiff: −10,000, −20,000, −5,000, 10,000, 25,000 → pays back in year 4.
  // NPV (d = 0) = 25,000. Σm = 3 · 0.75 = 2.25;
  // S1* = (80,000 · 2.25 − 25,000) / 2.25 = 68,888.89.
  const options = {
    partTime: true,
    partTimeLength: 2,
    payWhileStudying: 60000,
    reimbursementPerYear: 0,
  };

  it("lengthens the program and keeps the pay", () => {
    const { inputs } = applyStudyOptions(BASE, options);
    expect(inputs.L).toBe(2);
    expect(inputs.PT).toBe(60000);
  });

  it("matches the hand calculation", () => {
    const out = runModel(applyStudyOptions(BASE, options).inputs);
    out.years.forEach((y, i) =>
      expectDollars(y.cumDiff, [-10000, -20000, -5000, 10000, 25000][i]),
    );
    expect(out.paybackYear).toBe(4);
    expectDollars(out.npv, 25000);
    expectDollars(out.breakevenS1 as number, 68888.89);
  });
});

describe("tuition reimbursement", () => {
  // $5,250 a year for a 1-year program → Sch = 5,250.
  // C_sch = 20,000 − 5,250 = 14,750. Year 1: −14,750 − 45,000 = −59,750.
  // Years 2–5: +15,000. CumDiff(5) = −59,750 + 60,000 = 250 → year 5.
  it("cuts each school-year's cost by the amount", () => {
    const adjusted = applyStudyOptions(BASE, {
      ...FULL_TIME,
      reimbursementPerYear: 5250,
    });
    expect(adjusted.reimbursementTotal).toBe(5250);
    expect(adjusted.inputs.Sch).toBe(5250);

    const out = runModel(adjusted.inputs);
    expectDollars(out.schoolCostPerYear, 14750);
    expectDollars(out.years[0].cumDiff, -59750);
    expectDollars(out.cumDiffAtHorizon, 250);
    expect(out.paybackYear).toBe(5);
  });

  it("never pays more than tuition after scholarships", () => {
    const adjusted = applyStudyOptions(
      { ...BASE, Sch: 5000 },
      { ...FULL_TIME, reimbursementPerYear: 30000 },
    );
    expect(adjusted.reimbursementTotal).toBe(15000);
    expectDollars(runModel(adjusted.inputs).schoolCostPerYear, 0);
  });

  it("caps borrowing at what is left to pay", () => {
    // Borrowing the full $20,000 while the employer covers $5,250 would leave
    // a $5,250 cash surplus in the school year; borrow only the $14,750 left.
    const adjusted = applyStudyOptions(
      { ...BASE, B: 20000 },
      { ...FULL_TIME, reimbursementPerYear: 5250 },
    );
    expect(adjusted.borrowingCappedAt).toBe(14750);
    expect(adjusted.inputs.B).toBe(14750);
    expectDollars(runModel(adjusted.inputs).schoolCostPerYear, 0);
  });

  it("combines with part-time study, counted per school-year", () => {
    // Two part-time years at $5,250 → Sch = 10,500.
    // C_sch = (20,000 − 10,500) / 2 − 45,000 = 4,750 − 45,000 = −40,250.
    // Years 1–2 diff: 40,250 − 45,000 = −4,750. Years 3–5: +15,000.
    // CumDiff: −4,750, −9,500, 5,500, 20,500, 35,500 → year 3.
    const out = runModel(
      applyStudyOptions(BASE, {
        partTime: true,
        partTimeLength: 2,
        payWhileStudying: 60000,
        reimbursementPerYear: 5250,
      }).inputs,
    );
    out.years.forEach((y, i) =>
      expectDollars(y.cumDiff, [-4750, -9500, 5500, 20500, 35500][i]),
    );
    expect(out.paybackYear).toBe(3);
  });
});

describe("scenarios (SPEC A2)", () => {
  const entered: ModelInputs = { ...BASE, gap: 3, g_work: 0.03, g_grad: 0.04 };

  it("base is the inputs as entered", () => {
    expect(scenarioInputs(entered, "base")).toEqual(entered);
  });

  it("pessimistic halves the uplift, searches 9 months, raises at g_work", () => {
    const p = scenarioInputs(entered, "pessimistic");
    expect(p.S1).toBe(70000); // 60,000 + 20,000 / 2
    expect(p.gap).toBe(9);
    expect(p.g_grad).toBe(0.03);
  });

  it("optimistic adds a quarter to the uplift with no search", () => {
    const o = scenarioInputs(entered, "optimistic");
    expect(o.S1).toBe(85000); // 60,000 + 20,000 · 1.25
    expect(o.gap).toBe(0);
    expect(o.g_grad).toBe(0.04);
  });

  it("never makes pessimistic better than base", () => {
    // A pay cut: halving it would be an improvement, so pessimistic takes
    // the bigger cut and optimistic the smaller one.
    const cut = { ...entered, S1: 50000, gap: 12, g_grad: 0.02 };
    const p = scenarioInputs(cut, "pessimistic");
    const o = scenarioInputs(cut, "optimistic");
    expect(p.S1).toBe(47500);
    expect(o.S1).toBe(55000);
    expect(p.gap).toBe(12);
    expect(p.g_grad).toBe(0.02);
  });

  it("orders the outcomes and bands the base line", () => {
    const all = runScenarios({ ...entered, d: 0.05, H: 10 });
    expect(all.pessimistic.result.npv).toBeLessThan(all.base.result.npv);
    expect(all.base.result.npv).toBeLessThan(all.optimistic.result.npv);

    const band = cumulativeBand(all);
    expect(band).toHaveLength(10);
    band.forEach((b, i) => {
      const line = all.base.result.years[i].cumDiff;
      expect(b.low).toBeLessThanOrEqual(line + DOLLAR);
      expect(b.high).toBeGreaterThanOrEqual(line - DOLLAR);
    });
  });
});
