"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type {
  AreaFigures,
  Observation,
  OccupationApiPayload,
} from "@/lib/bls";
import { findOccupation } from "@/lib/occupations";
import { useHydrated } from "@/lib/selection";
import { formatCount, formatDollars, latestAvailable } from "@/lib/format";
import OccupationPicker, {
  initialChoice,
  useOccupationLookup,
  withHyphen,
  type JobChoice,
} from "../occupation-picker";

/**
 * SPEC.md §4.1, "The job right now" — the employment and pay half of it, live
 * from BLS OEWS. Projected growth, entry education and the Adzuna postings count
 * are weeks 7 and later (§8); nothing here pretends to have them.
 *
 * §6 rules honoured here: six numbers on the card and no more, every figure
 * carries its source and as-of year, and a series with no data says so instead
 * of showing a zero.
 */

export default function JobPage() {
  // The page starts from the job saved last time, which only the browser
  // knows, so it mounts after hydration rather than flashing the default.
  const hydrated = useHydrated();
  return hydrated ? (
    <JobView />
  ) : (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="text-sm text-ink-secondary">Loading…</p>
    </div>
  );
}

function JobView() {
  const [choice, setChoice] = useState<JobChoice>(initialChoice);
  // Asks BLS and saves the choice for the calculator.
  const load = useOccupationLookup(choice);

  // Seed jobs describe themselves; anything picked from O*NET gets its
  // description from the lookup, once it answers.
  const selected =
    findOccupation(choice.soc) ??
    (load.state === "ready" ? load.data.occupation : null);

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

      <OccupationPicker value={choice} onChange={setChoice} />

      {selected && (
        <p className="mt-4 text-sm text-ink-secondary">
          {selected.description}{" "}
          <span className="text-muted">
            SOC {withHyphen(selected.soc)}
            {selected.descriptionSource
              ? ` · Description: ${selected.descriptionSource}`
              : ""}
          </span>
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
              This data isn’t available right now
            </h2>
            <p className="mt-2 text-sm text-ink-secondary">
              We couldn’t get pay and job counts from the federal wage survey
              (BLS OEWS) just now. You can still pick another job or place, and
              the calculator works without it. Try again in a few minutes.
            </p>
            <p className="mt-2 text-xs text-muted">Details: {load.message}</p>
          </Card>
        )}

        {load.state === "ready" && (
          <Snapshot data={load.data} showMetro={choice.metroCode !== null} />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The card                                                                    */
/* -------------------------------------------------------------------------- */

function Snapshot({
  data,
  showMetro,
}: {
  data: OccupationApiPayload;
  /** False for "Statewide only": the route still returns a metro, unused. */
  showMetro: boolean;
}) {
  const title = data.occupation?.title ?? `SOC ${withHyphen(data.soc)}`;
  const stateLabel = data.state.name ?? `state ${data.state.fips}`;
  const metroLabel = showMetro
    ? (data.metro.name ?? `metro ${data.metro.code}`)
    : null;
  const summary = summarize(data, title, stateLabel, metroLabel);

  const columns: { label: string; figures: AreaFigures }[] = [
    { label: "National", figures: data.national },
    { label: stateLabel, figures: data.state },
    ...(metroLabel === null ? [] : [{ label: metroLabel, figures: data.metro }]),
  ];

  const everythingBlank = columns.every(({ figures }) => !hasAnyValue(figures));

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
            The survey returned no employment or wage data for {title} in any
            of the areas shown. This happens for small occupations, where BLS
            suppresses cells to protect employer confidentiality.
          </p>
        </Card>
      ) : (
        <Card>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right tabular-nums">
              <thead>
                <tr className="text-xs text-muted">
                  <td className="pb-2 pr-4" />
                  {columns.map((column) => (
                    <th
                      key={column.label}
                      scope="col"
                      className="pb-2 pl-4 align-bottom font-medium"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-t border-hairline">
                    <th
                      scope="row"
                      className="py-2 pr-4 text-left text-xs font-medium text-muted"
                    >
                      {row.label}
                    </th>
                    {columns.map((column) => (
                      <FigureCell
                        key={column.label}
                        observation={row.pick(column.figures)}
                        format={row.format}
                        source={data.source}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            Source: {data.source}, {latestAvailable(data.asOfYear)}. Pay is
            annual. n/a means BLS published no figure for that area, usually to
            protect employer confidentiality.
          </p>
        </Card>
      )}

      {data.state.medianAnnualWage.value !== null ? (
        <div>
          <Link
            href="/calculator?from=job"
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

const ROWS: {
  label: string;
  pick: (area: AreaFigures) => Observation;
  format: (value: number) => string;
}[] = [
  { label: "Jobs", pick: (a) => a.employment, format: formatCount },
  { label: "Median pay", pick: (a) => a.medianAnnualWage, format: formatDollars },
  { label: "Mean pay", pick: (a) => a.meanAnnualWage, format: formatDollars },
];

function hasAnyValue(area: AreaFigures): boolean {
  return (
    area.employment.value !== null ||
    area.medianAnnualWage.value !== null ||
    area.meanAnnualWage.value !== null
  );
}

/** One figure; "n/a" when BLS published nothing, never a zero (SPEC §6). */
function FigureCell({
  observation,
  format,
  source,
}: {
  observation: Observation;
  format: (value: number) => string;
  source: string;
}) {
  if (observation.value === null) {
    return (
      <td
        className="py-2 pl-4 text-sm text-muted"
        title={`${source} published no figure for this area`}
      >
        n/a
      </td>
    );
  }
  return (
    <td
      className="py-2 pl-4 text-lg font-semibold text-ink"
      title={`${source}, ${latestAvailable(observation.year)}`}
    >
      {format(observation.value)}
    </td>
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
  /** Null for "Statewide only". */
  metroLabel: string | null,
): string {
  const clauses: string[] = [];
  const nationalJobs = data.national.employment.value;
  const nationalMedian = data.national.medianAnnualWage.value;
  const stateJobs = data.state.employment.value;
  const stateMedian = data.state.medianAnnualWage.value;
  const metroMedian =
    metroLabel === null ? null : data.metro.medianAnnualWage.value;

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
  if (metroMedian !== null && metroLabel !== null) {
    clauses.push(`and ${formatDollars(metroMedian)} around ${metroLabel}`);
  }

  if (clauses.length === 0) {
    return `BLS has no published employment or wage figures for ${title} in ${stateLabel} or nationally.`;
  }

  const year =
    data.asOfYear === null
      ? " (latest available survey)"
      : ` (${data.asOfYear} survey, the latest available)`;
  return `${title}: ${clauses.join(", ")}${year}.`;
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
