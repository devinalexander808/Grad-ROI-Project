/**
 * Supabase cache for upstream API answers — PLAN.md Build 5, SPEC §7 ("Cache
 * every external response with a timestamp") and §10 ("API limits or outages
 * during a demo").
 *
 * One table, `api_cache` (supabase/migrations/20261006_api_cache.sql), read
 * and written through Supabase's REST API with plain fetch; no client library.
 * Server only: SUPABASE_SECRET_KEY bypasses row level security and must never
 * reach the browser.
 *
 * The cache is a help, never a requirement. Without SUPABASE_URL and
 * SUPABASE_SECRET_KEY, before the table exists, or while Supabase is down,
 * every read comes back empty and every write is skipped, and the clients fall
 * back to their in-process caches and the live APIs.
 */

const TABLE = "api_cache";

/** Supabase sits on the request path, so it gets far less time than BLS. */
const CACHE_TIMEOUT_MS = 3_000;

export interface CachedAnswer {
  payload: unknown;
  /** When the upstream API was called. */
  fetchedAt: Date;
  /** True when the row is past its expiry and only served because the source is down. */
  stale: boolean;
}

interface Config {
  url: string;
  key: string;
}

function config(): Config | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

function redact(text: string): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  return key ? text.split(key).join("<redacted key>") : text;
}

/** Each distinct failure is logged once per process, not on every request. */
const warned = new Set<string>();
function warnOnce(what: string, detail: string): void {
  const line = `[cache] ${what}: ${redact(detail).replace(/\s+/g, " ").slice(0, 300)}`;
  if (warned.has(line)) return;
  warned.add(line);
  console.warn(line);
}

async function call(
  cfg: Config,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CACHE_TIMEOUT_MS);
  try {
    return await fetch(`${cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: cfg.key,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

interface Row {
  key: string;
  payload: unknown;
  fetched_at: string;
  expires_at: string;
}

/**
 * Cached answers for the given keys. Fresh rows only, unless `allowStale` —
 * used once the upstream API has failed, to show the latest answer we have.
 */
export async function readCache(
  keys: string[],
  { allowStale = false }: { allowStale?: boolean } = {},
): Promise<Map<string, CachedAnswer>> {
  const found = new Map<string, CachedAnswer>();
  const cfg = config();
  if (cfg === null || keys.length === 0) return found;

  // PostgREST list filter: in.("a","b"). Keys are series IDs and hex hashes,
  // but quote and escape anyway.
  const list = keys.map((k) => `"${k.replace(/["\\]/g, "\\$&")}"`).join(",");
  const params = new URLSearchParams({
    select: "key,payload,fetched_at,expires_at",
    key: `in.(${list})`,
  });

  try {
    const response = await call(cfg, `${TABLE}?${params}`, { method: "GET" });
    const raw = await response.text();
    if (!response.ok) {
      warnOnce(`read failed (HTTP ${response.status})`, raw);
      return found;
    }
    const now = Date.now();
    for (const row of JSON.parse(raw) as Row[]) {
      const stale = Date.parse(row.expires_at) <= now;
      if (stale && !allowStale) continue;
      found.set(row.key, {
        payload: row.payload,
        fetchedAt: new Date(row.fetched_at),
        stale,
      });
    }
  } catch (cause) {
    warnOnce("read failed", cause instanceof Error ? cause.message : String(cause));
  }
  return found;
}

/** Stores answers, replacing any older row with the same key. Never throws. */
export async function writeCache(
  source: string,
  entries: { key: string; payload: unknown }[],
  ttlMs: number,
  fetchedAt: Date = new Date(),
): Promise<void> {
  const cfg = config();
  if (cfg === null || entries.length === 0) return;

  const rows: Row[] = entries.map(({ key, payload }) => ({
    key,
    payload,
    fetched_at: fetchedAt.toISOString(),
    expires_at: new Date(fetchedAt.getTime() + ttlMs).toISOString(),
  }));

  try {
    const response = await call(cfg, TABLE, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.map((r) => ({ ...r, source }))),
    });
    if (!response.ok) {
      warnOnce(`write failed (HTTP ${response.status})`, await response.text());
    }
  } catch (cause) {
    warnOnce("write failed", cause instanceof Error ? cause.message : String(cause));
  }
}
