import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BLS_ENDPOINT, clearBlsCache, fetchSeries } from "./bls";
import { readCache, writeCache } from "./cache";
import { clearOnetCache, getOnetOccupation, searchOnet } from "./onet";
import { clearScorecardCache, getSchoolPrograms } from "./scorecard";

/**
 * Build 5: BLS and Scorecard answers are stored in Supabase and reused until
 * stale, and a stale answer stands in when the source is down. Supabase is a
 * small in-memory fake of its REST API; nothing here reaches the network.
 */

const SUPABASE_URL = "https://example.supabase.co";
const SECRET = "sb_secret_test_value_123";

interface StoredRow {
  key: string;
  source: string;
  payload: unknown;
  fetched_at: string;
  expires_at: string;
}

let table: Map<string, StoredRow>;
let upstream: { bls: number; scorecard: number; onet: number };
let blsUp: boolean;

const SERIES = "OEUN000000000000013205113";

function blsAnswer(ids: string[]) {
  return {
    status: "REQUEST_SUCCEEDED",
    Results: {
      series: ids.map((seriesID) => ({
        seriesID,
        data: [{ year: "2025", period: "A01", value: "102,740" }],
      })),
    },
  };
}

/** Supabase REST (select by key list, upsert) plus BLS and Scorecard. */
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (url.origin === SUPABASE_URL) {
    expect(new Headers(init?.headers).get("apikey")).toBe(SECRET);
    if (init?.method === "POST") {
      for (const row of JSON.parse(String(init.body)) as StoredRow[]) table.set(row.key, row);
      return new Response(null, { status: 201 });
    }
    const list = url.searchParams.get("key") ?? "";
    const keys = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    return json(keys.flatMap((k) => (table.has(k) ? [table.get(k)] : [])));
  }

  if (String(input) === BLS_ENDPOINT) {
    upstream.bls++;
    if (!blsUp) return new Response("<html>Service Unavailable</html>", { status: 503 });
    return json(blsAnswer(JSON.parse(String(init?.body)).seriesid));
  }

  if (url.hostname === "api-v2.onetcenter.org") {
    upstream.onet++;
    if (url.pathname.startsWith("/online/occupations/99-9999")) {
      return new Response("", { status: 404 });
    }
    return json({
      start: 1,
      end: 1,
      total: 1,
      occupation: [{ code: "29-1141.00", title: "Registered Nurses" }],
    });
  }

  if (url.hostname === "api.data.gov") {
    upstream.scorecard++;
    return json({
      results: [{ id: 110422, "school.name": "Cal Poly", "school.city": "San Luis Obispo", "school.state": "CA" }],
    });
  }

  throw new Error(`Unexpected request to ${url}`);
}

beforeEach(() => {
  table = new Map();
  upstream = { bls: 0, scorecard: 0, onet: 0 };
  blsUp = true;
  clearBlsCache();
  clearScorecardCache();
  clearOnetCache();
  vi.stubEnv("ONET_API_KEY", "onet-test-key");
  vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("SUPABASE_SECRET_KEY", SECRET);
  vi.stubEnv("SCORECARD_API_KEY", "scorecard-test-key");
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BLS through the Supabase cache", () => {
  it("stores the answer and serves a repeat lookup without calling BLS", async () => {
    const first = await fetchSeries([SERIES]);
    expect(first.get(SERIES)).toEqual({ seriesId: SERIES, value: 102740, year: 2025 });
    expect(upstream.bls).toBe(1);
    expect(table.get(`bls:${SERIES}`)?.source).toBe("BLS OEWS");

    clearBlsCache(); // a new serverless instance: memory is empty, Supabase is not
    const again = await fetchSeries([SERIES]);
    expect(again.get(SERIES)?.value).toBe(102740);
    expect(upstream.bls).toBe(1);
  });

  it("asks BLS again once the stored row is stale", async () => {
    await fetchSeries([SERIES]);
    table.get(`bls:${SERIES}`)!.expires_at = new Date(Date.now() - 1000).toISOString();
    clearBlsCache();

    await fetchSeries([SERIES]);
    expect(upstream.bls).toBe(2);
  });

  it("serves the stale row when BLS is down", async () => {
    await fetchSeries([SERIES]);
    table.get(`bls:${SERIES}`)!.expires_at = new Date(Date.now() - 1000).toISOString();
    clearBlsCache();
    blsUp = false;

    const served = await fetchSeries([SERIES]);
    expect(served.get(SERIES)?.value).toBe(102740);
    expect(upstream.bls).toBe(2);
  });

  it("still fails plainly when BLS is down and nothing is stored", async () => {
    blsUp = false;
    await expect(fetchSeries([SERIES])).rejects.toThrow(/HTTP 503/);
  });

  it("works without Supabase configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    await fetchSeries([SERIES]);
    expect(upstream.bls).toBe(1);
    expect(table.size).toBe(0);
  });
});

describe("College Scorecard through the Supabase cache", () => {
  it("serves a repeat lookup without calling Scorecard, with the original date", async () => {
    const first = await getSchoolPrograms(110422);
    expect(upstream.scorecard).toBe(1);
    const [row] = [...table.values()];
    expect(row.source).toBe("College Scorecard");
    expect(row.key).toMatch(/^scorecard:[0-9a-f]{64}$/);

    clearScorecardCache();
    const again = await getSchoolPrograms(110422);
    expect(upstream.scorecard).toBe(1);
    expect(again?.asOf).toBe(first?.asOf);
  });
});

describe("O*NET through the Supabase cache", () => {
  it("serves a repeat search without calling O*NET, for 7 days", async () => {
    const first = await searchOnet("nurse");
    expect(first.map((r) => r.soc)).toEqual(["291141"]);
    expect(upstream.onet).toBe(1);
    const [row] = [...table.values()];
    expect(row.source).toBe("O*NET Web Services");
    expect(row.key).toMatch(/^onet:[0-9a-f]{64}$/);
    const days = (Date.parse(row.expires_at) - Date.parse(row.fetched_at)) / 86_400_000;
    expect(days).toBe(7);

    clearOnetCache();
    expect(await searchOnet("nurse")).toEqual(first);
    expect(upstream.onet).toBe(1);
  });

  it("caches a 404 too, so a missing occupation is not asked for again", async () => {
    expect(await getOnetOccupation("999999")).toBeNull();
    clearOnetCache();
    expect(await getOnetOccupation("999999")).toBeNull();
    expect(upstream.onet).toBe(1);
  });
});

describe("cache plumbing", () => {
  it("never puts the secret key in a log line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`bad key ${SECRET}`, { status: 401 })),
    );
    await writeCache("BLS OEWS", [{ key: "bls:x", payload: 1 }], 1000);
    expect(await readCache(["bls:x"])).toEqual(new Map());

    const logged = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(logged).toContain("HTTP 401");
    expect(logged).not.toContain(SECRET);
  });
});
