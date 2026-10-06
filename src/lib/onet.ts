/**
 * O*NET Web Services v2 client — maps a typed job title to SOC codes (SPEC §10:
 * "Use O*NET's title crosswalk first"), so the Job page is no longer limited to
 * the seed table in occupations.ts.
 *
 * Verified with live calls on Oct 5, 2026:
 *
 *   GET https://api-v2.onetcenter.org/online/search?keyword=nurse&start=1&end=5
 *   Headers: X-API-Key: <ONET_API_KEY>, Accept: application/json
 *   200 → { start: 1, end: 5, total: 119, next: "<url>",
 *           occupation: [{ href, code: "29-1141.00", title: "Registered Nurses",
 *                          tags: { bright_outlook: true } }, …] }
 *   No match → 200 { start: 1, end: 0, total: 0, occupation: [] }
 *   Missing keyword → 422 { error: "must have required property 'keyword'" }
 *   Bad key → 403 with an nginx HTML page, not JSON.
 *
 *   GET https://api-v2.onetcenter.org/online/occupations/15-1299.00/
 *   200 → { code, title: "Computer Occupations, All Other", description, … }
 *   Every six-digit parent checked (15-1299, 29-1141, 13-1023) has a ".00" entry.
 *
 * O*NET-SOC codes are "13-2051.00"; BLS OEWS indexes by the six-digit SOC
 * "132051". A suffix other than ".00" (e.g. 15-1299.08, Computer Systems
 * Engineers/Architects) is an O*NET-only breakdown that BLS does not survey, so
 * its wages come from the six-digit parent and the UI says so.
 *
 * Same contract as bls.ts: an 8 s timeout, the key redacted from everything
 * logged or returned, and a 24-hour in-process cache.
 */

import type { Occupation } from "./occupations";

export const ONET_BASE = "https://api-v2.onetcenter.org/";

/** Same headroom reasoning as BLS_TIMEOUT_MS in bls.ts. */
export const ONET_TIMEOUT_MS = 8_000;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** How many search results to ask for; the picker shows them under the seeds. */
export const ONET_SEARCH_LIMIT = 10;

export class OnetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnetError";
  }
}

/** Strips the API key out of anything we log or return. */
function redact(text: string): string {
  const key = process.env.ONET_API_KEY;
  if (!key) return text;
  return text.split(key).join("<redacted key>");
}

/** First 300 characters of a response body, for logs and error messages. */
function snippet(body: string): string {
  const flat = redact(body).replace(/\s+/g, " ").trim();
  if (flat === "") return "(empty body)";
  return flat.length > 300 ? `${flat.slice(0, 300)}…` : flat;
}

/* -------------------------------------------------------------------------- */
/* Codes                                                                       */
/* -------------------------------------------------------------------------- */

/** "13-2051.00" → "132051"; null for anything not shaped like an O*NET-SOC code. */
export function onetToSoc(code: string): string | null {
  const match = /^(\d{2})-(\d{4})\.\d{2}$/.exec(code);
  return match ? `${match[1]}${match[2]}` : null;
}

/** "132051" → "13-2051.00", the O*NET entry for the six-digit SOC itself. */
export function socToOnet(soc: string): string {
  return `${soc.slice(0, 2)}-${soc.slice(2)}.00`;
}

/** True for O*NET-only breakdowns like 15-1299.08 that BLS does not survey. */
export function isDetailedOnetCode(code: string): boolean {
  return !code.endsWith(".00");
}

/* -------------------------------------------------------------------------- */
/* Fetching                                                                    */
/* -------------------------------------------------------------------------- */

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test and debug hook — there is no other way to empty a module-level Map. */
export function clearOnetCache(): void {
  cache.clear();
}

/**
 * GET a path under ONET_BASE and parse the JSON. Returns null on 404 (no such
 * occupation). Throws OnetError for everything else that is not a 200 with a
 * JSON body. Successful answers, including 404s, are cached for 24 hours.
 */
async function onetGet(path: string): Promise<unknown> {
  const hit = cache.get(path);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const apiKey = process.env.ONET_API_KEY;
  if (!apiKey) {
    throw new OnetError(
      "Job title search is not set up on this server (ONET_API_KEY is missing).",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ONET_TIMEOUT_MS);

  let response: Response;
  let raw: string;
  try {
    response = await fetch(`${ONET_BASE}${path}`, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    raw = await response.text();
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new OnetError(
        `O*NET did not answer within ${ONET_TIMEOUT_MS / 1000} seconds.`,
      );
    }
    const detail = redact(cause instanceof Error ? cause.message : String(cause));
    throw new OnetError(`Could not reach O*NET: ${detail}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    cache.set(path, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }

  if (response.status === 401 || response.status === 403) {
    console.error(`[onet] HTTP ${response.status}; body starts: ${snippet(raw)}`);
    throw new OnetError(
      `O*NET refused the request (HTTP ${response.status}). The API key may be wrong or expired.`,
    );
  }

  if (!response.ok) {
    console.error(
      `[onet] HTTP ${response.status} ${response.statusText}; body starts: ${snippet(raw)}`,
    );
    throw new OnetError(
      `O*NET returned HTTP ${response.status}. Body began: ${snippet(raw)}`,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    console.error(
      `[onet] Response was not JSON. HTTP ${response.status}; ` +
        `content-type ${response.headers.get("content-type") ?? "none"}; ` +
        `body starts: ${snippet(raw)}`,
    );
    throw new OnetError(
      `O*NET returned a non-JSON response (HTTP ${response.status}). Body began: ${snippet(raw)}`,
    );
  }

  cache.set(path, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

/** One row of the search answer, as O*NET sends it. */
export interface RawSearchOccupation {
  code?: string;
  title?: string;
}

export interface OnetSearchResult {
  /** O*NET-SOC code, e.g. "29-1141.03". */
  code: string;
  title: string;
  /** Six digits, no hyphen — what BLS wants. */
  soc: string;
  /**
   * Set when `code` is an O*NET-only breakdown: the six-digit group BLS
   * publishes wages for. `title` is null if O*NET could not name it.
   */
  broaderGroup: { soc: string; title: string | null } | null;
}

/** What /api/occupations/search returns. */
export interface OccupationSearchPayload {
  query: string;
  /** "O*NET Web Services". */
  source: string;
  results: OnetSearchResult[];
}

/**
 * Rows from an O*NET search answer that carry a usable code and title, in
 * O*NET's relevance order. Broader-group titles are filled in from rows in the
 * same answer where possible; the rest are left for `searchOnet` to look up.
 */
export function toSearchResults(payload: unknown): OnetSearchResult[] {
  const rows =
    typeof payload === "object" && payload !== null && "occupation" in payload
      ? (payload as { occupation?: unknown }).occupation
      : undefined;
  if (!Array.isArray(rows)) return [];

  const titles = new Map<string, string>();
  const results: OnetSearchResult[] = [];
  for (const row of rows as RawSearchOccupation[]) {
    const code = row?.code;
    const title = row?.title?.trim();
    if (typeof code !== "string" || !title) continue;
    const soc = onetToSoc(code);
    if (soc === null) continue;
    if (!isDetailedOnetCode(code)) titles.set(soc, title);
    results.push({
      code,
      title,
      soc,
      broaderGroup: isDetailedOnetCode(code) ? { soc, title: null } : null,
    });
  }

  for (const result of results) {
    if (result.broaderGroup) {
      result.broaderGroup.title = titles.get(result.soc) ?? null;
    }
  }
  return results;
}

/**
 * The top O*NET matches for a typed title. Broader-group titles missing from
 * the answer are looked up one occupation at a time (cached); a failed lookup
 * leaves the title null rather than failing the search.
 */
export async function searchOnet(keyword: string): Promise<OnetSearchResult[]> {
  const params = new URLSearchParams({
    keyword,
    start: "1",
    end: String(ONET_SEARCH_LIMIT),
  });
  const results = toSearchResults(await onetGet(`online/search?${params}`));

  const missing = [
    ...new Set(
      results
        .filter((r) => r.broaderGroup && r.broaderGroup.title === null)
        .map((r) => r.soc),
    ),
  ];
  const named = new Map<string, string | null>(
    await Promise.all(
      missing.map(
        async (soc) =>
          [soc, (await getOnetOccupation(soc).catch(() => null))?.title ?? null] as const,
      ),
    ),
  );
  for (const result of results) {
    if (result.broaderGroup && result.broaderGroup.title === null) {
      result.broaderGroup.title = named.get(result.soc) ?? null;
    }
  }
  return results;
}

/* -------------------------------------------------------------------------- */
/* One occupation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The O*NET entry for a six-digit SOC ("<soc>.00"): title and one-paragraph
 * description, labelled with O*NET as the source. Null when O*NET has no such
 * entry.
 */
export async function getOnetOccupation(soc: string): Promise<Occupation | null> {
  if (!/^\d{6}$/.test(soc)) return null;
  const payload = await onetGet(`online/occupations/${socToOnet(soc)}/`);
  if (typeof payload !== "object" || payload === null) return null;
  const { title, description } = payload as {
    title?: unknown;
    description?: unknown;
  };
  if (typeof title !== "string" || title.trim() === "") return null;
  return {
    soc,
    title: title.trim(),
    description: typeof description === "string" ? description.trim() : "",
    descriptionSource: "O*NET OnLine",
  };
}
