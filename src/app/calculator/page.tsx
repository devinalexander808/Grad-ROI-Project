"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import CumulativeChart from "../cumulative-chart";
import NextMoves, { midSentence } from "../next-moves";
import ProgramSearch, { ConfidenceBadge } from "../program-search";
import type { Confidence } from "@/lib/scorecard";
import type { ModelInputs } from "@/lib/model";
import {
  PESSIMISTIC_GAP_MONTHS,
  SCENARIOS,
  applyStudyOptions,
  cumulativeBand,
  runScenarios,
  type Scenario,
  type StudyOptions,
} from "@/lib/scenarios";
import {
  formatDollars,
  formatPercent,
  formatSignedDollars,
  latestAvailable,
} from "@/lib/format";
import {
  clearSelection,
  saveProgram,
  saveStudy,
  selectedWage,
  useProfile,
  useProgram,
  useSelection,
  useStudy,
  type ScorecardChoice,
  type Selection,
  type Study,
} from "@/lib/selection";

/**
 * The calculator, the "adjust assumptions" view behind the Start screen: the
 * five inputs the Start screen fills sit on top, every other input from SPEC.md
 * §4 folds away under "Adjust assumptions", and the §5 outputs are on the
 * right, recomputed on every keystroke.
 *
 * Build 4 adds the SPEC A2 scenarios (a pessimistic / base / optimistic toggle
 * with a band on the chart), part-time study and employer reimbursement; all
 * three are input transforms in `scenarios.ts`, so the model is unchanged.
 * Rates are held in percent units here and converted to decimals at the model
 * boundary; the model itself never rounds.
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
  /** "full" or "part". */
  studyMode: string;
  /** Part-time program length; follows 2 × L until edited. */
  L_part: string;
  /** Pay kept while studying part-time; follows S0 until edited. */
  PT_part: string;
  /** Employer tuition reimbursement per school-year. */
  R: string;
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
  studyMode: "full",
  L_part: "4",
  PT_part: "60000",
  R: "0",
};

/** Part-time programs usually take about twice as long. */
const PART_TIME_STRETCH = 2;

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

/** A typed number for saving: null when the box is empty or not a number. */
function numOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The calculator fields saved in the study store. */
type StudyField = "studyMode" | "L_part" | "PT_part" | "R";

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

function toStudyOptions(f: Fields): StudyOptions {
  return {
    partTime: f.studyMode === "part",
    partTimeLength: num(f.L_part),
    payWhileStudying: num(f.PT_part),
    reimbursementPerYear: num(f.R),
  };
}

/** Input combinations the §5 formulas cannot express, caught before the model runs. */
function problems(inputs: ModelInputs, partTime: boolean): string[] {
  const found: string[] = [];
  if (!(inputs.L > 0)) {
    found.push(
      partTime
        ? "Part-time program length has to be more than 0 years."
        : "Program length has to be more than 0 years.",
    );
  }
  if (!(inputs.H >= 1)) {
    found.push("Horizon (under Adjust assumptions) has to be at least 1 year.");
  }
  if (inputs.B > 0 && !(inputs.r > 0)) {
    found.push(
      "Loan interest rate (under Adjust assumptions) has to be above 0% when you borrow — the payment formula divides by it.",
    );
  }
  if (inputs.B > 0 && !(inputs.N > 0)) {
    found.push("Loan term (under Adjust assumptions) has to be more than 0 years when you borrow.");
  }
  return found;
}

/** The URL never changes under this page, so there is nothing to subscribe to. */
function noSubscription(): () => void {
  return () => {};
}

/** Where a figure on screen came from, shown under its field. */
type Provenance = {
  confidence: Confidence | "Your input" | null;
  text: string;
};

const YOUR_INPUT: Provenance = { confidence: "Your input", text: "You entered this." };
const STARTING_NUMBER: Provenance = {
  confidence: null,
  text: "A starting number; replace it with your own if you have one.",
};

/** A Scorecard dollar figure as field text, rounded the way BLS medians are. */
function figureText(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(Math.round(value));
}

type Arrival = "job" | "start" | null;

/** Which page sent the user here: `?from=job` or `?from=start`. */
function arrivedFrom(): Arrival {
  const from = new URLSearchParams(window.location.search).get("from");
  return from === "job" || from === "start" ? from : null;
}

export default function CalculatorPage() {
  const [typed, setTyped] = useState<Fields>(DEFAULTS);
  /** Fields the user has edited here; a pre-fill never overwrites these. */
  const [touched, setTouched] = useState<Partial<Record<keyof Fields, true>>>(
    {},
  );

  // The job + place chosen on the Job page, if any (SPEC §4.1 → §4.2). The
  // wage is the metro median when a metro was picked, else the state median.
  const selection = useSelection();
  const wage = selection === null ? null : selectedWage(selection);
  const medianSalary = wage === null ? null : String(Math.round(wage.median));

  // Arriving from the Job page (?from=job) starts the salary after the
  // program at the BLS median. Arriving from the Start screen (?from=start)
  // also fills the current salary, program name, tuition and length from what
  // was typed there. Each pre-fill holds until the user edits that field here,
  // after which what they typed always wins; anything not pre-filled keeps
  // DEFAULTS.
  const from = useSyncExternalStore(noSubscription, arrivedFrom, () => null);
  const profile = useProfile();
  const program = useProgram();
  // How you'd study and pay, and the scenario, as saved last time (Build 4).
  const savedStudy = useStudy();

  // The College Scorecard program in play: one picked on this page wins, else
  // the one picked on the Start screen when the user came from there.
  const [pickedHere, setPickedHere] = useState<{
    choice: ScorecardChoice | undefined;
  } | null>(null);
  const scorecard =
    pickedHere !== null
      ? pickedHere.choice
      : from === "start"
        ? program?.scorecard
        : undefined;
  const scorecardS1 = figureText(scorecard?.firstYearEarnings.value);
  const scorecardB = figureText(scorecard?.typicalDebt.value);

  const prefill = useMemo(() => {
    const p: Partial<Fields> = {};
    if (from !== null && medianSalary !== null) p.S1 = medianSalary;
    if (from === "start") {
      if (profile?.salary != null) p.S0 = String(profile.salary);
      if (program?.name) p.program = program.name;
      if (program?.tuition != null) p.T = String(program.tuition);
      if (program?.years != null) p.L = String(program.years);
    }
    if (savedStudy !== null) {
      p.studyMode = savedStudy.studyMode;
      if (savedStudy.partTimeLength !== null) {
        p.L_part = String(savedStudy.partTimeLength);
      }
      if (savedStudy.payWhileStudying !== null) {
        p.PT_part = String(savedStudy.payWhileStudying);
      }
      if (savedStudy.reimbursementPerYear !== null) {
        p.R = String(savedStudy.reimbursementPerYear);
      }
    }
    // SPEC A3: Scorecard's first-year median is the default S1, ahead of the
    // BLS median (ladder level 4), and its typical debt the default B.
    if (scorecard !== undefined) {
      if (pickedHere !== null) {
        p.program = `${scorecard.title}, ${scorecard.credentialTitle}`;
        p.school = scorecard.schoolName;
      }
      if (scorecardS1 !== null) p.S1 = scorecardS1;
      if (scorecardB !== null) p.B = scorecardB;
    }
    return p;
  }, [
    from,
    medianSalary,
    profile,
    program,
    scorecard,
    pickedHere,
    scorecardS1,
    scorecardB,
    savedStudy,
  ]);
  const fields = useMemo(() => {
    const out = { ...typed };
    for (const key of Object.keys(prefill) as (keyof Fields)[]) {
      if (!touched[key]) out[key] = prefill[key] as string;
    }
    // Part-time length and pay follow the full-time ones until edited here
    // or saved from an earlier visit.
    if (!touched.L_part && prefill.L_part === undefined) {
      out.L_part = String(num(out.L) * PART_TIME_STRETCH);
    }
    if (!touched.PT_part && prefill.PT_part === undefined) {
      out.PT_part = out.S0;
    }
    // When the Start screen supplies tuition and Scorecard has no typical debt,
    // the amount borrowed starts at SPEC Appendix A's default, max(T − Sch, 0),
    // from the tuition and scholarships showing here.
    if (
      from === "start" &&
      program?.tuition != null &&
      scorecardB === null &&
      !touched.B
    ) {
      out.B = String(Math.max(num(out.T) - num(out.Sch), 0));
    }
    return out;
  }, [typed, prefill, touched, from, program, scorecardB]);

  const set = (key: keyof Fields) => (value: string) => {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
    setTyped((prev) => ({ ...prev, [key]: value }));
  };

  // Clearing the selection must not quietly swap the salary back to the
  // default, so pin whatever is showing first.
  const clear = () => {
    set("S1")(fields.S1);
    clearSelection();
  };

  // Where each pre-fillable figure came from, judged by the value showing, so
  // a "Use … median" press or a typed number that matches reads correctly.
  const provenance: Partial<Record<keyof Fields, Provenance>> = {};
  if (scorecard && scorecardS1 !== null && fields.S1 === scorecardS1) {
    provenance.S1 = {
      confidence: scorecard.firstYearEarnings.confidence,
      text: `${scorecard.source}, ${scorecard.asOf}. ${scorecard.firstYearEarnings.note}`,
    };
  } else if (selection && wage && fields.S1 === medianSalary) {
    provenance.S1 = {
      confidence: "Low",
      text: `BLS OEWS, ${latestAvailable(selection.year)}: ${wage.level} median for ${midSentence(selection.title)} in ${wage.place}. That is typical pay for everyone in the job, not this program’s graduates.`,
    };
  } else {
    provenance.S1 = touched.S1 ? YOUR_INPUT : STARTING_NUMBER;
  }

  if (scorecard && scorecardB !== null && fields.B === scorecardB) {
    provenance.B = {
      confidence: scorecard.typicalDebt.confidence,
      text: `${scorecard.source}, ${scorecard.asOf}. ${scorecard.typicalDebt.note}`,
    };
  } else if (touched.B) {
    provenance.B = YOUR_INPUT;
  } else if (from === "start" && program?.tuition != null) {
    provenance.B = {
      confidence: null,
      text: "Tuition minus scholarships, assuming you borrow the rest.",
    };
  } else {
    provenance.B = STARTING_NUMBER;
  }

  const startTuition =
    from === "start" && program?.tuition != null
      ? String(program.tuition)
      : null;
  provenance.T =
    touched.T || (startTuition !== null && fields.T === startTuition)
      ? YOUR_INPUT
      : scorecard
        ? {
            confidence: null,
            text: "A starting number: College Scorecard doesn’t report graduate tuition, so use the program’s published cost.",
          }
        : STARTING_NUMBER;

  const startSalary =
    from === "start" && profile?.salary != null ? String(profile.salary) : null;
  provenance.S0 =
    touched.S0 || (startSalary !== null && fields.S0 === startSalary)
      ? YOUR_INPUT
      : STARTING_NUMBER;

  // A pick here is saved to the program store too, so the Start screen shows
  // the same choice. Tuition and length are kept as they were; the name is
  // filled only when there isn't one, as on the Start screen.
  const chooseScorecard = (choice: ScorecardChoice | undefined) => {
    setPickedHere({ choice });
    const name = program?.name ?? "";
    saveProgram({
      name:
        choice !== undefined && name.trim() === ""
          ? `${choice.title}, ${choice.schoolName}`
          : name,
      tuition: program?.tuition ?? null,
      years: program?.years ?? null,
      ...(choice === undefined ? {} : { scorecard: choice }),
    });
  };

  // A scenario picked here wins; else the saved one. Local state as well as
  // the store, so the toggle still works where storage is blocked.
  const [scenarioHere, setScenarioHere] = useState<Scenario | null>(null);
  const scenario = scenarioHere ?? savedStudy?.scenario ?? "base";

  /**
   * The study store as it should be after a change. Part-time length and pay
   * are saved only once edited, so until then they keep following the
   * full-time length and the current salary.
   */
  const studyToSave = (next: Fields, nextScenario: Scenario, changed?: StudyField): Study => {
    const edited = (key: "L_part" | "PT_part", saved: number | null) =>
      key === changed || touched[key] === true || saved !== null;
    return {
      studyMode: next.studyMode === "part" ? "part" : "full",
      partTimeLength: edited("L_part", savedStudy?.partTimeLength ?? null)
        ? numOrNull(next.L_part)
        : null,
      payWhileStudying: edited("PT_part", savedStudy?.payWhileStudying ?? null)
        ? numOrNull(next.PT_part)
        : null,
      reimbursementPerYear: numOrNull(next.R),
      scenario: nextScenario,
    };
  };
  const setStudy = (key: StudyField) => (value: string) => {
    set(key)(value);
    saveStudy(studyToSave({ ...fields, [key]: value }, scenario, key));
  };
  const setScenario = (next: Scenario) => {
    setScenarioHere(next);
    saveStudy(studyToSave(fields, next));
  };
  const partTime = fields.studyMode === "part";
  // Full-time inputs, then part-time study and reimbursement, then the three
  // scenarios on top.
  const adjusted = useMemo(
    () => applyStudyOptions(toModelInputs(fields), toStudyOptions(fields)),
    [fields],
  );
  const entered = adjusted.inputs;
  const issues = useMemo(() => problems(entered, partTime), [entered, partTime]);
  const scenarios = useMemo(
    () => (issues.length === 0 ? runScenarios(entered) : null),
    [entered, issues],
  );
  const band = useMemo(
    () => (scenarios === null ? undefined : cumulativeBand(scenarios)),
    [scenarios],
  );
  const result = scenarios?.[scenario].result ?? null;
  const inputs = scenarios?.[scenario].inputs ?? entered;

  const horizon = inputs.H;
  const breakeven = result?.breakevenS1 ?? null;
  const breakevenGap = breakeven === null ? null : inputs.S1 - breakeven;
  const salaryWord =
    scenario === "base" ? "the salary you entered" : "this scenario’s salary";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          ROI calculator
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Whether a specific graduate program pays off for you, against the
          alternative of staying in your job. Every figure below is yours to
          change, and every figure is after tax.
        </p>
      </header>

      {selection && wage && (
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-hairline bg-surface px-4 py-2 text-sm text-ink-secondary">
          <span>
            Planning for:{" "}
            <span className="font-medium text-ink">
              {selection.title} in {wage.place}
            </span>{" "}
            — BLS median {formatDollars(wage.median)} (
            {latestAvailable(selection.year)})
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
            title="Find your program"
            note="Pick a school and program to fill in what its graduates earn and borrow."
            wide
          >
            <ProgramSearch value={scorecard} onChange={chooseScorecard} />
            {scorecard && (scorecardS1 !== null || scorecardB !== null) && (
              <p className="text-xs text-muted">
                {scorecardS1 !== null && "First-year pay fills Starting salary. "}
                {scorecardB !== null &&
                  "Typical debt fills Amount borrowed, under Adjust assumptions. "}
                A number you’ve typed yourself is never replaced.
              </p>
            )}
          </Section>

          <Section
            title="From your start screen"
            note={
              from === "start" ? (
                <>
                  Carried over from the{" "}
                  <Link href="/" className="text-accent hover:underline">
                    Start screen
                  </Link>
                  . Change them here or go back.
                </>
              ) : (
                <>
                  Fill these in on the{" "}
                  <Link href="/" className="text-accent hover:underline">
                    Start screen
                  </Link>
                  , or type them here.
                </>
              )
            }
          >
            <Field
              label="Current salary"
              hint="Pre-tax, per year, from the job you have or have been offered."
              prefix="$"
              value={fields.S0}
              onChange={set("S0")}
              step={1000}
              source={provenance.S0}
            />
            <Field
              label="Program"
              hint="For your own reference; it does not change the math."
              type="text"
              placeholder="MS Business Analytics"
              value={fields.program}
              onChange={set("program")}
            />
            <Field
              label="Tuition and fees"
              hint="The whole program, not per year."
              prefix="$"
              value={fields.T}
              onChange={set("T")}
              step={1000}
              source={provenance.T}
            />
            <Field
              label="Program length"
              hint="Years, and fractions are fine: a 10-month program is 0.83."
              suffix="years"
              value={fields.L}
              onChange={set("L")}
              step={0.5}
            />
            <Field
              label="Starting salary after the program"
              hint="Pre-tax, per year, and the number the whole answer hangs on."
              prefix="$"
              value={fields.S1}
              onChange={set("S1")}
              step={1000}
              source={provenance.S1}
              action={
                (scorecardS1 !== null || medianSalary !== null) && (
                  <span className="flex flex-wrap gap-1.5">
                    {scorecardS1 !== null && (
                      <UseButton
                        active={fields.S1 === scorecardS1}
                        activeLabel="Using Scorecard median"
                        label={`Use Scorecard median (${formatDollars(Number(scorecardS1))})`}
                        onClick={() => set("S1")(scorecardS1)}
                      />
                    )}
                    {medianSalary !== null && (
                      <UseButton
                        active={fields.S1 === medianSalary}
                        activeLabel="Using BLS median"
                        label={`Use BLS median (${formatDollars(Number(medianSalary))})`}
                        onClick={() => set("S1")(medianSalary)}
                      />
                    )}
                  </span>
                )
              }
            />
          </Section>

          <Section
            title="How you’ll study and pay"
            note="Part-time keeps a paycheck but takes longer. Employer help cuts what you pay."
          >
            <div className="sm:col-span-2">
              <span className="block text-sm font-medium text-ink">Study</span>
              <Toggle
                label="Study"
                value={fields.studyMode}
                onChange={setStudy("studyMode")}
                options={[
                  { value: "full", label: "Full-time" },
                  { value: "part", label: "Part-time" },
                ]}
              />
              <span className="mt-1 block text-xs text-muted">
                {partTime
                  ? "You keep working while you study, and the program runs longer."
                  : "You leave your job for the length of the program."}
              </span>
            </div>
            {partTime && (
              <>
                <Field
                  label="Part-time program length"
                  hint={`Years. Starts at ${PART_TIME_STRETCH}× the full-time length.`}
                  suffix="years"
                  value={fields.L_part}
                  onChange={setStudy("L_part")}
                  step={0.5}
                />
                <Field
                  label="Pay you keep while studying"
                  hint="Pre-tax, per year. Starts at your current salary; held flat, with no raises, until you finish."
                  prefix="$"
                  value={fields.PT_part}
                  onChange={setStudy("PT_part")}
                  step={1000}
                />
              </>
            )}
            <Field
              label="Tuition reimbursement"
              hint="From your employer, per year while enrolled. Usually only if you stay in the job, so it pairs with part-time. Treated as tax-free; above $5,250 a year it usually isn’t."
              prefix="$"
              value={fields.R}
              onChange={setStudy("R")}
              step={250}
            />
          </Section>

          <details className="group rounded-xl border border-hairline bg-surface">
            <summary className="cursor-pointer list-none p-5 text-sm font-semibold text-ink">
              <span className="mr-1.5 inline-block text-muted transition-transform group-open:rotate-90">
                ›
              </span>
              Adjust assumptions
              <span className="mt-1 block text-xs font-normal text-muted">
                Raises, taxes, loans and the rest. Each starts at a typical
                value you can change.
              </span>
            </summary>
            <div className="flex flex-col gap-6 border-t border-hairline p-5">
              <Group title="About you">
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
                  hint="How many years ahead to compare, from 5 to 20."
                  suffix="years"
                  value={fields.H}
                  onChange={set("H")}
                  min={5}
                  max={20}
                  step={1}
                />
              </Group>

              <Group title="About the program">
                <Field
                  label="School"
                  hint="For your own reference; it does not change the math."
                  type="text"
                  placeholder="Cal Poly San Luis Obispo"
                  value={fields.school}
                  onChange={set("school")}
                />
                <Select
                  label="Credential level"
                  hint="What you walk away with."
                  value={fields.credential}
                  onChange={set("credential")}
                  options={CREDENTIALS}
                />
                <Field
                  label="Scholarships and grants"
                  hint="Total across the program, and money you never pay back."
                  prefix="$"
                  value={fields.Sch}
                  onChange={set("Sch")}
                  step={1000}
                />
                <Field
                  label="Part-time earnings while enrolled"
                  hint={
                    partTime
                      ? "Not used while Part-time is on; set Pay you keep while studying instead."
                      : "Pre-tax, per year, if you plan to keep working."
                  }
                  prefix="$"
                  value={fields.PT}
                  onChange={set("PT")}
                  step={1000}
                />
                <Field
                  label="Extra living cost while enrolled"
                  hint="Per year, and only what the program adds, such as moving."
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
                  label="Raise rate after the program"
                  hint="Often a point above your current raise rate."
                  suffix="%"
                  value={fields.g_grad}
                  onChange={set("g_grad")}
                  step={0.5}
                />
              </Group>

              <Group
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
                  source={provenance.B}
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
                  hint="Years to repay; the standard federal term is 10."
                  suffix="years"
                  value={fields.N}
                  onChange={set("N")}
                  step={1}
                />
              </Group>
            </div>
          </details>
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-ink">Scenario</h2>
                  <Toggle
                    label="Scenario"
                    value={scenario}
                    onChange={(next) => setScenario(next as Scenario)}
                    options={SCENARIOS.map((s) => ({
                      value: s,
                      label: SCENARIO_LABEL[s],
                    }))}
                  />
                </div>
                <p className="mt-2 text-xs text-ink-secondary">
                  {scenarioAssumptions(scenario, entered)}
                </p>
              </Card>

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
                      to start.{" "}
                      {scenario === "base"
                        ? `You entered ${formatDollars(inputs.S1)}.`
                        : `This scenario assumes ${formatDollars(inputs.S1)}.`}
                    </>
                  )}
                </p>
                <ThreeNumbers
                  scorecard={scorecard}
                  selection={selection}
                  breakeven={breakeven}
                />
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
                      : "First year the program pulls ahead in cumulative cash and stays ahead."
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
                          )} below ${salaryWord}.`
                        : `${formatDollars(
                            -breakevenGap,
                          )} above ${salaryWord}.`
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
                  year. Above the zero line, the program is ahead. The line is
                  the {SCENARIO_LABEL[scenario].toLowerCase()} scenario; the
                  shaded band runs from pessimistic to optimistic.
                </p>
                <div className="mt-4">
                  <CumulativeChart
                    years={result.years}
                    paybackYear={result.paybackYear}
                    band={band}
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
                    Loan payments of{" "}
                    {formatDollars(result.loanPayment)} a year start the moment
                    the program ends, and run {fields.N} years.
                  </li>
                  <li>
                    {result.schoolCostPerYear >= 0 ? (
                      <>
                        Out-of-pocket school cost of{" "}
                        {formatDollars(result.schoolCostPerYear)} per
                        school-year
                      </>
                    ) : (
                      <>
                        Pay while studying more than covers school costs: you
                        net {formatDollars(-result.schoolCostPerYear)} per
                        school-year after tax
                      </>
                    )}
                    ; borrowed money is excluded here because it comes back as
                    the loan payment.
                  </li>
                  {partTime && (
                    <li>
                      Part-time study over {formatYears(inputs.L)} years,
                      keeping {formatDollars(inputs.PT)} a year in pay (before
                      tax, no raises) until you finish.
                    </li>
                  )}
                  {adjusted.reimbursementTotal > 0 && (
                    <li>
                      Your employer covers{" "}
                      {formatDollars(adjusted.reimbursementTotal)} of tuition in
                      all, counted like a scholarship.
                      {adjusted.borrowingCappedAt !== null &&
                        ` Borrowing is capped at the ${formatDollars(
                          adjusted.borrowingCappedAt,
                        )} left to pay.`}
                    </li>
                  )}
                  <li>
                    The new salary starts at{" "}
                    {formatYears(result.salaryStart)} years
                    from today, and raises compound once a year.
                  </li>
                </ul>
              </Card>
            </>
          )}

          <Card>
            <h2 className="text-sm font-semibold text-ink">Model limits</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-secondary">
              <li>
                One flat tax rate ({formatPercent(num(fields.t))}) on all
                income, with no brackets and no state tax.
              </li>
              <li>
                No adjustment for the chance you don’t land the job: it assumes
                you start at the salary above once your job search ends.
              </li>
              <li>
                No value placed on non-money reasons for the degree, like
                interest, status or the work itself.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Scenarios                                                                   */
/* -------------------------------------------------------------------------- */

const SCENARIO_LABEL: Record<Scenario, string> = {
  pessimistic: "Pessimistic",
  base: "Base",
  optimistic: "Optimistic",
};

/** "2", "0.83", "2.25": years without trailing zeros. */
function formatYears(years: number): string {
  return years.toFixed(2).replace(/\.?0+$/, "");
}

function search(gapMonths: number): string {
  return gapMonths === 0
    ? "no job search"
    : `a ${formatYears(gapMonths)}-month job search`;
}

/**
 * The selected scenario in one plain sentence (SPEC A2), with the figures it
 * actually uses, worked out from what was entered.
 */
function scenarioAssumptions(scenario: Scenario, entered: ModelInputs): string {
  const raise = (rate: number) => formatPercent(rate * 100);
  if (scenario === "base") {
    return `Your numbers as entered: ${formatDollars(entered.S1)} to start, ${search(
      entered.gap,
    )}, and ${raise(entered.g_grad)} raises after the program.`;
  }
  const s1 = (factor: number) =>
    entered.S0 + (entered.S1 - entered.S0) * factor;
  if (scenario === "pessimistic") {
    const gap = Math.max(entered.gap, PESSIMISTIC_GAP_MONTHS);
    const g = Math.min(entered.g_grad, entered.g_work);
    return `Things go worse: the raise over your current pay is half what you entered (${formatDollars(
      Math.min(s1(0.5), s1(1.25)),
    )} to start), ${search(gap)}, and raises after the program no better than your current ${raise(
      g,
    )}.`;
  }
  return `Things go better: the raise over your current pay is a quarter bigger (${formatDollars(
    Math.max(s1(0.5), s1(1.25)),
  )} to start), no job search, and ${raise(entered.g_grad)} raises after the program.`;
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

/** A row of buttons that picks one value, like a radio group. */
function Toggle({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="mt-1 inline-flex rounded-md border border-hairline bg-plane p-0.5"
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={`rounded px-3 py-1 text-sm ${
              on
                ? "bg-accent font-medium text-white"
                : "text-ink-secondary hover:text-ink"
            }`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

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
  wide = false,
  children,
}: {
  title: string;
  note: ReactNode;
  /** One column, for content that lays itself out. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-xs text-muted">{note}</p>
      <div className={`mt-4 grid gap-4 ${wide ? "" : "sm:grid-cols-2"}`}>
        {children}
      </div>
    </Card>
  );
}

function UseButton({
  active,
  label,
  activeLabel,
  onClick,
}: {
  active: boolean;
  label: string;
  activeLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={active}
      className="rounded-full border border-hairline px-2.5 py-0.5 text-xs text-accent hover:border-accent disabled:cursor-default disabled:border-hairline disabled:text-muted"
      onClick={onClick}
    >
      {active ? activeLabel : label}
    </button>
  );
}

/**
 * The Build 3 results sentence: what this program's graduates start at, what
 * BLS says the job typically pays, and the breakeven. A missing number is
 * said plainly, never guessed.
 */
function ThreeNumbers({
  scorecard,
  selection,
  breakeven,
}: {
  scorecard: ScorecardChoice | undefined;
  selection: Selection | null;
  breakeven: number | null;
}) {
  const wage = selection === null ? null : selectedWage(selection);
  const grads = scorecard?.firstYearEarnings;
  const sources = [
    scorecard &&
      grads?.value != null &&
      `Graduates: ${scorecard.source}, ${scorecard.asOf}${
        grads.confidence ? ` (${grads.confidence.toLowerCase()} confidence)` : ""
      }`,
    selection &&
      wage &&
      `Typical pay: BLS OEWS ${wage.level} median, ${latestAvailable(selection.year)}`,
    breakeven !== null && "Breakeven: your inputs",
  ].filter(Boolean);

  return (
    <div className="mt-4 border-t border-hairline pt-3 text-sm leading-relaxed text-ink-secondary">
      <p>
        {scorecard === undefined ? (
          <>Pick a program to see what its graduates earn. </>
        ) : grads?.value != null ? (
          <>
            Graduates of this program start at about{" "}
            <strong className="font-semibold text-ink">
              {formatDollars(grads.value)}
            </strong>
            .{" "}
          </>
        ) : (
          <>No first-year pay data for this program. </>
        )}
        {selection !== null && wage !== null ? (
          <>
            BLS says the typical {midSentence(selection.title)} in {wage.place}{" "}
            earns{" "}
            <strong className="font-semibold text-ink">
              {formatDollars(wage.median)}
            </strong>
            .{" "}
          </>
        ) : (
          <>Choose a job on the Start screen to compare with typical pay. </>
        )}
        {breakeven !== null && (
          <>
            You break even if you start at{" "}
            <strong className="font-semibold text-ink">
              {formatDollars(breakeven)}
            </strong>{" "}
            or more.
          </>
        )}
      </p>
      {sources.length > 0 && (
        <p className="mt-1 text-xs text-muted">{sources.join(" · ")}.</p>
      )}
    </div>
  );
}

/** A titled block of inputs inside "Adjust assumptions". */
function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
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
  source,
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
  /** Where the value showing came from. */
  source?: Provenance;
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
      {source && (
        <span className="mt-1 block text-xs text-ink-secondary">
          <ConfidenceBadge confidence={source.confidence} /> {source.text}
        </span>
      )}
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
