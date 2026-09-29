/**
 * BLS OEWS (Occupational Employment and Wage Statistics) client — SPEC.md §4.1,
 * Appendix B, and the verified notes in §10.
 *
 * Series ID format, confirmed live against the API (SPEC §10):
 *
 *   OEU | area type | area code (7) | industry (6) | SOC (6, no hyphen) | data type (2)
 *   OEU      N          0000000         000000            132051                01
 *
 * Verified values for financial analysts (132051), 2025: national employment
 * 361,980 / median $102,740 / mean $116,800; California employment 45,380,
 * median $109,110; San Luis Obispo MSA median $97,720.
 *
 * Rate limits (SPEC §10): unregistered use is 25 queries/day and 25 series per
 * query. A free BLS_API_KEY raises that to 500/day and 50 per query. We stay
 * inside the unregistered limit either way — 25 series per request — and cache
 * every observation for 24 hours so a demo never depends on a live call. The
 * cache is process memory for now; SPEC §7 moves it to Supabase.
 */

import type { Occupation } from "./occupations";

export const BLS_ENDPOINT = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

/** SPEC §10: N national, S state, M metro. */
export type AreaType = "N" | "S" | "M";

/** SPEC §10: the trailing two digits of the series ID. */
export const DATA_TYPE = {
  employment: "01",
  meanAnnualWage: "04",
  medianAnnualWage: "13",
} as const;

export type DataType = (typeof DATA_TYPE)[keyof typeof DATA_TYPE];

/** All industries — the cross-industry figures §4.1 asks for. */
export const ALL_INDUSTRIES = "000000";

export const NATIONAL_AREA_CODE = "0000000";

/** SPEC §10 defaults: California and the San Luis Obispo MSA. */
export const DEFAULT_STATE_FIPS = "06";
export const DEFAULT_METRO_CODE = "0042200";

/** BLS caps a query at 25 series without a registration key (SPEC §10). */
const MAX_SERIES_PER_REQUEST = 25;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * How long to wait on BLS before giving up with a readable error.
 *
 * Keep this below the hosting platform's function limit. On Vercel's Hobby tier
 * that limit is 10s by default, so at 10s the platform can kill the invocation
 * first and the client gets an empty body — exactly the failure this is meant to
 * prevent. 8s leaves headroom for the rest of the handler; if you raise this,
 * raise `maxDuration` on the route too.
 */
export const BLS_TIMEOUT_MS = 8_000;

/**
 * Strips the registration key out of anything we log or return. BLS echoes the
 * key back inside its own error text ("The key:abc… provided by the User is
 * invalid"), and both destinations are places it must never reach: the 502 body
 * goes to the browser, and logs are readable by anyone with project access.
 */
function redact(text: string): string {
  const key = process.env.BLS_API_KEY;
  if (!key) return text;
  return text.split(key).join("<redacted key>");
}

/** First 300 characters of a response body, for logs and error messages. */
function snippet(body: string): string {
  const flat = redact(body).replace(/\s+/g, " ").trim();
  if (flat === "") return "(empty body)";
  return flat.length > 300 ? `${flat.slice(0, 300)}…` : flat;
}

export interface SeriesIdParts {
  areaType: AreaType;
  /** 7 digits. For a state this is the 2-digit FIPS plus five zeros. */
  areaCode: string;
  /** 6-digit SOC code with no hyphen, e.g. "132051". */
  socCode: string;
  dataType: DataType;
  /** 6-digit industry code; defaults to all industries. */
  industryCode?: string;
}

/** Turns a state FIPS ("06") into the 7-digit OEWS area code ("0600000"). */
export function stateAreaCode(fips: string): string {
  if (!/^\d{2}$/.test(fips)) {
    throw new Error(`State FIPS must be 2 digits, got "${fips}"`);
  }
  return `${fips}00000`;
}

export function buildSeriesId({
  areaType,
  areaCode,
  socCode,
  dataType,
  industryCode = ALL_INDUSTRIES,
}: SeriesIdParts): string {
  if (areaType !== "N" && areaType !== "S" && areaType !== "M") {
    throw new Error(`Area type must be N, S or M, got "${areaType}"`);
  }
  if (!/^\d{7}$/.test(areaCode)) {
    throw new Error(`Area code must be 7 digits, got "${areaCode}"`);
  }
  if (!/^\d{6}$/.test(industryCode)) {
    throw new Error(`Industry code must be 6 digits, got "${industryCode}"`);
  }
  if (!/^\d{6}$/.test(socCode)) {
    throw new Error(
      `SOC code must be 6 digits with no hyphen, got "${socCode}"`,
    );
  }
  return `OEU${areaType}${areaCode}${industryCode}${socCode}${dataType}`;
}

/* -------------------------------------------------------------------------- */
/* One observation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The latest annual value for a series. `value` is null when BLS has nothing
 * publishable — suppressed cells come back as "-" or "*". SPEC §6: blank states
 * are honest, so null travels all the way to the UI instead of becoming a zero.
 */
export interface Observation {
  seriesId: string;
  value: number | null;
  year: number | null;
}

interface CacheEntry {
  observation: Observation;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test and debug hook — there is no other way to empty a module-level Map. */
export function clearBlsCache(): void {
  cache.clear();
}

/* -------------------------------------------------------------------------- */
/* Fetching                                                                    */
/* -------------------------------------------------------------------------- */

export class BlsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlsError";
  }
}

interface BlsDataPoint {
  year?: string;
  period?: string;
  value?: string;
}

interface BlsSeries {
  seriesID?: string;
  data?: BlsDataPoint[];
}

interface BlsResponse {
  status?: string;
  message?: string[];
  Results?: { series?: BlsSeries[] };
}

/** "102,740" -> 102740; "-", "*", "" and anything unparseable -> null. */
function parseValue(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Newest annual observation in a series. OEWS is annual ("A01") and BLS returns
 * newest first, but neither is worth relying on. SPEC §10 warns that the "no
 * data" messages for older years are noise — skipping years without a value is
 * how we skip them.
 */
function latestAnnual(series: BlsSeries): {
  value: number | null;
  year: number | null;
} {
  let best: { value: number; year: number } | null = null;
  for (const point of series.data ?? []) {
    if (point.period && point.period !== "A01") continue;
    const value = parseValue(point.value);
    const year = Number(point.year);
    if (value === null || !Number.isFinite(year)) continue;
    if (best === null || year > best.year) best = { value, year };
  }
  return best ?? { value: null, year: null };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Latest annual value for each series ID, in batches of 25, each cached for 24
 * hours. Series already in cache cost no request; if every one is cached, no
 * call is made at all.
 *
 * Throws BlsError when the API itself fails. A series the API simply has no data
 * for is not a failure — it comes back with a null value.
 */
export async function fetchSeries(
  seriesIds: string[],
): Promise<Map<string, Observation>> {
  const wanted = [...new Set(seriesIds)];
  const results = new Map<string, Observation>();
  const now = Date.now();
  const missing: string[] = [];

  for (const id of wanted) {
    const hit = cache.get(id);
    if (hit && hit.expiresAt > now) {
      results.set(id, hit.observation);
    } else {
      missing.push(id);
    }
  }

  const apiKey = process.env.BLS_API_KEY;

  for (const batch of chunk(missing, MAX_SERIES_PER_REQUEST)) {
    const body: Record<string, unknown> = { seriesid: batch };
    if (apiKey) body.registrationkey = apiKey;

    // A hung request must not outlive the serverless function around it: if the
    // platform kills the invocation first, the client gets an empty body and a
    // JSON parse error instead of a readable message.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BLS_TIMEOUT_MS);

    let response: Response;
    let raw: string;
    try {
      response = await fetch(BLS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
      // Read as text, not JSON: BLS answers rate limits and block pages with
      // HTML, and an empty body is possible too. Both must become a BlsError
      // with the evidence attached, not a raw SyntaxError.
      raw = await response.text();
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new BlsError(
          `BLS did not answer within ${BLS_TIMEOUT_MS / 1000} seconds.`,
        );
      }
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new BlsError(`Could not reach the BLS API: ${detail}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      console.error(
        `[bls] HTTP ${response.status} ${response.statusText}; body starts: ${snippet(raw)}`,
      );
      throw new BlsError(
        `BLS API returned HTTP ${response.status}. Body began: ${snippet(raw)}`,
      );
    }

    let payload: BlsResponse;
    try {
      payload = JSON.parse(raw) as BlsResponse;
    } catch {
      console.error(
        `[bls] Response was not JSON. HTTP ${response.status} ${response.statusText}; ` +
          `content-type ${response.headers.get("content-type") ?? "none"}; ` +
          `body starts: ${snippet(raw)}`,
      );
      throw new BlsError(
        `BLS returned a non-JSON response (HTTP ${response.status}). Body began: ${snippet(raw)}`,
      );
    }

    if (payload.status !== "REQUEST_SUCCEEDED") {
      // BLS echoes the registration key back in this message when it is bad.
      const detail = redact(payload.message?.join(" ") ?? "no detail given");
      console.error(`[bls] ${payload.status ?? "no status"}: ${detail}`);
      throw new BlsError(`BLS API did not process the request: ${detail}`);
    }

    const returned = new Map<string, BlsSeries>();
    for (const series of payload.Results?.series ?? []) {
      if (series.seriesID) returned.set(series.seriesID, series);
    }

    // Cache every series we asked for, including ones BLS had nothing for, so a
    // gap does not burn one of the day's queries on every page load.
    const expiresAt = Date.now() + CACHE_TTL_MS;
    for (const id of batch) {
      const series = returned.get(id);
      const { value, year } = series
        ? latestAnnual(series)
        : { value: null, year: null };
      const observation: Observation = { seriesId: id, value, year };
      cache.set(id, { observation, expiresAt });
      results.set(id, observation);
    }
  }

  return results;
}

/* -------------------------------------------------------------------------- */
/* The §4.1 snapshot                                                           */
/* -------------------------------------------------------------------------- */

export interface AreaFigures {
  employment: Observation;
  medianAnnualWage: Observation;
  meanAnnualWage: Observation;
}

export interface OccupationSnapshot {
  socCode: string;
  national: AreaFigures;
  state: AreaFigures & { fips: string; name: string | null };
  metro: AreaFigures & { code: string; name: string | null };
  /** Newest year any figure carries, for the "as of" label (SPEC §6). */
  asOfYear: number | null;
  source: string;
}

/** What /api/occupation/[soc] returns — the shape the §4.1 page reads. */
export interface OccupationApiPayload {
  soc: string;
  occupation: Occupation | null;
  source: string;
  asOfYear: number | null;
  national: AreaFigures;
  state: AreaFigures & { fips: string; name: string | null };
  metro: AreaFigures & { code: string; name: string | null };
}

export interface SnapshotOptions {
  socCode: string;
  stateFips?: string;
  metroCode?: string;
}

/**
 * Employment, median annual wage and mean annual wage for the nation, one state
 * and one metro — nine series, one BLS query.
 */
export async function getOccupationSnapshot({
  socCode,
  stateFips = DEFAULT_STATE_FIPS,
  metroCode = DEFAULT_METRO_CODE,
}: SnapshotOptions): Promise<OccupationSnapshot> {
  const areas: { areaType: AreaType; areaCode: string }[] = [
    { areaType: "N", areaCode: NATIONAL_AREA_CODE },
    { areaType: "S", areaCode: stateAreaCode(stateFips) },
    { areaType: "M", areaCode: metroCode },
  ];

  const ids = areas.flatMap(({ areaType, areaCode }) =>
    Object.values(DATA_TYPE).map((dataType) =>
      buildSeriesId({ areaType, areaCode, socCode, dataType }),
    ),
  );

  const observations = await fetchSeries(ids);

  const figuresFor = (areaType: AreaType, areaCode: string): AreaFigures => {
    const pick = (dataType: DataType): Observation => {
      const id = buildSeriesId({ areaType, areaCode, socCode, dataType });
      return observations.get(id) ?? { seriesId: id, value: null, year: null };
    };
    return {
      employment: pick(DATA_TYPE.employment),
      medianAnnualWage: pick(DATA_TYPE.medianAnnualWage),
      meanAnnualWage: pick(DATA_TYPE.meanAnnualWage),
    };
  };

  const years = [...observations.values()]
    .map((o) => o.year)
    .filter((y): y is number => y !== null);

  return {
    socCode,
    national: figuresFor("N", NATIONAL_AREA_CODE),
    state: {
      ...figuresFor("S", stateAreaCode(stateFips)),
      fips: stateFips,
      name: stateName(stateFips),
    },
    metro: {
      ...figuresFor("M", metroCode),
      code: metroCode,
      name: metroName(metroCode),
    },
    asOfYear: years.length > 0 ? Math.max(...years) : null,
    source: "BLS OEWS",
  };
}

/* -------------------------------------------------------------------------- */
/* Area names                                                                  */
/* -------------------------------------------------------------------------- */

/** State FIPS codes, for the §4.1 "where they are" selector. */
export const STATES: { fips: string; name: string }[] = [
  { fips: "01", name: "Alabama" },
  { fips: "02", name: "Alaska" },
  { fips: "04", name: "Arizona" },
  { fips: "05", name: "Arkansas" },
  { fips: "06", name: "California" },
  { fips: "08", name: "Colorado" },
  { fips: "09", name: "Connecticut" },
  { fips: "10", name: "Delaware" },
  { fips: "11", name: "District of Columbia" },
  { fips: "12", name: "Florida" },
  { fips: "13", name: "Georgia" },
  { fips: "15", name: "Hawaii" },
  { fips: "16", name: "Idaho" },
  { fips: "17", name: "Illinois" },
  { fips: "18", name: "Indiana" },
  { fips: "19", name: "Iowa" },
  { fips: "20", name: "Kansas" },
  { fips: "21", name: "Kentucky" },
  { fips: "22", name: "Louisiana" },
  { fips: "23", name: "Maine" },
  { fips: "24", name: "Maryland" },
  { fips: "25", name: "Massachusetts" },
  { fips: "26", name: "Michigan" },
  { fips: "27", name: "Minnesota" },
  { fips: "28", name: "Mississippi" },
  { fips: "29", name: "Missouri" },
  { fips: "30", name: "Montana" },
  { fips: "31", name: "Nebraska" },
  { fips: "32", name: "Nevada" },
  { fips: "33", name: "New Hampshire" },
  { fips: "34", name: "New Jersey" },
  { fips: "35", name: "New Mexico" },
  { fips: "36", name: "New York" },
  { fips: "37", name: "North Carolina" },
  { fips: "38", name: "North Dakota" },
  { fips: "39", name: "Ohio" },
  { fips: "40", name: "Oklahoma" },
  { fips: "41", name: "Oregon" },
  { fips: "42", name: "Pennsylvania" },
  { fips: "44", name: "Rhode Island" },
  { fips: "45", name: "South Carolina" },
  { fips: "46", name: "South Dakota" },
  { fips: "47", name: "Tennessee" },
  { fips: "48", name: "Texas" },
  { fips: "49", name: "Utah" },
  { fips: "50", name: "Vermont" },
  { fips: "51", name: "Virginia" },
  { fips: "53", name: "Washington" },
  { fips: "54", name: "West Virginia" },
  { fips: "55", name: "Wisconsin" },
  { fips: "56", name: "Wyoming" },
];

export function stateName(fips: string): string | null {
  return STATES.find((s) => s.fips === fips)?.name ?? null;
}

/**
 * Metros the Job page offers, each with the state it belongs to so the picker
 * can filter by state. Only codes verified against the live API (SPEC §10) go
 * here; so far that is the San Luis Obispo default.
 */
export const METROS: { code: string; name: string; stateFips: string }[] = [
  { code: "0042200", name: "San Luis Obispo–Paso Robles, CA", stateFips: "06" },
];

export function metrosInState(fips: string): { code: string; name: string }[] {
  return METROS.filter((m) => m.stateFips === fips);
}

export function metroName(code: string): string | null {
  return METROS.find((m) => m.code === code)?.name ?? null;
}
