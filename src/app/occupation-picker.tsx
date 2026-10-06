"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_STATE_FIPS,
  STATES,
  metrosInState,
  type OccupationApiPayload,
} from "@/lib/bls";
import {
  findOccupation,
  searchOccupations,
  type Occupation,
} from "@/lib/occupations";
import type { OccupationSearchPayload, OnetSearchResult } from "@/lib/onet";
import { readSelection, saveSelection, type Selection } from "@/lib/selection";

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
  /** Set when the job was picked from O*NET search rather than the seed table. */
  onet?: OnetPick;
}

/** A job picked from O*NET search. `soc` on the choice is its BLS code. */
export interface OnetPick {
  /** O*NET-SOC code, e.g. "29-1141.03". */
  code: string;
  title: string;
  /** Set for O*NET-only breakdowns: the six-digit group BLS publishes. */
  broaderGroup: OnetSearchResult["broaderGroup"];
}

export const DEFAULT_CHOICE: JobChoice = {
  soc: DEFAULT_SOC,
  stateFips: DEFAULT_STATE_FIPS,
  metroCode: null,
};

/** The choice saved last time, or the default when nothing valid is saved. */
export function initialChoice(): JobChoice {
  const saved = readSelection();
  return saved === null ? DEFAULT_CHOICE : choiceFromSelection(saved);
}

/** Turns a saved selection back into a picker choice, O*NET pick included. */
export function choiceFromSelection(saved: Selection): JobChoice {
  const base = {
    soc: saved.soc,
    stateFips: saved.stateFips,
    metroCode: saved.metroCode ?? null,
  };
  if (saved.onetCode !== undefined && saved.onetTitle !== undefined) {
    return {
      ...base,
      onet: {
        code: saved.onetCode,
        title: saved.onetTitle,
        broaderGroup: saved.broaderGroup ?? null,
      },
    };
  }
  // Saved before O*NET picks were stored: a job outside the seed table can
  // only come back as its BLS title.
  if (findOccupation(saved.soc) === null) {
    return {
      ...base,
      onet: {
        code: `${withHyphen(saved.soc)}.00`,
        title: saved.title,
        broaderGroup: null,
      },
    };
  }
  return base;
}

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
  onet,
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

  // Hand the choice to the ROI calculator. Kept apart from the fetch so that
  // switching between two O*NET jobs with the same SOC (no new BLS request)
  // still saves the new pick. Without a state median there is nothing to
  // carry, and the calculator never shows a made-up one. The metro rides along
  // only when one was picked and BLS has a median for it; otherwise the
  // calculator falls back to the state figure.
  const onetCode = onet?.code;
  const onetTitle = onet?.title;
  const groupSoc = onet?.broaderGroup?.soc;
  const groupTitle = onet?.broaderGroup?.title ?? null;
  useEffect(() => {
    if (answer?.key !== key || answer.state !== "ready") return;
    const { data } = answer;
    const stateMedian = data.state.medianAnnualWage.value;
    const metroMedian = data.metro.medianAnnualWage.value;
    if (stateMedian === null) return;
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
      ...(onetCode !== undefined && onetTitle !== undefined
        ? {
            onetCode,
            onetTitle,
            ...(groupSoc !== undefined
              ? { broaderGroup: { soc: groupSoc, title: groupTitle } }
              : {}),
          }
        : {}),
    });
  }, [answer, key, metroCode, onetCode, onetTitle, groupSoc, groupTitle]);

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
        onet={value.onet}
        onSelect={(next, onet) => onChange({ ...value, soc: next, onet })}
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

/** One row in the dropdown: a seed job, or an O*NET match listed under them. */
type Option =
  | { kind: "seed"; occupation: Occupation }
  | { kind: "onet"; result: OnetSearchResult };

type OnetLoad =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; results: OnetSearchResult[] }
  | { state: "error"; message: string };

/** Shortest query sent to O*NET; matches the route's own minimum. */
const MIN_ONET_QUERY = 2;

/** Wait for a pause in typing before asking O*NET. */
const ONET_DEBOUNCE_MS = 250;

/**
 * O*NET matches for the typed text, from /api/occupations/search. Loading is
 * derived like useOccupationLookup's: an answer for an older query is ignored.
 */
function useOnetSearch(query: string, enabled: boolean): OnetLoad {
  const q = query.trim();
  const active = enabled && q.length >= MIN_ONET_QUERY;
  const [answer, setAnswer] = useState<
    ((OnetLoad & { state: "ready" | "error" }) & { key: string }) | null
  >(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/occupations/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const raw = await response.text();
          let body: OccupationSearchPayload | { error?: string };
          try {
            body = JSON.parse(raw) as OccupationSearchPayload | { error?: string };
          } catch {
            throw new Error(
              `The server replied with ${response.status} and a body that is not JSON.`,
            );
          }
          if (!response.ok || !("results" in body)) {
            throw new Error(
              "error" in body && body.error
                ? body.error
                : `Request failed (${response.status}).`,
            );
          }
          setAnswer({ key: q, state: "ready", results: body.results });
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setAnswer({
            key: q,
            state: "error",
            message: cause instanceof Error ? cause.message : String(cause),
          });
        });
    }, ONET_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, q]);

  if (!active) return { state: "idle" };
  return answer?.key === q ? answer : { state: "loading" };
}

/**
 * Searchable dropdown. The seed table (SPEC §10) is matched in the browser and
 * shows instantly; O*NET matches for any other title load underneath it. Arrow
 * keys move the highlight across both, Enter picks it, Escape backs out.
 */
function OccupationSearch({
  soc,
  onet,
  onSelect,
}: {
  soc: string;
  onet: OnetPick | undefined;
  onSelect: (soc: string, onet?: OnetPick) => void;
}) {
  const title = onet?.title ?? findOccupation(soc)?.title ?? "";
  const [query, setQuery] = useState(title);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const seedMatches = useMemo(
    () => (open ? searchOccupations(query) : []),
    [open, query],
  );
  const onetLoad = useOnetSearch(query, open);

  const options = useMemo<Option[]>(() => {
    const seeds: Option[] = seedMatches.map((occupation) => ({
      kind: "seed",
      occupation,
    }));
    if (onetLoad.state !== "ready") return seeds;
    // A seed row already covers the six-digit job itself; O*NET-only
    // breakdowns of it still get their own row.
    const shown = new Set(seedMatches.map((o) => o.soc));
    const extra: Option[] = onetLoad.results
      .filter((r) => r.broaderGroup !== null || !shown.has(r.soc))
      .map((result) => ({ kind: "onet", result }));
    return [...seeds, ...extra];
  }, [seedMatches, onetLoad]);

  // Clamped here rather than reset in an effect, so a shrinking match list can
  // never leave the highlight pointing past the end.
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));
  const firstOnet = options.findIndex((o) => o.kind === "onet");

  // Clicking away closes the list and puts the chosen title back in the box, so
  // a half-typed search never looks like the current selection.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(title);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, title]);

  // Keep the keyboard highlight visible inside the list's own scroll area.
  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const openList = () => {
    if (open) return;
    setActive(0);
    setOpen(true);
  };

  const choose = (option: Option) => {
    if (option.kind === "seed") {
      onSelect(option.occupation.soc);
      setQuery(option.occupation.title);
    } else {
      const { code, title: picked, soc: next, broaderGroup } = option.result;
      onSelect(next, { code, title: picked, broaderGroup });
      setQuery(picked);
    }
    setOpen(false);
  };

  const optionId = (index: number) => `occupation-option-${index}`;
  const isCurrent = (option: Option) =>
    option.kind === "seed"
      ? onet === undefined && option.occupation.soc === soc
      : onet?.code === option.result.code;

  const nothingFound =
    options.length === 0 &&
    (onetLoad.state === "ready" || onetLoad.state === "idle");

  return (
    // self-start: in the two-column grid this cell would otherwise stretch to
    // the taller state/metro column and push the list well below the input.
    <div className="self-start" ref={wrapper}>
      <label
        htmlFor="occupation-search"
        className="block text-sm font-medium text-ink"
      >
        The job you want
      </label>
      {/* The list hangs off the input itself, not off the whole field. */}
      <div className="relative">
          <span className={fieldShell}>
            <input
              id="occupation-search"
              className={fieldInput}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls="occupation-options"
              aria-autocomplete="list"
              aria-activedescendant={
                open && options.length > 0 ? optionId(activeIndex) : undefined
              }
              autoComplete="off"
              placeholder="Type any job title, like “nurse” or “electrician”"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
                setOpen(true);
              }}
              onFocus={openList}
              onClick={openList}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  if (!open) {
                    openList();
                    return;
                  }
                  if (options.length === 0) return;
                  const step = e.key === "ArrowDown" ? 1 : -1;
                  setActive(
                    (activeIndex + step + options.length) % options.length,
                  );
                } else if (e.key === "Enter" && open && options.length > 0) {
                  e.preventDefault();
                  choose(options[activeIndex]);
                } else if (e.key === "Escape") {
                  setOpen(false);
                  setQuery(title);
                }
              }}
            />
          </span>

        {open && (
          <ul
            id="occupation-options"
            role="listbox"
            ref={list}
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-[280px] overflow-y-auto overscroll-contain rounded-lg border border-hairline bg-surface py-1 shadow-xl ring-1 ring-ink/5"
          >
            {options.map((option, index) => (
              <Fragment key={optionKey(option)}>
                {index === firstOnet && (
                  <li
                    role="presentation"
                    className="mt-1 border-t border-hairline px-3 pt-2 pb-1 text-xs font-medium text-muted"
                  >
                    More jobs from O*NET
                  </li>
                )}
                <li
                  id={optionId(index)}
                  data-index={index}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`cursor-pointer px-3 py-1.5 text-sm ${
                    index === activeIndex ? "bg-accent/10" : ""
                  } ${isCurrent(option) ? "font-semibold text-accent" : "text-ink"}`}
                  // Keep focus in the input so the click doesn't blur and reset it.
                  onPointerDown={(e) => e.preventDefault()}
                  onPointerMove={() => setActive(index)}
                  onClick={() => choose(option)}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    {option.kind === "seed"
                      ? option.occupation.title
                      : option.result.title}
                    <span className="shrink-0 text-xs font-normal text-muted">
                      {option.kind === "seed"
                        ? withHyphen(option.occupation.soc)
                        : option.result.code}
                    </span>
                  </span>
                  {option.kind === "onet" && option.result.broaderGroup && (
                    <span className="block text-xs font-normal text-muted">
                      BLS publishes wages for the broader group{" "}
                      {option.result.broaderGroup.title ??
                        `SOC ${withHyphen(option.result.soc)}`}
                    </span>
                  )}
                </li>
              </Fragment>
            ))}

            {onetLoad.state === "loading" && (
              <li role="presentation" className="px-3 py-2 text-xs text-muted">
                Searching O*NET for more jobs…
              </li>
            )}
            {onetLoad.state === "error" && (
              <li role="presentation" className="px-3 py-2 text-xs text-muted">
                Couldn’t search O*NET just now ({onetLoad.message}), so only the
                built-in list is shown.
              </li>
            )}
            {nothingFound && (
              <li role="presentation" className="px-3 py-2 text-sm text-ink-secondary">
                We couldn’t find that job. Try a shorter or more general title,
                like “nurse” or “analyst”.
              </li>
            )}
          </ul>
        )}
      </div>
      <span className="mt-1 block text-xs text-muted">
        {onet?.broaderGroup
          ? `O*NET ${onet.code}. BLS publishes wages for the broader group ${
              onet.broaderGroup.title ??
              `SOC ${withHyphen(onet.broaderGroup.soc)}`
            }.`
          : "Mapped to a federal SOC code, which is what BLS indexes pay by."}
      </span>
    </div>
  );
}

function optionKey(option: Option): string {
  return option.kind === "seed"
    ? `seed-${option.occupation.soc}`
    : `onet-${option.result.code}`;
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
