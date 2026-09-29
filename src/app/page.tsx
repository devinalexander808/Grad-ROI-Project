"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import CumulativeChart from "./cumulative-chart";
import NextMoves from "./next-moves";
import { runModel, type ModelInputs } from "@/lib/model";
import {
  formatDollars,
  formatPercent,
  formatSignedDollars,
} from "@/lib/format";
import { clearSelection, useSelection } from "@/lib/selection";

/**
 * Single-page calculator: every input from SPEC.md §4 on the left, the §5
 * outputs on the right, recomputed on every keystroke.
 *
 * v1 scope: manual inputs only — no Scorecard lookup, no accounts, no
 * scenarios. Rates are held in percent units here and converted to decimals
 * at the model boundary; the model itself never rounds.
 */

type Fields = {
  school: string;
  program: string;
  credential: string;
  S0: string;
  g_work: string;
  t: string;
  d: string;
  H: string;
  L: string;
  T: string;
  Sch: string;
  PT: string;
  Living: string;
  gap: string;
  S1: string;
  g_grad: string;
  B: string;
  r: string;
  N: string;
};

const DEFAULTS: Fields = {
  school: "",
  program: "",
  credential: "Master’s",
  S0: "60000",
  g_work: "3",
  t: "25",
  d: "5",
  H: "10",
  L: "2",
  T: "40000",
  Sch: "0",
  PT: "0",
  Living: "0",
  gap: "3",
  S1: "85000",
  g_grad: "4",
  B: "40000",
  r: "8",
  N: "10",
};

const CREDENTIALS = [
  "Master’s",
  "Doctorate",
  "Graduate certificate",
  "Other",
] as const;

function num(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toModelInputs(f: Fields): ModelInputs {
  return {
    S0: num(f.S0),
    g_work: num(f.g_work) / 100,
    t: num(f.t) / 100,
    d: num(f.d) / 100,
    H: Math.floor(num(f.H)),
    L: num(f.L),
    T: num(f.T),
    Sch: num(f.Sch),
    PT: num(f.PT),
    Living: num(f.Living),
    gap: num(f.gap),
    S1: num(f.S1),
    g_grad: num(f.g_grad) / 100,
    B: num(f.B),
    r: num(f.r) / 100,
    N: num(f.N),
  };
}

/** Input combinations the §5 formulas cannot express, caught before the model runs. */
function problems(inputs: ModelInputs): string[] {
  const found: string[] = [];
  if (!(inputs.L > 0)) {
    found.push("Program length has to be more than 0 years.");
  }
  if (!(inputs.H >= 1)) {
    found.push("Horizon has to be at least 1 year.");
  }
  if (inputs.B > 0 && !(inputs.r > 0)) {
    found.push(
      "Loan interest rate has to be above 0% when you borrow — the payment formula divides by it.",
    );
  }
  if (inputs.B > 0 && !(inputs.N > 0)) {
    found.push("Loan term has to be more than 0 years when you borrow.");
  }
  return found;
}

/** The URL never changes under this page, so there is nothing to subscribe to. */
function noSubscription(): () => void {
  return () => {};
}

function cameFromJobPage(): boolean {
  return new URLSearchParams(window.location.search).get("from") === "job";
}

export default function Home() {
  const [typed, setTyped] = useState<Fields>(DEFAULTS);
  const [salaryTouched, setSalaryTouched] = useState(false);

  // The job + state chosen on the Job page, if any (SPEC §4.1 → §4.2).
  const selection = useSelection();
  const medianSalary =
    selection === null ? null : String(Math.round(selection.stateMedian));

  // Arriving via the Job page's "Use this in the ROI calculator" button
  // (/?from=job) starts the salary at the BLS median — until the user edits the
  // salary, after which what they typed always wins.
  const fromJob = useSyncExternalStore(
    noSubscription,
    cameFromJobPage,
    () => false,
  );
  const fields = useMemo(
    () =>
      fromJob && !salaryTouched && medianSalary !== null
        ? { ...typed, S1: medianSalary }
        : typed,
    [typed, fromJob, salaryTouched, medianSalary],
  );

  const set = (key: keyof Fields) => (value: string) => {
    if (key === "S1") setSalaryTouched(true);
    setTyped((prev) => ({ ...prev, [key]: value }));
  };

  // Clearing the selection must not quietly swap the salary back to the
  // default, so pin whatever is showing first.
  const clear = () => {
    set("S1")(fields.S1);
    clearSelection();
  };

  const inputs = useMemo(() => toModelInputs(fields), [fields]);
  const issues = useMemo(() => problems(inputs), [inputs]);
  const result = useMemo(
    () => (issues.length === 0 ? runModel(inputs) : null),
    [inputs, issues],
  );

  const horizon = inputs.H;
  const breakeven = result?.breakevenS1 ?? null;
  const breakevenGap = breakeven === null ? null : inputs.S1 - breakeven;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Grad Program ROI
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Whether a specific graduate program pays off for you, against the
          alternative of staying in your job. Every figure below is yours to
          change, and every figure is after tax.
        </p>
      </header>

      {selection && (
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-hairline bg-surface px-4 py-2 text-sm text-ink-secondary">
          <span>
            Planning for:{" "}
            <span className="font-medium text-ink">
              {selection.title} in {selection.stateName}
            </span>{" "}
            — BLS median {formatDollars(selection.stateMedian)}
            {selection.year === null ? "" : ` (${selection.year})`}
          </span>
          <span className="flex items-center gap-3 text-xs">
            <Link href="/job" className="text-accent hover:underline">
              change
            </Link>
            <button
              type="button"
              className="text-muted hover:text-ink hover:underline"
              onClick={clear}
            >
              clear
            </button>
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ---------------------------------------------------------------- */}
        {/* Inputs (SPEC §4)                                                  */}
        {/* ---------------------------------------------------------------- */}
        <form
          className="flex flex-col gap-6 lg:col-span-5"
          onSubmit={(e) => e.preventDefault()}
        >
          <Section
            title="About you"
            note="The path where you skip the program and keep working."
          >
            <Field
              label="Current salary"
              hint="Pre-tax, per year. The offer you already have counts."
              prefix="$"
              value={fields.S0}
              onChange={set("S0")}
              step={1000}
            />
            <Field
              label="Raise rate if you keep working"
              hint="Average annual raise, compounded once a year."
              suffix="%"
              value={fields.g_work}
              onChange={set("g_work")}
              step={0.5}
            />
            <Field
              label="Effective tax rate"
              hint="One flat rate on all income, to keep the model explainable."
              suffix="%"
              value={fields.t}
              onChange={set("t")}
              step={1}
            />
            <Field
              label="Discount rate"
              hint="How much less a dollar next year is worth to you than one today."
              suffix="%"
              value={fields.d}
              onChange={set("d")}
              step={0.5}
            />
            <Field
              label="Horizon"
              hint="How many years out to look. 5 to 20."
              suffix="years"
              value={fields.H}
              onChange={set("H")}
              min={5}
              max={20}
              step={1}
            />
          </Section>

          <Section
            title="About the program"
            note="Typed in by hand for now — the Scorecard lookup comes later."
          >
            <Field
              label="School"
              hint="For your own reference; it does not change the math."
              type="text"
              placeholder="Cal Poly San Luis Obispo"
              value={fields.school}
              onChange={set("school")}
            />
            <Field
              label="Program"
              hint="For your own reference; it does not change the math."
              type="text"
              placeholder="MS Business Analytics"
              value={fields.program}
              onChange={set("program")}
            />
            <Select
              label="Credential level"
              hint="What you walk away with."
              value={fields.credential}
              onChange={set("credential")}
              options={CREDENTIALS}
            />
            <Field
              label="Program length"
              hint="Years. Fractions are fine — a 10-month program is 0.83."
              suffix="years"
              value={fields.L}
              onChange={set("L")}
              step={0.5}
            />
            <Field
              label="Tuition and fees"
              hint="The whole program, not per year."
              prefix="$"
              value={fields.T}
              onChange={set("T")}
              step={1000}
            />
            <Field
              label="Scholarships and grants"
              hint="Total across the program. Money you never pay back."
              prefix="$"
              value={fields.Sch}
              onChange={set("Sch")}
              step={1000}
            />
            <Field
              label="Part-time earnings while enrolled"
              hint="Pre-tax, per year, if you plan to keep working."
              prefix="$"
              value={fields.PT}
              onChange={set("PT")}
              step={1000}
            />
            <Field
              label="Extra living cost while enrolled"
              hint="Per year, and only what the program adds — relocation, say."
              prefix="$"
              value={fields.Living}
              onChange={set("Living")}
              step={1000}
            />
            <Field
              label="Job search after the program"
              hint="Months between finishing and the first paycheck."
              suffix="months"
              value={fields.gap}
              onChange={set("gap")}
              step={1}
            />
            <Field
              label="Starting salary after the program"
              hint="Pre-tax, per year. The number the whole answer hangs on."
              prefix="$"
              value={fields.S1}
              onChange={set("S1")}
              step={1000}
              action={
                medianSalary !== null && (
                  <button
                    type="button"
                    disabled={fields.S1 === medianSalary}
                    className="rounded-full border border-hairline px-2.5 py-0.5 text-xs text-accent hover:border-accent disabled:cursor-default disabled:border-hairline disabled:text-muted"
                    onClick={() => set("S1")(medianSalary)}
                  >
                    {fields.S1 === medianSalary
                      ? "Using BLS median"
                      : `Use BLS median (${formatDollars(Number(medianSalary))})`}
                  </button>
                )
              }
            />
            <Field
              label="Raise rate after the program"
              hint="Often a point above your current raise rate."
              suffix="%"
              value={fields.g_grad}
              onChange={set("g_grad")}
              step={0.5}
            />
          </Section>

          <Section
            title="Loans"
            note="Payments start the day the program ends; no grace period in v1."
          >
            <Field
              label="Amount borrowed"
              hint="Usually tuition minus scholarships, unless savings cover part."
              prefix="$"
              value={fields.B}
              onChange={set("B")}
              step={1000}
            />
            <Field
              label="Interest rate"
              hint="Per year, on the borrowed balance."
              suffix="%"
              value={fields.r}
              onChange={set("r")}
              step={0.5}
            />
            <Field
              label="Term"
              hint="Years to repay. Standard federal terms are 10."
              suffix="years"
              value={fields.N}
              onChange={set("N")}
              step={1}
            />
          </Section>
        </form>

        {/* ---------------------------------------------------------------- */}
        {/* Results (SPEC §5)                                                 */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          {issues.length > 0 || result === null ? (
            <Card>
              <h2 className="text-sm font-semibold text-ink">
                Check a couple of inputs
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-secondary">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Card>
          ) : (
            <>
              <Card>
                <p className="text-lg leading-relaxed text-ink">
                  {breakeven === null ? (
                    <>
                      No working years fall inside a {horizon}-year horizon, so
                      there is no breakeven salary to compute. Try a longer
                      horizon or a shorter program.
                    </>
                  ) : (
                    <>
                      This program pays off within {horizon} years if you earn at
                      least{" "}
                      <strong className="font-semibold text-accent">
                        {formatDollars(breakeven)}
                      </strong>{" "}
                      to start. You entered {formatDollars(inputs.S1)}.
                    </>
                  )}
                </p>
                <p className="mt-3 text-xs text-muted">
                  {selection && fields.S1 === medianSalary ? (
                    <>
                      The starting salary is the BLS OEWS state median for{" "}
                      {selection.title} in {selection.stateName}. Every other
                      number on this page is one you typed.
                    </>
                  ) : (
                    <>
                      Scorecard medians land here in a later version. For now
                      every number on this page is one you typed.
                    </>
                  )}
                </p>
              </Card>

              <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                  label="Payback year"
                  value={
                    result.paybackYear === null
                      ? "None"
                      : `Year ${result.paybackYear}`
                  }
                  note={
                    result.paybackYear === null
                      ? `Cumulative cash never catches up within ${horizon} years.`
                      : "First year the program pulls ahead in cumulative cash."
                  }
                />
                <Stat
                  label={`NPV over ${horizon} years`}
                  value={formatSignedDollars(result.npv)}
                  note={`Today’s dollars at a ${formatPercent(
                    num(fields.d),
                  )} discount rate.`}
                />
                <Stat
                  label="Breakeven starting salary"
                  value={breakeven === null ? "—" : formatDollars(breakeven)}
                  note={
                    breakevenGap === null
                      ? "Needs at least one working year in the horizon."
                      : breakevenGap >= 0
                        ? `${formatDollars(
                            breakevenGap,
                          )} below the salary you entered.`
                        : `${formatDollars(
                            -breakevenGap,
                          )} above the salary you entered.`
                  }
                />
              </div>

              {selection && breakeven !== null && (
                <NextMoves breakevenS1={breakeven} selection={selection} />
              )}

              <Card>
                <h2 className="text-sm font-semibold text-ink">
                  Cumulative cash difference
                </h2>
                <p className="mt-1 text-xs text-ink-secondary">
                  Program minus keeping your job, after tax, added up year by
                  year. Above the zero line, the program is ahead.
                </p>
                <div className="mt-4">
                  <CumulativeChart
                    years={result.years}
                    paybackYear={result.paybackYear}
                  />
                </div>

                <details className="mt-4 border-t border-hairline pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-ink-secondary">
                    Year-by-year table
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-right text-xs tabular-nums">
                      <thead className="text-muted">
                        <tr>
                          <th className="py-1 pr-3 text-left font-medium">
                            Year
                          </th>
                          <th className="py-1 pr-3 font-medium">Keep working</th>
                          <th className="py-1 pr-3 font-medium">Program</th>
                          <th className="py-1 pr-3 font-medium">Difference</th>
                          <th className="py-1 font-medium">Cumulative</th>
                        </tr>
                      </thead>
                      <tbody className="text-ink-secondary">
                        {result.years.map((y) => (
                          <tr key={y.k} className="border-t border-hairline">
                            <td className="py-1 pr-3 text-left">{y.k}</td>
                            <td className="py-1 pr-3">
                              {formatDollars(y.cfA)}
                            </td>
                            <td className="py-1 pr-3">
                              {formatDollars(y.cfB)}
                            </td>
                            <td className="py-1 pr-3">
                              {formatSignedDollars(y.diff)}
                            </td>
                            <td className="py-1">
                              {formatSignedDollars(y.cumDiff)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </Card>

              <Card>
                <h2 className="text-sm font-semibold text-ink">
                  What this assumes
                </h2>
                <ul className="mt-2 space-y-1 text-xs text-ink-secondary">
                  <li>
                    One flat {formatPercent(num(fields.t))} tax rate on all
                    income — no brackets, no state tax.
                  </li>
                  <li>
                    Loan payments of{" "}
                    {formatDollars(result.loanPayment)} a year start the moment
                    the program ends, and run {fields.N} years.
                  </li>
                  <li>
                    Out-of-pocket school cost of{" "}
                    {formatDollars(result.schoolCostPerYear)} per school-year;
                    borrowed money is excluded here because it comes back as the
                    loan payment.
                  </li>
                  <li>
                    The new salary starts at{" "}
                    {result.salaryStart.toFixed(2).replace(/\.00$/, "")} years
                    from today, and raises compound once a year.
                  </li>
                  <li>
                    Nothing here prices the non-financial value of the degree.
                  </li>
                </ul>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-surface p-5">
      {children}
    </section>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-xs text-muted">{note}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-secondary">{note}</p>
    </div>
  );
}

const fieldShell =
  "mt-1 flex items-center rounded-md border border-hairline bg-plane focus-within:border-accent focus-within:ring-1 focus-within:ring-accent";
const fieldInput =
  "w-full bg-transparent px-2.5 py-1.5 text-sm text-ink outline-none";

function Field({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  type = "number",
  placeholder,
  min,
  max,
  step,
  action,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  type?: "number" | "text";
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  /** A control shown under the field, outside the label so it keeps its own name. */
  action?: ReactNode;
}) {
  const field = (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className={fieldShell}>
        {prefix && <span className="pl-2.5 text-sm text-muted">{prefix}</span>}
        <input
          className={fieldInput}
          type={type}
          inputMode={type === "number" ? "decimal" : "text"}
          value={value}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="pr-2.5 text-sm text-muted">{suffix}</span>}
      </span>
      <span className="mt-1 block text-xs text-muted">{hint}</span>
    </label>
  );
  if (!action) return field;
  return (
    <div>
      {field}
      <div className="mt-1.5">{action}</div>
    </div>
  );
}

function Select({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className={fieldShell}>
        <select
          className={fieldInput}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </span>
      <span className="mt-1 block text-xs text-muted">{hint}</span>
    </label>
  );
}
