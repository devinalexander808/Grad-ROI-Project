/**
 * College Scorecard client — SPEC.md Appendix A3.
 *
 * Two calls, both against the schools endpoint:
 *
 * - school search by name (`school.name` is a fuzzy match: "Cal Poly", "UCLA"
 *   and "san luis obispo" all work), and
 * - one school's programs, nested (`all_programs_nested=true`), asking only
 *   for the program subfields we use. A whole school is about 40 KB that way.
 *
 * Verified Oct 3, 2026 against Cal Poly SLO (id 110422). The live numbers have
 * moved on from the A3 reference values: CIP 5213 master's now reports a
 * 1-year median of $96,886 (n=26), not $73,268 (n=18). Debt is unchanged:
 * median suppressed, average $30,820 (n=18).
 *
 * What Scorecard does not have, so the UI never pretends it does:
 * - Graduate tuition. `latest.cost.tuition` is the school's undergraduate
 *   sticker price; there is no per-program or graduate figure.
 * - Cohort years for program data. Programs exist only under `latest`, and
 *   the response carries no year, so figures are labelled with the release
 *   ("latest available") and the date we retrieved it.
 *
 * Rate limit is 1,000 requests per hour per key. Responses are cached in
 * process memory for 24 hours and in Supabase for 30 days (cache.ts, Build 5;
 * SPEC A3: "refresh monthly"). When Scorecard is down, a stale Supabase row is
 * served rather than nothing.
 */

import { createHash } from "node:crypto";
import { readCache, writeCache } from "./cache";

export const SCORECARD_ENDPOINT =
  "https://api.data.gov/ed/collegescorecard/v1/schools";

export const SCORECARD_SOURCE = "College Scorecard";

/** Same reasoning as BLS_TIMEOUT_MS: stay under Vercel's 10s function limit. */
export const SCORECARD_TIMEOUT_MS = 8_000;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** How long a Supabase row counts as fresh (SPEC A3: refresh monthly). */
const STORE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The query string, hashed: it holds school names, commas and quotes. */
function storeKey(search: string): string {
  return `scorecard:${createHash("sha256").update(search).digest("hex")}`;
}
/** A3: "credential.level … treat ≥ 5 as graduate". */
export const GRADUATE_LEVEL = 5;

/* -------------------------------------------------------------------------- */
/* What the app sees                                                           */
/* -------------------------------------------------------------------------- */

export interface SchoolMatch {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
}

/**
 * A3 confidence ladder. "Your input" is not here: that label belongs to the
 * page, for numbers the user typed.
 */
export type Confidence = "High" | "Medium" | "Low";

/** One Scorecard figure, or an honest blank. */
export interface Figure {
  /** Null means Scorecard has nothing usable; `note` says why. */
  value: number | null;
  confidence: Confidence | null;
  /** Plain language: what the number is, or why it is missing. */
  note: string;
}

export interface ProgramFigures {
  /** 4-digit CIP code, e.g. "5213". */
  code: string;
  /** "Management Sciences and Quantitative Methods" (trailing period dropped). */
  title: string;
  credentialLevel: number;
  /** "Master's Degree". */
  credentialTitle: string;
  /** Median earnings one year after completion → default S1. */
  firstYearEarnings: Figure;
  /** Federal loan debt at completion (Stafford + Grad PLUS) → default B. */
  typicalDebt: Figure;
  /** Always blank today; see the module comment. */
  tuition: Figure;
}

export interface SchoolPrograms {
  school: SchoolMatch;
  /** Graduate programs only, sorted by title then credential. */
  programs: ProgramFigures[];
  source: string;
  /** "latest available, retrieved Oct 2026" — when this response was fetched. */
  asOf: string;
}

/* -------------------------------------------------------------------------- */
/* Raw response shapes (only the fields we request)                            */
/* -------------------------------------------------------------------------- */

export interface RawProgram {
  code?: string;
  title?: string;
  credential?: { level?: number | null; title?: string | null };
  earnings?: {
    "1_yr"?: {
      overall_median_earnings?: number | null;
      working_not_enrolled?: { overall_count?: number | null };
    };
  };
  debt?: {
    staff_grad_plus?: {
      all?: {
        eval_inst?: {
          count?: number | null;
          median?: number | null;
          average?: number | null;
        };
      };
    };
  };
}

const PROGRAM_PREFIX = "latest.programs.cip_4_digit";

const PROGRAM_FIELDS = [
  "code",
  "title",
  "credential.level",
  "credential.title",
  "earnings.1_yr.overall_median_earnings",
  "earnings.1_yr.working_not_enrolled.overall_count",
  "debt.staff_grad_plus.all.eval_inst.count",
  "debt.staff_grad_plus.all.eval_inst.median",
  "debt.staff_grad_plus.all.eval_inst.average",
].map((f) => `${PROGRAM_PREFIX}.${f}`);

/* -------------------------------------------------------------------------- */
/* The ladder (pure, tested)                                                   */
/* -------------------------------------------------------------------------- */

function usable(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function cleanTitle(title: string | undefined): string {
  return (title ?? "Untitled program").trim().replace(/\.$/, "");
}

/**
 * First-year earnings for one program, by A3 ladder levels 1 and 2:
 *
 * 1. This program at this school: High when the cohort count is published,
 *    Medium when the median is there but its count is suppressed.
 * 2. The same CIP field at this school at another graduate credential level
 *    (≥ 5): Medium, and the note names which credential it came from. A
 *    bachelor's or lower figure is never a stand-in for a graduate program;
 *    it understates graduate pay.
 *
 * Level 3 (peer schools) is not built yet. Level 4 is the BLS median, which
 * the calculator already has, so a blank here means "fall back to BLS".
 */
export function pickEarnings(program: RawProgram, siblings: RawProgram[]): Figure {
  const own = program.earnings?.["1_yr"];
  if (usable(own?.overall_median_earnings)) {
    const n = own.working_not_enrolled?.overall_count;
    return usable(n)
      ? {
          value: own.overall_median_earnings,
          confidence: "High",
          note: `Median pay one year after finishing, ${n} graduates.`,
        }
      : {
          value: own.overall_median_earnings,
          confidence: "Medium",
          note: "Median pay one year after finishing; the number of graduates is not published.",
        };
  }

  const fallback = siblings
    .filter(
      (s) =>
        s.code === program.code &&
        (s.credential?.level ?? 0) >= GRADUATE_LEVEL &&
        s.credential?.level !== program.credential?.level &&
        usable(s.earnings?.["1_yr"]?.overall_median_earnings),
    )
    // Closest credential level first: a doctorate is a better stand-in for a
    // master's than a certificate is.
    .sort(
      (a, b) =>
        Math.abs((a.credential?.level ?? 0) - (program.credential?.level ?? 0)) -
        Math.abs((b.credential?.level ?? 0) - (program.credential?.level ?? 0)),
    )[0];

  if (fallback) {
    const credential = fallback.credential?.title ?? "another credential";
    return {
      value: fallback.earnings?.["1_yr"]?.overall_median_earnings ?? null,
      confidence: "Medium",
      note: `Not reported for this program, so this is the ${credential} in the same field at this school.`,
    };
  }

  return {
    value: null,
    confidence: null,
    note: "No first-year pay data for this program, usually because too few graduates received federal aid.",
  };
}

/**
 * Typical federal loan debt at completion. The median is preferred; A3 notes
 * the median can be suppressed while the average is present, so the average
 * is used then, labelled as such and one step down in confidence.
 */
export function pickDebt(program: RawProgram): Figure {
  const debt = program.debt?.staff_grad_plus?.all?.eval_inst;
  const n = debt?.count;
  if (usable(debt?.median)) {
    return usable(n)
      ? {
          value: debt.median,
          confidence: "High",
          note: `Median federal loan debt at graduation, ${n} borrowers.`,
        }
      : {
          value: debt.median,
          confidence: "Medium",
          note: "Median federal loan debt at graduation; the number of borrowers is not published.",
        };
  }
  if (usable(debt?.average)) {
    return {
      value: debt.average,
      confidence: "Medium",
      note: usable(n)
        ? `Average federal loan debt at graduation, ${n} borrowers (the median is not published).`
        : "Average federal loan debt at graduation (the median is not published).",
    };
  }
  return {
    value: null,
    confidence: null,
    note: "Not reported for this program.",
  };
}

const NO_TUITION: Figure = {
  value: null,
  confidence: null,
  note: "College Scorecard doesn’t report graduate tuition. Check the program’s own website.",
};

/** Graduate programs at one school, each with its figures picked. */
export function summarizePrograms(raw: RawProgram[]): ProgramFigures[] {
  return raw
    .filter(
      (p) =>
        typeof p.code === "string" &&
        (p.credential?.level ?? 0) >= GRADUATE_LEVEL,
    )
    .map((p) => ({
      code: p.code as string,
      title: cleanTitle(p.title),
      credentialLevel: p.credential?.level ?? GRADUATE_LEVEL,
      credentialTitle: p.credential?.title ?? "Graduate credential",
      firstYearEarnings: pickEarnings(p, raw),
      typicalDebt: pickDebt(p),
      tuition: NO_TUITION,
    }))
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title) || a.credentialLevel - b.credentialLevel,
    );
}

/** "latest available, retrieved Oct 2026". */
export function asOfLabel(retrieved: Date): string {
  const month = retrieved.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  return `latest available, retrieved ${month} ${retrieved.getUTCFullYear()}`;
}

/* -------------------------------------------------------------------------- */
/* Fetching                                                                    */
/* -------------------------------------------------------------------------- */

export class ScorecardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScorecardError";
  }
}

/** The key rides in the query string, so it must never reach logs or the browser. */
function redact(text: string): string {
  const key = process.env.SCORECARD_API_KEY;
  if (!key) return text;
  return text.split(key).join("<redacted key>");
}

function snippet(body: string): string {
  const flat = redact(body).replace(/\s+/g, " ").trim();
  if (flat === "") return "(empty body)";
  return flat.length > 300 ? `${flat.slice(0, 300)}…` : flat;
}

interface CacheEntry {
  value: unknown;
  fetchedAt: Date;
  expiresAt: number;
}

interface Answer<Row> {
  results: Row[];
  /** When the API was actually called, not when the cache served it. */
  fetchedAt: Date;
}

const cache = new Map<string, CacheEntry>();

/** Test and debug hook. */
export function clearScorecardCache(): void {
  cache.clear();
}

interface ScorecardResponse<Row> {
  results?: Row[];
  error?: { message?: string };
  errors?: { message?: string }[];
}

async function query<Row>(params: Record<string, string>): Promise<Answer<Row>> {
  const apiKey = process.env.SCORECARD_API_KEY;
  if (!apiKey) {
    throw new ScorecardError(
      "SCORECARD_API_KEY is not set, so program data can’t be looked up.",
    );
  }

  const url = new URL(SCORECARD_ENDPOINT);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const cacheKey = url.search;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return { results: hit.value as Row[], fetchedAt: hit.fetchedAt };
  }

  const remember = (results: Row[], fetchedAt: Date): Answer<Row> => {
    cache.set(cacheKey, {
      value: results,
      fetchedAt,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return { results, fetchedAt };
  };

  const key = storeKey(cacheKey);
  const stored = (await readCache([key])).get(key);
  if (stored && Array.isArray(stored.payload)) {
    return remember(stored.payload as Row[], stored.fetchedAt);
  }

  try {
    const answer = await queryLive<Row>(url, apiKey);
    await writeCache("College Scorecard", [{ key, payload: answer.results }], STORE_TTL_MS, answer.fetchedAt);
    return remember(answer.results, answer.fetchedAt);
  } catch (cause) {
    if (!(cause instanceof ScorecardError)) throw cause;
    // Scorecard is down: the latest stored answer beats none. Its retrieval
    // date travels with it, so the "as of" label stays honest.
    const stale = (await readCache([key], { allowStale: true })).get(key);
    if (!stale || !Array.isArray(stale.payload)) throw cause;
    console.warn(`[scorecard] ${cause.message} Serving a stored answer instead.`);
    return remember(stale.payload as Row[], stale.fetchedAt);
  }
}

/** One live request to College Scorecard. */
async function queryLive<Row>(url: URL, apiKey: string): Promise<Answer<Row>> {
  url = new URL(url);

  url.searchParams.set("api_key", apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCORECARD_TIMEOUT_MS);

  let response: Response;
  let raw: string;
  try {
    response = await fetch(url, { cache: "no-store", signal: controller.signal });
    raw = await response.text();
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new ScorecardError(
        `College Scorecard did not answer within ${SCORECARD_TIMEOUT_MS / 1000} seconds.`,
      );
    }
    const detail = redact(cause instanceof Error ? cause.message : String(cause));
    throw new ScorecardError(`Could not reach College Scorecard: ${detail}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    console.error(`[scorecard] HTTP ${response.status}; body starts: ${snippet(raw)}`);
    throw new ScorecardError(
      response.status === 429
        ? "College Scorecard’s hourly request limit was reached. Try again later."
        : `College Scorecard returned HTTP ${response.status}.`,
    );
  }

  let payload: ScorecardResponse<Row>;
  try {
    payload = JSON.parse(raw) as ScorecardResponse<Row>;
  } catch {
    console.error(`[scorecard] Response was not JSON; body starts: ${snippet(raw)}`);
    throw new ScorecardError("College Scorecard returned a response that isn’t JSON.");
  }

  return { results: payload.results ?? [], fetchedAt: new Date() };
}

interface RawSchoolRow {
  id?: number;
  "school.name"?: string;
  "school.city"?: string | null;
  "school.state"?: string | null;
  [PROGRAM_PREFIX]?: RawProgram[];
}

function toSchool(row: RawSchoolRow): SchoolMatch | null {
  if (typeof row.id !== "number" || !row["school.name"]) return null;
  return {
    id: row.id,
    name: row["school.name"],
    city: row["school.city"] ?? null,
    state: row["school.state"] ?? null,
  };
}

/** Up to 8 schools whose name matches, largest first. */
export async function searchSchools(name: string): Promise<SchoolMatch[]> {
  const { results: rows } = await query<RawSchoolRow>({
    "school.name": name,
    fields: "id,school.name,school.city,school.state",
    sort: "latest.student.size:desc",
    per_page: "8",
  });
  return rows.map(toSchool).filter((s): s is SchoolMatch => s !== null);
}

/** One school's graduate programs, or null when the id matches no school. */
export async function getSchoolPrograms(id: number): Promise<SchoolPrograms | null> {
  const { results: rows, fetchedAt } = await query<RawSchoolRow>({
    id: String(id),
    fields: ["id", "school.name", "school.city", "school.state", ...PROGRAM_FIELDS].join(","),
    all_programs_nested: "true",
  });
  const row = rows[0];
  const school = row ? toSchool(row) : null;
  if (!row || !school) return null;

  return {
    school,
    programs: summarizePrograms(row[PROGRAM_PREFIX] ?? []),
    source: SCORECARD_SOURCE,
    asOf: asOfLabel(fetchedAt),
  };
}
