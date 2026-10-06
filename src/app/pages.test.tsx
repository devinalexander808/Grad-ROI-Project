// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AreaFigures, OccupationApiPayload } from "@/lib/bls";
import CalculatorPage from "./calculator/page";
import JobPage from "./job/page";
import StartPage from "./page";

/**
 * Build 5 page tests: the main pages render, and when a data source is down or
 * returns nothing they say so plainly while the rest of the page keeps
 * working. `fetch` is replaced per test, so nothing here calls a real API.
 */

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function figures(employment: number | null, median: number | null, mean: number | null): AreaFigures {
  const year = employment === null && median === null && mean === null ? null : 2025;
  return {
    employment: { seriesId: "e", value: employment, year },
    medianAnnualWage: { seriesId: "m", value: median, year },
    meanAnnualWage: { seriesId: "a", value: mean, year },
  };
}

/** Financial analysts, as verified in SPEC §10. */
const FINANCIAL_ANALYST: OccupationApiPayload = {
  soc: "132051",
  occupation: {
    soc: "132051",
    title: "Financial analyst",
    description: "Evaluates investments, budgets and business performance to guide money decisions.",
  },
  source: "BLS OEWS",
  asOfYear: 2025,
  national: figures(361980, 102740, 116800),
  state: { ...figures(45380, 109110, 125070), fips: "06", name: "California" },
  metro: {
    ...figures(null, 102970, null),
    code: "0042020",
    name: "San Luis Obispo–Paso Robles, CA",
  },
};

const NOTHING_PUBLISHED: OccupationApiPayload = {
  ...FINANCIAL_ANALYST,
  asOfYear: null,
  national: figures(null, null, null),
  state: { ...figures(null, null, null), fips: "06", name: "California" },
  metro: { ...figures(null, null, null), code: "0042020", name: null },
};

/** What the occupation route returns when BLS is down (route.ts, 502). */
const BLS_DOWN = { error: "BLS did not answer within 8 seconds.", source: "BLS OEWS" };

/** Answers /api/occupation/* with the given status and body. */
function stubOccupationApi(status: number, body: unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/occupation/")) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: `Unexpected ${url}` }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Job page", () => {
  it("renders the figures, labelled latest available with their year", async () => {
    stubOccupationApi(200, FINANCIAL_ANALYST);
    render(<JobPage />);

    expect(
      await screen.findByText(/Source: BLS OEWS, latest available, 2025\./),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The job right now" })).toBeTruthy();
    expect(screen.getByText("$109,110")).toBeTruthy();
  });

  it("says the data isn't available when BLS is down, and the page still works", async () => {
    stubOccupationApi(502, BLS_DOWN);
    render(<JobPage />);

    expect(
      await screen.findByRole("heading", { name: "This data isn’t available right now" }),
    ).toBeTruthy();
    expect(screen.getByText(/BLS did not answer within 8 seconds/)).toBeTruthy();
    // The rest of the page is still usable.
    expect(screen.getByRole("combobox", { name: "The job you want" })).toBeTruthy();
    expect((screen.getByLabelText("Your state") as HTMLSelectElement).disabled).toBe(false);
  });

  it("says so plainly when BLS returns nothing for the job", async () => {
    stubOccupationApi(200, NOTHING_PUBLISHED);
    render(<JobPage />);

    expect(
      await screen.findByRole("heading", { name: "No BLS figures for this occupation" }),
    ).toBeTruthy();
  });
});

describe("Start screen", () => {
  it("renders the three steps with the BLS median, labelled latest available", async () => {
    stubOccupationApi(200, FINANCIAL_ANALYST);
    render(<StartPage />);

    expect(await screen.findByText("Where are you now")).toBeTruthy();
    expect(screen.getByText("What job do you want")).toBeTruthy();
    expect(screen.getByText("What program are you considering")).toBeTruthy();
    expect(
      await screen.findByText(/BLS OEWS state median, latest available, 2025\./),
    ).toBeTruthy();
  });

  it("keeps working when BLS is down", async () => {
    stubOccupationApi(502, BLS_DOWN);
    render(<StartPage />);

    expect(
      await screen.findByText(/This data isn’t available right now/),
    ).toBeTruthy();
    // The rest of the screen still works: entering a salary unlocks the
    // calculator link, with no BLS figure needed.
    expect(screen.queryByRole("link", { name: /See if it pays off/ })).toBeNull();
    fireEvent.change(screen.getByLabelText(/Current salary/), {
      target: { value: "62000" },
    });
    expect(screen.getByRole("link", { name: /See if it pays off/ })).toBeTruthy();
  });
});

describe("Calculator", () => {
  it("renders results from the default inputs without any network call", () => {
    const fetchMock = stubOccupationApi(502, BLS_DOWN);
    render(<CalculatorPage />);

    expect(screen.getByRole("heading", { name: "ROI calculator" })).toBeTruthy();
    expect(screen.getByText(/This program pays off within 10 years/)).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Scenario" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
