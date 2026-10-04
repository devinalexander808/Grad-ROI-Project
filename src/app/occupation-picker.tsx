"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_STATE_FIPS,
  STATES,
  metrosInState,
  type OccupationApiPayload,
} from "@/lib/bls";
import {
  OCCUPATIONS,
  searchOccupations,
  type Occupation,
} from "@/lib/occupations";
import { saveSelection } from "@/lib/selection";

/**
 * The job + place choice shared by the Job page and the Start screen (SPEC
 * §4.1): a searchable occupation picker, a state picker and an optional metro
 * picker, plus the BLS lookup that saves the choice for the calculator.
 */

export const DEFAULT_SOC = "132051"; // Financial analyst — the occupation verified in §10.

export interface JobChoice {
  /** Six digits, no hyphen. */
  soc: string;
  /** Two-digit FIPS. */
  stateFips: string;
  /** Seven-digit OEWS metro area code; null means "Statewide only". */
  metroCode: string | null;
}

export const DEFAULT_CHOICE: JobChoice = {
  soc: DEFAULT_SOC,
  stateFips: DEFAULT_STATE_FIPS,
  metroCode: null,
};

export type Load =
  | { state: "loading" }
  | { state: "ready"; data: OccupationApiPayload }
  | { state: "error"; message: string };

/** Identifies the request the answer in state belongs to. */
type Answered = (Load & { state: "ready" | "error" }) & { key: string };

/**
 * Asks `/api/occupation/[soc]` for the chosen job and place, and saves the
 * answer as the selection the calculator reads.
 */
export function useOccupationLookup({
  soc,
  stateFips,
  metroCode,
}: JobChoice): Load {
  const [answer, setAnswer] = useState<Answered | null>(null);
  const key = `${soc}|${stateFips}|${metroCode ?? ""}`;

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = `${soc}|${stateFips}|${metroCode ?? ""}`;
    const metroParam = metroCode === null ? "" : `&metro=${metroCode}`;

    fetch(`/api/occupation/${soc}?state=${stateFips}${metroParam}`, {
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
        setAnswer({ key: requestKey, state: "ready", data });

        // Hand the choice to the ROI calculator. Without a state median there
        // is nothing to carry, and the calculator never shows a made-up one.
        // The metro rides along only when one was picked and BLS has a median
        // for it; otherwise the calculator falls back to the state figure.
        const stateMedian = data.state.medianAnnualWage.value;
        const metroMedian = data.metro.medianAnnualWage.value;
        if (stateMedian !== null) {
          saveSelection({
            soc: data.soc,
            title: data.occupation?.title ?? `SOC ${withHyphen(data.soc)}`,
            stateFips: data.state.fips,
            stateName: data.state.name ?? `state ${data.state.fips}`,
            stateMedian,
            year: data.state.medianAnnualWage.year ?? data.asOfYear,
            ...(metroCode !== null && metroMedian !== null
              ? {
                  metroCode: data.metro.code,
                  metroName: data.metro.name ?? `metro ${data.metro.code}`,
                  metroMedian,
                }
              : {}),
          });
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setAnswer({
          key: requestKey,
          state: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      });

    return () => controller.abort();
  }, [soc, stateFips, metroCode]);

  // Loading is derived, not stored: anything other than an answer for the
  // current choice means the fetch is still out.
  return answer?.key === key ? answer : { state: "loading" };
}

/** The occupation search on the left, state and metro on the right. */
export default function OccupationPicker({
  value,
  onChange,
}: {
  value: JobChoice;
  onChange: (next: JobChoice) => void;
}) {
  const { soc, stateFips, metroCode } = value;
  const metros = useMemo(() => metrosInState(stateFips), [stateFips]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <OccupationSearch
        soc={soc}
        onSelect={(next) => onChange({ ...value, soc: next })}
      />
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="text-sm font-medium text-ink">Your state</span>
          <span className={fieldShell}>
            <select
              className={fieldInput}
              value={stateFips}
              onChange={(e) =>
                onChange({ ...value, stateFips: e.target.value, metroCode: null })
              }
            >
              {STATES.map((s) => (
                <option key={s.fips} value={s.fips}>
                  {s.name}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">
            Metro area{" "}
            <span className="font-normal text-muted">(optional)</span>
          </span>
          <span className={fieldShell}>
            <select
              className={fieldInput}
              value={metroCode ?? ""}
              onChange={(e) =>
                onChange({ ...value, metroCode: e.target.value || null })
              }
            >
              <option value="">Statewide only</option>
              {metros.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              ))}
            </select>
          </span>
          <span className="mt-1 block text-xs text-muted">
            {metros.length === 0
              ? "No metro areas listed for this state yet."
              : "Adds local figures next to the state and national ones."}
          </span>
        </label>
      </div>
    </div>
  );
}

/**
 * Searchable dropdown over the seed table (SPEC §10). The O*NET title crosswalk
 * that would let a user type any title is week 7 (§8), so for now the list is
 * the 20 seeded jobs and the search is a substring match.
 */
function OccupationSearch({
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
export function withHyphen(soc: string): string {
  return `${soc.slice(0, 2)}-${soc.slice(2)}`;
}

const fieldShell =
  "mt-1 flex items-center rounded-md border border-hairline bg-plane focus-within:border-accent focus-within:ring-1 focus-within:ring-accent";
const fieldInput =
  "w-full bg-transparent px-2.5 py-1.5 text-sm text-ink outline-none";
