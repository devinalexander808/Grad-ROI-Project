"use client";

import { useSyncExternalStore } from "react";

/**
 * What the user has told us so far, carried between pages in localStorage so
 * every tab sees the same thing:
 *
 * - `Selection`: the job + location choice, from the Job page or the Start
 *   screen (SPEC §4.1) into the ROI calculator (§4.2) and Next moves (§4.4).
 * - `Profile`: where the user is now (Start screen step 1). Optional.
 * - `Program`: the program they're considering (Start screen step 3). Optional.
 *
 * Only medians travel in a selection: the state one always, and a metro one
 * when the user picked a metro and BLS published a figure for it. The
 * calculator offers the most local of the two as a starting salary (see
 * `selectedWage`).
 */

export interface Selection {
  /** Six digits, no hyphen. */
  soc: string;
  title: string;
  /** Two-digit FIPS. */
  stateFips: string;
  stateName: string;
  /** BLS OEWS median annual wage for the occupation in that state. */
  stateMedian: number;
  /** OEWS survey year of the medians, or null if BLS did not say. */
  year: number | null;
  /** Seven-digit OEWS metro area code. Set together with the two below. */
  metroCode?: string;
  metroName?: string;
  /** BLS OEWS median annual wage for the occupation in that metro. */
  metroMedian?: number;
}

export const DEGREES = [
  { value: "high-school", label: "High school" },
  { value: "associate", label: "Associate" },
  { value: "bachelors", label: "Bachelor’s" },
  { value: "masters", label: "Master’s" },
  { value: "other", label: "Other" },
] as const;

export type Degree = (typeof DEGREES)[number]["value"];

/** Start screen step 1. Null means "not answered yet". */
export interface Profile {
  /** Pre-tax, per year. */
  salary: number | null;
  /** 0–40. */
  experienceYears: number | null;
  degree: Degree | null;
}

/** Start screen step 3. Null means "not answered yet". */
export interface Program {
  name: string;
  /** The whole program, not per year. */
  tuition: number | null;
  years: number | null;
}

export interface SelectedWage {
  median: number;
  /** "San Luis Obispo–Paso Robles, CA" or "California". */
  place: string;
  /** Which median was used, for source notes. */
  level: "metro area" | "state";
}

/** The metro median when there is one, else the state median. */
export function selectedWage(selection: Selection): SelectedWage {
  if (
    selection.metroMedian !== undefined &&
    selection.metroName !== undefined
  ) {
    return {
      median: selection.metroMedian,
      place: selection.metroName,
      level: "metro area",
    };
  }
  return {
    median: selection.stateMedian,
    place: selection.stateName,
    level: "state",
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSelection(value: unknown): value is Selection {
  if (!isRecord(value)) return false;
  const v = value;
  const metroFields = [v.metroCode, v.metroName, v.metroMedian];
  const metroOk =
    metroFields.every((f) => f === undefined) ||
    (typeof v.metroCode === "string" &&
      typeof v.metroName === "string" &&
      isFiniteNumber(v.metroMedian));
  return (
    metroOk &&
    typeof v.soc === "string" &&
    typeof v.title === "string" &&
    typeof v.stateFips === "string" &&
    typeof v.stateName === "string" &&
    isFiniteNumber(v.stateMedian) &&
    (v.year === null || typeof v.year === "number")
  );
}

function isProfile(value: unknown): value is Profile {
  if (!isRecord(value)) return false;
  return (
    isNumberOrNull(value.salary) &&
    isNumberOrNull(value.experienceYears) &&
    (value.degree === null ||
      DEGREES.some((d) => d.value === value.degree))
  );
}

function isProgram(value: unknown): value is Program {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    isNumberOrNull(value.tuition) &&
    isNumberOrNull(value.years)
  );
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

interface Store<T> {
  get: () => T | null;
  save: (value: T) => void;
  clear: () => void;
  subscribe: (onChange: () => void) => () => void;
}

/** One localStorage key, read through useSyncExternalStore. */
function createStore<T>(
  key: string,
  isValid: (value: unknown) => value is T,
): Store<T> {
  /** `storage` only fires in other tabs; this tells the current one. */
  const changeEvent = `${key}:change`;

  function readRaw(): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Private windows and blocked site data throw; treat as "nothing saved".
      return null;
    }
  }

  function parse(raw: string | null): T | null {
    if (raw === null) return null;
    try {
      const value: unknown = JSON.parse(raw);
      return isValid(value) ? value : null;
    } catch {
      return null;
    }
  }

  // useSyncExternalStore needs a stable snapshot: re-parse only when the
  // stored string actually changes, otherwise hand back the same object.
  let cachedRaw: string | null = null;
  let cachedValue: T | null = null;

  return {
    get() {
      const raw = readRaw();
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedValue = parse(raw);
      }
      return cachedValue;
    },
    save(value) {
      const raw = JSON.stringify(value);
      if (raw === readRaw()) return;
      try {
        window.localStorage.setItem(key, raw);
      } catch {
        return;
      }
      window.dispatchEvent(new Event(changeEvent));
    },
    clear() {
      try {
        window.localStorage.removeItem(key);
      } catch {
        return;
      }
      window.dispatchEvent(new Event(changeEvent));
    },
    subscribe(onChange) {
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) onChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(changeEvent, onChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(changeEvent, onChange);
      };
    },
  };
}

function getServerSnapshot(): null {
  return null;
}

const selectionStore = createStore("pathfinder.selection", isSelection);
const profileStore = createStore("pathfinder.profile", isProfile);
const programStore = createStore("pathfinder.program", isProgram);

export const saveSelection = selectionStore.save;
export const clearSelection = selectionStore.clear;
/** Read once, outside React. Null when nothing valid is saved. */
export const readSelection = selectionStore.get;

export const saveProfile = profileStore.save;
export const readProfile = profileStore.get;

export const saveProgram = programStore.save;
export const readProgram = programStore.get;

/** The saved selection, or null. Null on the server and during hydration. */
export function useSelection(): Selection | null {
  return useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.get,
    getServerSnapshot,
  );
}

/** The saved Start screen profile, or null. Null on the server and during hydration. */
export function useProfile(): Profile | null {
  return useSyncExternalStore(
    profileStore.subscribe,
    profileStore.get,
    getServerSnapshot,
  );
}

/** The saved Start screen program, or null. Null on the server and during hydration. */
export function useProgram(): Program | null {
  return useSyncExternalStore(
    programStore.subscribe,
    programStore.get,
    getServerSnapshot,
  );
}
