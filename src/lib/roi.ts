export type RoiInputs = {
  /** Total out-of-pocket program cost (tuition + fees), USD */
  programCost: number;
  /** Years enrolled full-time */
  yearsInSchool: number;
  /** Current annual salary before the degree, USD */
  currentSalary: number;
  /** Expected annual salary after graduation, USD */
  expectedSalary: number;
  /** Years to evaluate post-graduation payback */
  careerHorizonYears: number;
};

export type RoiResult = {
  opportunityCost: number;
  totalInvestment: number;
  annualLift: number;
  lifetimeLift: number;
  netGain: number;
  paybackYears: number | null;
  roiPercent: number | null;
};

/**
 * Simple graduate-degree ROI model:
 * total investment = tuition + forgone earnings while in school
 * payoff = salary lift over the chosen career horizon
 */
export function calculateRoi(inputs: RoiInputs): RoiResult {
  const {
    programCost,
    yearsInSchool,
    currentSalary,
    expectedSalary,
    careerHorizonYears,
  } = inputs;

  const opportunityCost = Math.max(0, currentSalary) * Math.max(0, yearsInSchool);
  const totalInvestment = Math.max(0, programCost) + opportunityCost;
  const annualLift = expectedSalary - currentSalary;
  const lifetimeLift = annualLift * Math.max(0, careerHorizonYears);
  const netGain = lifetimeLift - totalInvestment;

  const paybackYears =
    annualLift > 0 ? totalInvestment / annualLift : null;

  const roiPercent =
    totalInvestment > 0 ? (netGain / totalInvestment) * 100 : null;

  return {
    opportunityCost,
    totalInvestment,
    annualLift,
    lifetimeLift,
    netGain,
    paybackYears,
    roiPercent,
  };
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatYears(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value > 50) return ">50 yrs";
  return `${value.toFixed(1)} yrs`;
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}
