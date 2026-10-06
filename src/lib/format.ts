/**
 * Display formatting only. SPEC.md §5: "Round only for display; keep full
 * precision in the model." Nothing here feeds back into runModel.
 */

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const signedDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
});

const compactDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

/** $72,292 */
export function formatDollars(value: number): string {
  return dollars.format(value);
}

/** +$129,986 / −$177,086 — for figures where the sign is the point. */
export function formatSignedDollars(value: number): string {
  return signedDollars.format(value);
}

/** $72K — for axis ticks, where space is tight. */
export function formatCompactDollars(value: number): string {
  return compactDollars.format(value);
}

const counts = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 361,980 — headcounts, which are not money. */
export function formatCount(value: number): string {
  return counts.format(value);
}

/** Takes a rate already in percent units (3 → "3%"). */
export function formatPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  return `${rounded}%`;
}

/**
 * "latest available, 2025": how current a figure is (PLAN Build 5). Every
 * figure shows the newest release the source has published, which can be a
 * year or more behind today, so the year always travels with the label.
 */
export function latestAvailable(year: number | null): string {
  return year === null ? "latest available" : `latest available, ${year}`;
}
