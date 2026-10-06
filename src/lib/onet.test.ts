import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OnetError,
  clearOnetCache,
  isDetailedOnetCode,
  onetToSoc,
  searchOnet,
  socToOnet,
  toSearchResults,
} from "./onet";

/** Trimmed from a live search for "nurse" (Oct 5, 2026), plus 15-1299.08. */
const NURSE_SEARCH = {
  start: 1,
  end: 4,
  total: 119,
  occupation: [
    { code: "29-2061.00", title: "Licensed Practical and Licensed Vocational Nurses" },
    { code: "29-1141.00", title: "Registered Nurses" },
    { code: "29-1141.03", title: "Critical Care Nurses" },
    { code: "15-1299.08", title: "Computer Systems Engineers/Architects" },
  ],
};

describe("O*NET codes", () => {
  it("strips the hyphen and the .xx suffix for BLS", () => {
    expect(onetToSoc("13-2051.00")).toBe("132051");
    expect(onetToSoc("15-1299.08")).toBe("151299");
  });

  it("rejects anything not shaped like an O*NET-SOC code", () => {
    expect(onetToSoc("132051")).toBeNull();
    expect(onetToSoc("13-2051")).toBeNull();
    expect(onetToSoc("")).toBeNull();
  });

  it("round-trips a six-digit SOC to its .00 entry", () => {
    expect(socToOnet("291141")).toBe("29-1141.00");
  });

  it("treats only .00 codes as the BLS occupation itself", () => {
    expect(isDetailedOnetCode("29-1141.00")).toBe(false);
    expect(isDetailedOnetCode("29-1141.03")).toBe(true);
  });
});

describe("toSearchResults", () => {
  it("maps rows to SOC codes and names the broader group from the same answer", () => {
    const results = toSearchResults(NURSE_SEARCH);
    expect(results.map((r) => r.soc)).toEqual([
      "292061",
      "291141",
      "291141",
      "151299",
    ]);
    expect(results[1].broaderGroup).toBeNull();
    expect(results[2].broaderGroup).toEqual({
      soc: "291141",
      title: "Registered Nurses",
    });
    // Its parent is not in this answer, so searchOnet has to look it up.
    expect(results[3].broaderGroup).toEqual({ soc: "151299", title: null });
  });

  it("returns an empty list for no match or a malformed answer", () => {
    expect(toSearchResults({ start: 1, end: 0, total: 0, occupation: [] })).toEqual([]);
    expect(toSearchResults(null)).toEqual([]);
    expect(toSearchResults({ occupation: [{ code: "bad", title: "x" }] })).toEqual([]);
  });
});

describe("searchOnet", () => {
  const KEY = "test-onet-key-123";

  beforeEach(() => {
    clearOnetCache();
    vi.stubEnv("ONET_API_KEY", KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("looks up a missing broader-group title, then serves repeats from cache", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("online/search")) {
        return new Response(JSON.stringify(NURSE_SEARCH), { status: 200 });
      }
      if (url.includes("online/occupations/15-1299.00/")) {
        return new Response(
          JSON.stringify({ code: "15-1299.00", title: "Computer Occupations, All Other" }),
          { status: 200 },
        );
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchOnet("nurse");
    expect(results[3].broaderGroup?.title).toBe("Computer Occupations, All Other");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await searchOnet("nurse");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("turns a rejected key into a readable error that never contains the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`<html>403 Forbidden ${KEY}</html>`, { status: 403 })),
    );
    const error = await searchOnet("nurse").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OnetError);
    expect((error as Error).message).toMatch(/HTTP 403/);
    expect((error as Error).message).not.toContain(KEY);
  });

  it("says so plainly when the server has no key", async () => {
    vi.stubEnv("ONET_API_KEY", "");
    await expect(searchOnet("nurse")).rejects.toThrow(/ONET_API_KEY is missing/);
  });
});
