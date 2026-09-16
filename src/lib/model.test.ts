import { describe, expect, it } from 'vitest';
import { runModel, type ModelInputs } from './model';

/**
 * Expected values come from grad_roi_test_cases.xlsx (the hand-worked
 * spreadsheet referenced in SPEC.md §9, Week 4): inputs from each case sheet
 * rows 5-20, outputs from the Summary sheet.
 */

/** Tolerance on dollar amounts. */
const DOLLAR = 1;

interface Case {
  name: string;
  inputs: ModelInputs;
  paybackYear: number | null;
  npv: number;
  breakevenS1: number;
  cumDiffAtHorizon: number;
}

const CASES: Case[] = [
  {
    name: '1. Cheap program, big salary jump',
    inputs: {
      S0: 60000, g_work: 0.03, t: 0.25, d: 0.05, H: 10,
      L: 1, T: 20000, Sch: 0, PT: 0, Living: 0,
      gap: 3, S1: 95000, g_grad: 0.04,
      B: 20000, r: 0.08, N: 10,
    },
    paybackYear: 4,
    npv: 129985.681819488,
    breakevenS1: 72292.1203650216,
    cumDiffAtHorizon: 193511.788894113,
  },
  {
    name: '2. Expensive program, small salary jump',
    inputs: {
      S0: 70000, g_work: 0.03, t: 0.25, d: 0.05, H: 10,
      L: 2, T: 120000, Sch: 0, PT: 0, Living: 0,
      gap: 3, S1: 80000, g_grad: 0.04,
      B: 100000, r: 0.08, N: 10,
    },
    paybackYear: null,
    npv: -177085.588430577,
    breakevenS1: 116500.899078836,
    cumDiffAtHorizon: -203223.679201963,
  },
  {
    name: '3. Ten-month program (MSBA-like), Scorecard salary',
    inputs: {
      S0: 65000, g_work: 0.03, t: 0.25, d: 0.05, H: 10,
      L: 0.83, T: 40000, Sch: 5000, PT: 0, Living: 0,
      gap: 3, S1: 73268, g_grad: 0.04,
      B: 35000, r: 0.08, N: 10,
    },
    paybackYear: null,
    npv: -34721.1329969283,
    breakevenS1: 79213.5005365167,
    cumDiffAtHorizon: -29556.0257221995,
  },
  {
    name: '4. No borrowing (paid from savings)',
    inputs: {
      S0: 55000, g_work: 0.03, t: 0.25, d: 0.05, H: 10,
      L: 1, T: 30000, Sch: 10000, PT: 0, Living: 0,
      gap: 3, S1: 75000, g_grad: 0.04,
      B: 0, r: 0.08, N: 10,
    },
    paybackYear: 6,
    npv: 49433.1259097622,
    breakevenS1: 66364.2682991926,
    cumDiffAtHorizon: 88334.7146195451,
  },
  {
    name: '5. High salary already, program never pays off',
    inputs: {
      S0: 90000, g_work: 0.03, t: 0.25, d: 0.05, H: 10,
      L: 2, T: 90000, Sch: 0, PT: 0, Living: 0,
      gap: 3, S1: 92000, g_grad: 0.04,
      B: 90000, r: 0.08, N: 10,
    },
    paybackYear: null,
    npv: -222750.348770129,
    breakevenS1: 137913.324016321,
    cumDiffAtHorizon: -262581.473437072,
  },
];

function expectDollars(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(DOLLAR);
}

describe('runModel against the hand-worked spreadsheet cases', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const out = runModel(c.inputs);

      expect(out.paybackYear).toBe(c.paybackYear);
      expect(out.breakevenS1).not.toBeNull();
      expectDollars(out.npv, c.npv);
      expectDollars(out.breakevenS1 as number, c.breakevenS1);
      expectDollars(out.cumDiffAtHorizon, c.cumDiffAtHorizon);

      // The spreadsheet's own sanity check: NPV recomputed at S1* is 0.
      expectDollars(
        out.npv + ((out.breakevenS1 as number) - c.inputs.S1) * out.sumM,
        0,
      );

      expect(out.years).toHaveLength(c.inputs.H);
    });
  }
});
