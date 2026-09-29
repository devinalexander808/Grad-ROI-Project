"use client";

import { useSyncExternalStore } from "react";

/**
 * The user's job + location choice, carried from the Job page (SPEC §4.1) into
 * the ROI calculator (§4.2) and the Next moves card (§4.4). One localStorage
 * key, so every tab sees the same selection.
 *
 * Only the state median travels: it is the figure the calculator offers as a
 * starting salary, and it keeps its survey year so the source line stays true.
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
  /** Survey year of that median, or null if BLS did not say. */
  year: number | null;
}

const STORAGE_KEY = "pathfinder.selection";

/** `storage` only fires in other tabs; this tells the current one. */
const CHANGE_EVENT = "pathfinder:selection";

function isSelection(value: unknown): value is Selection {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.soc === "string" &&
    typeof v.title === "string" &&
    typeof v.stateFips === "string" &&
    typeof v.stateName === "string" &&
    typeof v.stateMedian === "number" &&
    Number.isFinite(v.stateMedian) &&
    (v.year === null || typeof v.year === "number")
  );
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private windows and blocked site data throw; treat as "nothing saved".
    return null;
  }
}

function parse(raw: string | null): Selection | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isSelection(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveSelection(selection: Selection): void {
  const raw = JSON.stringify(selection);
  if (raw === readRaw()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearSelection(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// useSyncExternalStore needs a stable snapshot: re-parse only when the stored
// string actually changes, otherwise hand back the same object.
let cachedRaw: string | null = null;
let cachedSelection: Selection | null = null;

function getSnapshot(): Selection | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSelection = parse(raw);
  }
  return cachedSelection;
}

function getServerSnapshot(): Selection | null {
  return null;
}

/** The saved selection, or null. Null on the server and during hydration. */
export function useSelection(): Selection | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
