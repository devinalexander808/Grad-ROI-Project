"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_STATE_FIPS,
  STATES,
  type AreaFigures,
  type Observation,
  type OccupationApiPayload,
} from "@/lib/bls";
import {
  OCCUPATIONS,
  searchOccupations,
  type Occupation,
} from "@/lib/occupations";
import { formatCount, formatDollars } from "@/lib/format";
import { saveSelection } from "@/lib/selection";

/**
 * SPEC.md §4.1, "The job right now" — the employment and pay half of it, live
 * from BLS OEWS. Projected growth, entry education and the Adzuna postings count
 * are weeks 7 and later (§8); nothing here pretends to have them.
 *
 * §6 rules honoured here: six numbers on the card and no more, every figure
 * carries its source and as-of year, and a series with no data says so instead
 * of showing a zero.
 */

const DEFAULT_SOC = "132051"; // Financial analyst — the occupation verified in §10.

type Load =
  | { state: "loading" }
  | { state: "ready"; data: OccupationApiPayload }
  | { state: "error"; message: string };

/** Identifies the request the answer in state belongs to. */
type Answered = (Load & { state: "ready" | "error" }) & { key: string };

export default function JobPage() {
  const [soc, setSoc] = useState(DEFAULT_SOC);
  const [stateFips, setStateFips] = useState(DEFAULT_STATE_FIPS);
  const [answer, setAnswer] = useState<Answered | null>(null);

  const key = `${soc}|${stateFips}`;

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/occupation/${soc}?state=${stateFips}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        // Read text first. A crashed or timed-out serverless function answers
        // with an empty body or an HTML error page, and calling .json() on that
        // throws "Unexpected end of JSON input" — which tells the user nothing
        // about what actually went wrong.
        const raw = await response.text();

        let body: OccupationApiPayload | { error?: string };
        try {
          body = JSON.parse(raw) as OccupationApiPayload | { error?: string };
        } catch {
          throw new Error(
            `The server replied with ${response.status} ${response.statusText} ` +
              `and a body that is not JSON: ${firstLine(raw)}`,
          );
        }

        if (!response.ok) {
          const message =
            "error" in body && body.error
              ? body.error
              : `Request failed (${response.status} ${response.statusText}).`;
          throw new Error(message);
        }

        const data = body as OccupationApiPayload;
        setAnswer({ key: `${soc}|${stateFips}`, state: "ready", data });

        // Hand the choice to the ROI calculator. Without a state median there
        // is nothing to carry, and the calculator never shows a made-up one.
        const stateMedian = data.state.medianAnnualWage.value;
        if (stateMedian !== null) {
          saveSelection({
            soc: data.soc,
            title: data.occupation?.title ?? `SOC ${withHyphen(data.soc)}`,
            stateFips: data.state.fips,
            stateName: data.state.name ?? `state ${data.state.fips}`,
            stateMedian,
            year: data.state.medianAnnualWage.year ?? data.asOfYear,
          });
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setAnswer({
          key: `${soc}|${stateFips}`,
          state: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      });

    return () => controller.abort();
  }, [soc, stateFips]);

  // Loading is derived, not stored: anything other than an answer for the
  // current selection means the fetch is still out.
  const load: Load = answer?.key === key ? answer : { state: "loading" };

  const selected = useMemo(
    () => OCCUPATIONS.find((o) => o.soc === soc) ?? null,
    [soc],
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          The job right now
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          How many people do this job and what it pays — nationally, in your
          state, and in your metro. Straight from the federal wage survey, with
          the year it was collected on every figure.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <OccupationPicker soc={soc} onSelect={setSoc} />
        <label className="block">
          <span className="text-sm font-medium text-ink">Your state</span>
          <span className={fieldShell}>
            <select
              className={fieldInput}
              value={stateFips}
              onChange={(e) => setStateFips(e.target.value)}
            >
              {STATES.map((s) => (
                <option key={s.fips} value={s.fips}>
                  {s.name}
                </option>
              ))}
            </select>
          </span>
          <span className="mt-1 block text-xs text-muted">
            Metro stays at San Luis Obispo for now; a metro picker comes next.
          </span>
        </label>
      </div>

      {selected && (
        <p className="mt-4 text-sm text-ink-secondary">
          {selected.description}{" "}
          <span className="text-muted">SOC {withHyphen(selected.soc)}</span>
        </p>
      )}

      <div className="mt-6">
        {load.state === "loading" && (
          <Card>
            <p className="text-sm text-ink-secondary">Asking BLS…</p>
          </Card>
        )}

        {load.state === "error" && (
          <Card>
            <h2 className="text-sm font-semibold text-ink">
              No data to show right now
            </h2>
            <p className="mt-2 text-sm text-ink-secondary">{load.message}</p>
            <p className="mt-2 text-xs text-muted">
              BLS caps unregistered use at 25 queries a day. Setting a free
              BLS_API_KEY raises that to 500.
            </p>
          </Card>
        )}

        {load.state === "ready" && <Snapshot data={load.data} />}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The card                                                                    */
/* -------------------------------------------------------------------------- */

function Snapshot({ data }: { data: OccupationApiPayload }) {
  const title = data.occupation?.title ?? `SOC ${withHyphen(data.soc)}`;
  const stateLabel = data.state.name ?? `state ${data.state.fips}`;
  const metroLabel = data.metro.name ?? `metro ${data.metro.code}`;
  const summary = summarize(data, title, stateLabel, metroLabel);

  const everythingBlank = [data.national, data.state, data.metro].every(
    (area) => !hasAnyValue(area),
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-lg leading-relaxed text-ink">{summary}</p>
      </Card>

      {everythingBlank ? (
        <Card>
          <h2 className="text-sm font-semibold text-ink">
            No BLS figures for this occupation
          </h2>
          <p className="mt-2 text-sm text-ink-secondary">
            The survey returned no employment or wage data for {title} at any of
            the three geographies. This happens for small occupations, where BLS
            suppresses cells to protect employer confidentiality.
          </p>
        </Card>
      ) : (
        <Card>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Figure
              label="Jobs nationally"
              observation={data.national.employment}
              format={formatCount}
              source={data.source}
            />
            <Figure
              label="Median pay, national"
              observation={data.national.medianAnnualWage}
              format={formatDollars}
              source={data.source}
            />
            <Figure
              label="Mean pay, national"
              observation={data.national.meanAnnualWage}
              format={formatDollars}
              source={data.source}
            />
            <Figure
              label={`Jobs in ${stateLabel}`}
              observation={data.state.employment}
              format={formatCount}
              source={data.source}
            />
            <Figure
              label={`Median pay, ${stateLabel}`}
              observation={data.state.medianAnnualWage}
              format={formatDollars}
              source={data.source}
            />
            <Figure
              label={`Median pay, ${metroLabel}`}
              observation={data.metro.medianAnnualWage}
              format={formatDollars}
              source={data.source}
            />
          </div>
        </Card>
      )}

      {data.state.medianAnnualWage.value !== null ? (
        <div>
          <Link
            href="/?from=job"
            className="inline-flex items-center rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Use this in the ROI calculator
          </Link>
        </div>
      ) : (
        <p className="text-xs text-muted">
          No state median available, so this can’t be sent to the calculator.
        </p>
      )}
    </div>
  );
}

function hasAnyValue(area: AreaFigures): boolean {
  return (
    area.employment.value !== null ||
    area.medianAnnualWage.value !== null ||
    area.meanAnnualWage.value !== null
  );
}

function Figure({
  label,
  observation,
  format,
  source,
}: {
  label: string;
  observation: Observation;
  format: (value: number) => string;
  source: string;
}) {
  const missing = observation.value === null;
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={
          missing
            ? "mt-1 text-sm text-ink-secondary"
            : "mt-1 text-2xl font-semibold tabular-nums text-ink"
        }
      >
        {missing ? "No data for this area" : format(observation.value as number)}
      </p>
      <p className="mt-1 text-xs text-muted">
        {missing
          ? `Source: ${source} — series reported nothing`
          : `Source: ${source}, ${observation.year ?? "year not given"}`}
      </p>
    </div>
  );
}

/**
 * The one plain-language line SPEC §4.1 asks for, built only from figures that
 * came back. With nothing at all, it says that rather than implying a zero.
 */
function summarize(
  data: OccupationApiPayload,
  title: string,
  stateLabel: string,
  metroLabel: string,
): string {
  const clauses: string[] = [];
  const nationalJobs = data.national.employment.value;
  const nationalMedian = data.national.medianAnnualWage.value;
  const stateJobs = data.state.employment.value;
  const stateMedian = data.state.medianAnnualWage.value;
  const metroMedian = data.metro.medianAnnualWage.value;

  if (nationalJobs !== null) {
    clauses.push(`about ${formatCount(nationalJobs)} of these jobs nationally`);
  }
  if (nationalMedian !== null) {
    clauses.push(`a national median of ${formatDollars(nationalMedian)} a year`);
  }
  if (stateJobs !== null && stateMedian !== null) {
    clauses.push(
      `${formatCount(stateJobs)} in ${stateLabel} at ${formatDollars(stateMedian)}`,
    );
  } else if (stateJobs !== null) {
    clauses.push(`${formatCount(stateJobs)} in ${stateLabel}`);
  } else if (stateMedian !== null) {
    clauses.push(`${formatDollars(stateMedian)} in ${stateLabel}`);
  }
  if (metroMedian !== null) {
    clauses.push(`and ${formatDollars(metroMedian)} around ${metroLabel}`);
  }

  if (clauses.length === 0) {
    return `BLS has no published employment or wage figures for ${title} in ${stateLabel} or nationally.`;
  }

  const year = data.asOfYear === null ? "" : ` (${data.asOfYear} survey)`;
  return `${title}: ${clauses.join(", ")}${year}.`;
}

/* -------------------------------------------------------------------------- */
/* Occupation picker                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Searchable dropdown over the seed table (SPEC §10). The O*NET title crosswalk
 * that would let a user type any title is week 7 (§8), so for now the list is
 * the 20 seeded jobs and the search is a substring match.
 */
function OccupationPicker({
  soc,
  onSelect,
}: {
  soc: string;
  onSelect: (soc: string) => void;
}) {
  const selected = OCCUPATIONS.find((o) => o.soc === soc) ?? null;
  const [query, setQuery] = useState(selected?.title ?? "");
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  const matches = useMemo(
    () => (open ? searchOccupations(query) : []),
    [open, query],
  );

  // Clicking away closes the list and puts the chosen title back in the box, so
  // a half-typed search never looks like the current selection.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(selected?.title ?? "");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, selected]);

  const choose = (occupation: Occupation) => {
    onSelect(occupation.soc);
    setQuery(occupation.title);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapper}>
      <label className="block">
        <span className="text-sm font-medium text-ink">The job you want</span>
        <span className={fieldShell}>
          <input
            className={fieldInput}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls="occupation-options"
            autoComplete="off"
            placeholder="Search 20 common target jobs"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                setQuery(selected?.title ?? "");
              }
              if (e.key === "Enter" && matches.length > 0) {
                e.preventDefault();
                choose(matches[0]);
              }
            }}
          />
        </span>
        <span className="mt-1 block text-xs text-muted">
          Mapped to a federal SOC code, which is what BLS indexes pay by.
        </span>
      </label>

      {open && (
        <ul
          id="occupation-options"
          role="listbox"
          className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-hairline bg-surface py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">
              Nothing in the seed table matches “{query}”. Free-text title search
              arrives with the O*NET crosswalk.
            </li>
          ) : (
            matches.map((occupation) => (
              <li key={occupation.soc}>
                <button
                  type="button"
                  role="option"
                  aria-selected={occupation.soc === soc}
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-plane ${
                    occupation.soc === soc
                      ? "font-semibold text-accent"
                      : "text-ink"
                  }`}
                  onClick={() => choose(occupation)}
                >
                  {occupation.title}
                  <span className="ml-2 text-xs text-muted">
                    {withHyphen(occupation.soc)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

/** First non-empty line of a response body, trimmed to something readable. */
function firstLine(body: string): string {
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l !== "");
  if (line === undefined) return "(the body was empty)";
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

/** "132051" → "13-2051", which is how SOC codes are written for people. */
function withHyphen(soc: string): string {
  return `${soc.slice(0, 2)}-${soc.slice(2)}`;
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-surface p-5">
      {children}
    </section>
  );
}

const fieldShell =
  "mt-1 flex items-center rounded-md border border-hairline bg-plane focus-within:border-accent focus-within:ring-1 focus-within:ring-accent";
const fieldInput =
  "w-full bg-transparent px-2.5 py-1.5 text-sm text-ink outline-none";
