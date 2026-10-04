"use client";

import { useEffect, useRef, useState } from "react";
import { formatDollars } from "@/lib/format";
import type {
  Confidence,
  Figure,
  ProgramFigures,
  SchoolMatch,
  SchoolPrograms,
} from "@/lib/scorecard";
import type { ScorecardChoice } from "@/lib/selection";

/**
 * College Scorecard program search (SPEC Appendix A3), shared by the Start
 * screen and the calculator: find a school, pick one of its graduate programs,
 * and get first-year earnings, typical debt and tuition, each with its source
 * and a confidence label, or an honest blank.
 */

/** Wait this long after the last keystroke before searching. */
const SEARCH_DELAY_MS = 300;

type Answer<T> =
  | { key: string; state: "ready"; data: T }
  | { key: string; state: "error"; message: string };

type Status<T> =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; data: T }
  | { state: "error"; message: string };

/** GET a JSON route; failures become readable messages, never a parse error. */
async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const raw = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`The server replied with ${response.status} and no readable data.`);
  }
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

/** Fetches `url` (null = nothing to fetch) and keys the answer to it. */
function useJson<T>(url: string | null, delayMs = 0): Status<T> {
  const [answer, setAnswer] = useState<Answer<T> | null>(null);

  useEffect(() => {
    if (url === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      getJson<T>(url, controller.signal)
        .then((data) => setAnswer({ key: url, state: "ready", data }))
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setAnswer({
            key: url,
            state: "error",
            message: cause instanceof Error ? cause.message : String(cause),
          });
        });
    }, delayMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, delayMs]);

  if (url === null) return { state: "idle" };
  return answer?.key === url ? answer : { state: "loading" };
}

export function toChoice(
  data: SchoolPrograms,
  program: ProgramFigures,
): ScorecardChoice {
  return {
    schoolId: data.school.id,
    schoolName: data.school.name,
    code: program.code,
    title: program.title,
    credentialTitle: program.credentialTitle,
    firstYearEarnings: program.firstYearEarnings,
    typicalDebt: program.typicalDebt,
    tuition: program.tuition,
    source: data.source,
    asOf: data.asOf,
  };
}

export default function ProgramSearch({
  value,
  onChange,
}: {
  value: ScorecardChoice | undefined;
  onChange: (next: ScorecardChoice | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [school, setSchool] = useState<SchoolMatch | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  const schools = useJson<{ schools: SchoolMatch[] }>(
    open && trimmed.length >= 2
      ? `/api/schools?q=${encodeURIComponent(trimmed)}`
      : null,
    SEARCH_DELAY_MS,
  );
  const programs = useJson<SchoolPrograms>(
    school === null ? null : `/api/schools/${school.id}`,
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (value !== undefined) {
    return (
      <div className="rounded-md border border-hairline bg-plane p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-ink">
            {value.title}, {value.credentialTitle}
            <span className="block text-xs font-normal text-ink-secondary">
              {value.schoolName} · CIP {value.code.slice(0, 2)}.{value.code.slice(2)}
            </span>
          </p>
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={() => onChange(undefined)}
          >
            Pick a different program
          </button>
        </div>
        <ScorecardFigures choice={value} />
      </div>
    );
  }

  const choosable =
    programs.state === "ready" ? programs.data.programs : [];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="relative" ref={wrapper}>
        <label className="block">
          <span className="text-sm font-medium text-ink">School</span>
          <span className={fieldShell}>
            <input
              className={fieldInput}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls="school-options"
              autoComplete="off"
              placeholder="Search by name, e.g. Cal Poly"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSchool(null);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </span>
          <span className="mt-1 block text-xs text-muted">
            Data from College Scorecard, U.S. Department of Education.
          </span>
        </label>

        {open && trimmed.length >= 2 && (
          <ul
            id="school-options"
            role="listbox"
            className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-hairline bg-surface py-1 shadow-lg"
          >
            {schools.state === "loading" && (
              <li className="px-3 py-2 text-xs text-muted">Searching…</li>
            )}
            {schools.state === "error" && (
              <li className="px-3 py-2 text-xs text-muted">
                School search isn’t available right now: {schools.message}
              </li>
            )}
            {schools.state === "ready" && schools.data.schools.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted">
                No school matches “{trimmed}”. Try part of its official name.
              </li>
            )}
            {schools.state === "ready" &&
              schools.data.schools.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={school?.id === s.id}
                    className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-plane"
                    onClick={() => {
                      setSchool(s);
                      setQuery(s.name);
                      setOpen(false);
                    }}
                  >
                    {s.name}
                    {(s.city || s.state) && (
                      <span className="ml-2 text-xs text-muted">
                        {[s.city, s.state].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      <label className="block">
        <span className="text-sm font-medium text-ink">Graduate program</span>
        <span className={fieldShell}>
          <select
            className={fieldInput}
            disabled={choosable.length === 0}
            value=""
            onChange={(e) => {
              if (programs.state !== "ready") return;
              const picked = programs.data.programs[Number(e.target.value)];
              if (picked) onChange(toChoice(programs.data, picked));
            }}
          >
            <option value="">
              {school === null
                ? "Choose a school first"
                : programs.state === "loading"
                  ? "Loading programs…"
                  : choosable.length === 0
                    ? "No graduate programs listed"
                    : `Choose one of ${choosable.length}`}
            </option>
            {choosable.map((p, i) => (
              <option key={`${p.code}-${p.credentialLevel}`} value={i}>
                {p.title} — {p.credentialTitle}
              </option>
            ))}
          </select>
        </span>
        <span className="mt-1 block text-xs text-muted">
          {programs.state === "error"
            ? `Programs aren’t available right now: ${programs.message}`
            : "Grouped by field of study, as the Department of Education reports them."}
        </span>
      </label>
    </div>
  );
}

/** The three Scorecard figures for a chosen program, blanks included. */
export function ScorecardFigures({ choice }: { choice: ScorecardChoice }) {
  const rows: { label: string; figure: Figure }[] = [
    { label: "First-year pay", figure: choice.firstYearEarnings },
    { label: "Typical debt", figure: choice.typicalDebt },
    { label: "Tuition", figure: choice.tuition },
  ];
  return (
    <div className="mt-3">
      <dl className="grid gap-3 sm:grid-cols-3">
        {rows.map(({ label, figure }) => (
          <div key={label}>
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="mt-0.5">
              {figure.value === null ? (
                <span className="text-sm text-ink-secondary">Not reported</span>
              ) : (
                <span className="text-lg font-semibold text-ink">
                  {formatDollars(figure.value)}
                </span>
              )}{" "}
              <ConfidenceBadge confidence={figure.confidence} />
              <span className="mt-0.5 block text-xs text-muted">{figure.note}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">
        Source: {choice.source}, {choice.asOf}. Federal-aid recipients only.
      </p>
    </div>
  );
}

/** A3 labels: High, Medium, Low, or "Your input" for typed numbers. */
export function ConfidenceBadge({
  confidence,
}: {
  confidence: Confidence | "Your input" | null;
}) {
  if (confidence === null) return null;
  const tone =
    confidence === "High"
      ? "border-accent text-accent"
      : "border-hairline text-ink-secondary";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-1.5 py-px align-middle text-[10px] font-medium ${tone}`}
    >
      {confidence === "Your input" ? confidence : `${confidence} confidence`}
    </span>
  );
}

const fieldShell =
  "mt-1 flex items-center rounded-md border border-hairline bg-plane focus-within:border-accent focus-within:ring-1 focus-within:ring-accent";
const fieldInput =
  "w-full bg-transparent px-2.5 py-1.5 text-sm text-ink outline-none disabled:text-muted";
