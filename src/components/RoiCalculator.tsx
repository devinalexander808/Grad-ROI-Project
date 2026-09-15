"use client";

import { useDeferredValue, useId, useState } from "react";
import {
  calculateRoi,
  formatPercent,
  formatUsd,
  formatYears,
  type RoiInputs,
} from "@/lib/roi";

const defaults: RoiInputs = {
  programCost: 65000,
  yearsInSchool: 2,
  currentSalary: 62000,
  expectedSalary: 98000,
  careerHorizonYears: 10,
};

type FieldKey = keyof RoiInputs;

const fields: { key: FieldKey; label: string; hint: string; step: number }[] = [
  {
    key: "programCost",
    label: "Program cost",
    hint: "Tuition and fees you expect to pay",
    step: 1000,
  },
  {
    key: "yearsInSchool",
    label: "Years in school",
    hint: "Full-time years away from work",
    step: 0.5,
  },
  {
    key: "currentSalary",
    label: "Current salary",
    hint: "Annual pay before the degree",
    step: 1000,
  },
  {
    key: "expectedSalary",
    label: "Expected salary",
    hint: "Annual pay after graduating",
    step: 1000,
  },
  {
    key: "careerHorizonYears",
    label: "Career horizon",
    hint: "Years of post-grad earnings to count",
    step: 1,
  },
];

export function RoiCalculator() {
  const formId = useId();
  const [inputs, setInputs] = useState<RoiInputs>(defaults);
  const deferredInputs = useDeferredValue(inputs);
  const result = calculateRoi(deferredInputs);

  function update(key: FieldKey, raw: string) {
    const next = Number(raw);
    setInputs((prev) => ({
      ...prev,
      [key]: Number.isFinite(next) ? Math.max(0, next) : 0,
    }));
  }

  return (
    <div className="calculator">
      <form className="calculator-form" aria-labelledby={`${formId}-title`}>
        <div className="calculator-intro">
          <h2 id={`${formId}-title`}>Estimate your return</h2>
          <p>
            Adjust the inputs to weigh tuition, forgone earnings, and the salary
            lift you expect after graduating.
          </p>
        </div>

        <div className="field-grid">
          {fields.map((field) => (
            <label key={field.key} className="field" htmlFor={`${formId}-${field.key}`}>
              <span className="field-label">{field.label}</span>
              <span className="field-hint">{field.hint}</span>
              <input
                id={`${formId}-${field.key}`}
                type="number"
                min={0}
                step={field.step}
                value={inputs[field.key]}
                onChange={(event) => update(field.key, event.target.value)}
              />
            </label>
          ))}
        </div>
      </form>

      <aside className="calculator-results" aria-live="polite">
        <p className="results-kicker">Projected outcome</p>
        <p
          className={`results-hero ${result.netGain >= 0 ? "is-positive" : "is-negative"}`}
        >
          {formatUsd(result.netGain)}
        </p>
        <p className="results-sub">
          Net gain over {inputs.careerHorizonYears} years after graduation
        </p>

        <dl className="results-grid">
          <div>
            <dt>Total investment</dt>
            <dd>{formatUsd(result.totalInvestment)}</dd>
          </div>
          <div>
            <dt>Annual lift</dt>
            <dd>{formatUsd(result.annualLift)}</dd>
          </div>
          <div>
            <dt>Payback</dt>
            <dd>{formatYears(result.paybackYears)}</dd>
          </div>
          <div>
            <dt>ROI</dt>
            <dd>{formatPercent(result.roiPercent)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
