"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { formatDollars } from "@/lib/format";
import {
  DEGREES,
  readProfile,
  readProgram,
  readSelection,
  saveProfile,
  saveProgram,
  type Degree,
  type Profile,
  type Program,
  type ScorecardChoice,
} from "@/lib/selection";
import OccupationPicker, {
  DEFAULT_CHOICE,
  useOccupationLookup,
  type JobChoice,
  type Load,
} from "./occupation-picker";
import ProgramSearch from "./program-search";

/**
 * The Start screen: three short steps instead of the calculator's 19 inputs.
 * Everything typed here is saved as it changes (see `selection.ts`), and "See
 * if it pays off" opens the calculator pre-filled from it.
 */

const MAX_EXPERIENCE = 40;

/** Nothing to subscribe to: this only tells server render from client render. */
function noSubscription(): () => void {
  return () => {};
}

export default function StartPage() {
  // The form starts from what was saved last time, which only the browser
  // knows, so it mounts after hydration rather than flashing defaults.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Does a degree pay off for you?
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Three quick steps: where you are now, the job you want, and the
          program you’re considering. We’ll fill in the rest with sensible
          starting numbers you can change later.
        </p>
      </header>
      {hydrated ? (
        <StartForm />
      ) : (
        <p className="text-sm text-ink-secondary">Loading…</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The form                                                                    */
/* -------------------------------------------------------------------------- */

type ProfileFields = { salary: string; experience: string; degree: string };
type ProgramFields = { name: string; tuition: string; years: string };

function StartForm() {
  const [profile, setProfile] = useState<ProfileFields>(() =>
    toProfileFields(readProfile()),
  );
  const [program, setProgram] = useState<ProgramFields>(() =>
    toProgramFields(readProgram()),
  );
  const [scorecard, setScorecard] = useState<ScorecardChoice | undefined>(
    () => readProgram()?.scorecard,
  );
  const [choice, setChoice] = useState<JobChoice>(() => {
    const saved = readSelection();
    return saved === null
      ? DEFAULT_CHOICE
      : {
          soc: saved.soc,
          stateFips: saved.stateFips,
          metroCode: saved.metroCode ?? null,
        };
  });
  // Asks BLS and saves the choice for the calculator, as the Job page does.
  const load = useOccupationLookup(choice);

  const updateProfile = (key: keyof ProfileFields) => (value: string) => {
    const next = { ...profile, [key]: value };
    setProfile(next);
    saveProfile(fromProfileFields(next));
  };
  const updateProgram = (key: keyof ProgramFields) => (value: string) => {
    const next = { ...program, [key]: value };
    setProgram(next);
    saveProgram(fromProgramFields(next, scorecard));
  };
  // Picking a Scorecard program names it if the user hasn't. Tuition and
  // length stay as typed: Scorecard reports neither for graduate programs.
  const chooseScorecard = (next: ScorecardChoice | undefined) => {
    const fields =
      next !== undefined && program.name.trim() === ""
        ? { ...program, name: `${next.title}, ${next.schoolName}` }
        : program;
    setProgram(fields);
    setScorecard(next);
    saveProgram(fromProgramFields(fields, next));
  };

  const salary = positive(profile.salary);
  const experienceOutOfRange =
    profile.experience.trim() !== "" &&
    fromProfileFields(profile).experienceYears === null;
  const ready = salary !== null && load.state !== "loading";

  return (
    <div className="flex flex-col gap-6">
      <Step number={1} title="Where are you now">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Current salary"
            hint="Pre-tax, per year. Required."
            prefix="$"
            value={profile.salary}
            onChange={updateProfile("salary")}
            step={1000}
          />
          <Field
            label="Years of work experience"
            hint={
              experienceOutOfRange
                ? `Enter a number from 0 to ${MAX_EXPERIENCE}.`
                : `0 to ${MAX_EXPERIENCE}.`
            }
            suffix="years"
            value={profile.experience}
            onChange={updateProfile("experience")}
            min={0}
            max={MAX_EXPERIENCE}
            step={1}
          />
          <label className="block">
            <span className="text-sm font-medium text-ink">Highest degree</span>
            <span className={fieldShell}>
              <select
                className={fieldInput}
                value={profile.degree}
                onChange={(e) => updateProfile("degree")(e.target.value)}
              >
                <option value="">Choose one</option>
                {DEGREES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </span>
            <span className="mt-1 block text-xs text-muted">
              The one you have now.
            </span>
          </label>
        </div>
      </Step>

      <Step number={2} title="What job do you want">
        <OccupationPicker value={choice} onChange={setChoice} />
        <div className="mt-4 rounded-md bg-plane px-3 py-2 text-sm text-ink-secondary">
          <MedianLine load={load} choice={choice} />
        </div>
      </Step>

      <Step number={3} title="What program are you considering">
        <ProgramSearch value={scorecard} onChange={chooseScorecard} />
        <p className="mt-4 mb-3 text-xs text-muted">
          {scorecard === undefined
            ? "Can’t find it? Type the details in yourself."
            : "Scorecard doesn’t report graduate tuition or program length, so add them here."}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Program name"
            hint="For your own reference."
            type="text"
            placeholder="MS Business Analytics"
            value={program.name}
            onChange={updateProgram("name")}
          />
          <Field
            label="Total tuition and fees"
            hint="The whole program, not per year."
            prefix="$"
            value={program.tuition}
            onChange={updateProgram("tuition")}
            step={1000}
          />
          <Field
            label="Program length"
            hint="Years. A 10-month program is 0.83."
            suffix="years"
            value={program.years}
            onChange={updateProgram("years")}
            step={0.5}
          />
        </div>
      </Step>

      <div className="flex flex-wrap items-center gap-3">
        {ready ? (
          <Link
            href="/calculator?from=start"
            className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            See if it pays off
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-white opacity-40"
          >
            See if it pays off
          </span>
        )}
        <span className="text-xs text-muted">
          {salary === null
            ? "Enter your current salary first."
            : load.state === "loading"
              ? "Waiting for BLS pay figures…"
              : "Anything you left blank uses a starting number you can change."}
        </span>
      </div>
    </div>
  );
}

/** Step 2's inline answer: the BLS median the calculator will start from. */
function MedianLine({ load, choice }: { load: Load; choice: JobChoice }) {
  if (load.state === "loading") return <>Asking BLS…</>;
  if (load.state === "error") {
    return (
      <>
        No BLS figure right now: {load.message} The calculator will use its own
        starting salary instead.
      </>
    );
  }

  const { data } = load;
  const title = data.occupation?.title ?? "this job";
  const stateName = data.state.name ?? "your state";
  const stateMedian = data.state.medianAnnualWage;
  const metroMedian = data.metro.medianAnnualWage;
  const useMetro = choice.metroCode !== null && metroMedian.value !== null;
  const figure = useMetro ? metroMedian : stateMedian;
  const place = useMetro ? (data.metro.name ?? "your metro area") : stateName;

  if (figure.value === null) {
    return (
      <>
        BLS publishes no median pay for {title} in {stateName}, so the
        calculator will use its own starting salary instead.
      </>
    );
  }

  const year = figure.year ?? data.asOfYear;
  return (
    <>
      Typical pay for {title} in {place}:{" "}
      <strong className="font-semibold text-ink">
        {formatDollars(figure.value)}
      </strong>{" "}
      a year.{" "}
      <span className="text-xs text-muted">
        BLS OEWS {useMetro ? "metro area" : "state"} median
        {year === null ? "" : `, ${year}`}.
        {choice.metroCode !== null && !useMetro
          ? " No figure published for that metro area, so this is the state median."
          : ""}
      </span>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Converting between typed text and saved values                              */
/* -------------------------------------------------------------------------- */

/** A typed number, or null when the box is empty or not a number. */
function amount(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function positive(text: string): number | null {
  const value = amount(text);
  return value !== null && value > 0 ? value : null;
}

function isDegree(value: string): value is Degree {
  return DEGREES.some((d) => d.value === value);
}

function fromProfileFields(f: ProfileFields): Profile {
  const experience = amount(f.experience);
  return {
    salary: positive(f.salary),
    experienceYears:
      experience !== null && experience >= 0 && experience <= MAX_EXPERIENCE
        ? experience
        : null,
    degree: isDegree(f.degree) ? f.degree : null,
  };
}

function toProfileFields(p: Profile | null): ProfileFields {
  return {
    salary: p?.salary == null ? "" : String(p.salary),
    experience: p?.experienceYears == null ? "" : String(p.experienceYears),
    degree: p?.degree ?? "",
  };
}

function fromProgramFields(
  f: ProgramFields,
  scorecard: ScorecardChoice | undefined,
): Program {
  const tuition = amount(f.tuition);
  return {
    name: f.name.trim(),
    tuition: tuition !== null && tuition >= 0 ? tuition : null,
    years: positive(f.years),
    ...(scorecard === undefined ? {} : { scorecard }),
  };
}

function toProgramFields(p: Program | null): ProgramFields {
  return {
    name: p?.name ?? "",
    tuition: p?.tuition == null ? "" : String(p.tuition),
    years: p?.years == null ? "" : String(p.years),
  };
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-white">
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
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
}) {
  return (
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
}
