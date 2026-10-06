import { describe, expect, it } from "vitest";
import {
  asOfLabel,
  pickDebt,
  pickEarnings,
  summarizePrograms,
  type RawProgram,
} from "./scorecard";

/**
 * Fixtures are trimmed from live Cal Poly SLO responses (id 110422, Oct 3,
 * 2026), with only the fields the client requests.
 */

const MSQM_MASTERS: RawProgram = {
  code: "5213",
  title: "Management Sciences and Quantitative Methods.",
  credential: { level: 5, title: "Master's Degree" },
  earnings: {
    "1_yr": {
      overall_median_earnings: 96886,
      working_not_enrolled: { overall_count: 26 },
    },
  },
  debt: {
    staff_grad_plus: {
      all: { eval_inst: { count: 18, median: null, average: 30820 } },
    },
  },
};

const AG_BACHELORS: RawProgram = {
  code: "0100",
  title: "Agriculture, General.",
  credential: { level: 3, title: "Bachelor's Degree" },
  earnings: {
    "1_yr": {
      overall_median_earnings: 64786,
      working_not_enrolled: { overall_count: 18 },
    },
  },
  debt: {
    staff_grad_plus: {
      all: { eval_inst: { count: 20, median: 21903, average: null } },
    },
  },
};

const AG_MASTERS: RawProgram = {
  code: "0100",
  title: "Agriculture, General.",
  credential: { level: 5, title: "Master's Degree" },
  earnings: {
    "1_yr": {
      overall_median_earnings: null,
      working_not_enrolled: { overall_count: null },
    },
  },
  debt: {
    staff_grad_plus: {
      all: { eval_inst: { count: null, median: null, average: null } },
    },
  },
};

describe("pickEarnings", () => {
  it("uses this program's median with High confidence when the count is published", () => {
    const figure = pickEarnings(MSQM_MASTERS, [MSQM_MASTERS]);
    expect(figure.value).toBe(96886);
    expect(figure.confidence).toBe("High");
    expect(figure.note).toContain("26 graduates");
  });

  it("drops to Medium when the median is present but its count is suppressed", () => {
    const program: RawProgram = {
      ...MSQM_MASTERS,
      earnings: { "1_yr": { overall_median_earnings: 80000 } },
    };
    expect(pickEarnings(program, [program]).confidence).toBe("Medium");
  });

  it("falls back to the same field at another graduate level, Medium, and says so", () => {
    const doctorate: RawProgram = {
      ...AG_MASTERS,
      credential: { level: 6, title: "Doctoral Degree" },
      earnings: {
        "1_yr": {
          overall_median_earnings: 88000,
          working_not_enrolled: { overall_count: 12 },
        },
      },
    };
    const figure = pickEarnings(AG_MASTERS, [AG_BACHELORS, AG_MASTERS, doctorate]);
    expect(figure.value).toBe(88000);
    expect(figure.confidence).toBe("Medium");
    expect(figure.note).toContain("Doctoral Degree");
  });

  it("never uses a bachelor's figure for a graduate program: a bachelor's-only field is no data", () => {
    const figure = pickEarnings(AG_MASTERS, [AG_BACHELORS, AG_MASTERS]);
    expect(figure.value).toBeNull();
    expect(figure.confidence).toBeNull();
    expect(figure.note).toMatch(/^No first-year pay data for this program/);
  });

  it("is an honest blank when nothing at this school reports earnings", () => {
    const figure = pickEarnings(AG_MASTERS, [AG_MASTERS]);
    expect(figure.value).toBeNull();
    expect(figure.confidence).toBeNull();
    expect(figure.note).toMatch(/^No first-year pay data for this program/);
  });
});

describe("pickDebt", () => {
  it("uses the average, Medium, when the median is suppressed (A3's Cal Poly 5213 case)", () => {
    const figure = pickDebt(MSQM_MASTERS);
    expect(figure.value).toBe(30820);
    expect(figure.confidence).toBe("Medium");
    expect(figure.note).toContain("median is not published");
  });

  it("prefers the median, High, when it and the count are published", () => {
    const figure = pickDebt(AG_BACHELORS);
    expect(figure.value).toBe(21903);
    expect(figure.confidence).toBe("High");
  });

  it("is an honest blank when neither is published", () => {
    expect(pickDebt(AG_MASTERS).value).toBeNull();
  });
});

describe("summarizePrograms", () => {
  it("keeps graduate programs only, drops the trailing period, and never fills tuition", () => {
    const programs = summarizePrograms([AG_BACHELORS, MSQM_MASTERS, AG_MASTERS]);
    expect(programs.map((p) => p.title)).toEqual([
      "Agriculture, General",
      "Management Sciences and Quantitative Methods",
    ]);
    for (const p of programs) {
      expect(p.credentialLevel).toBeGreaterThanOrEqual(5);
      expect(p.tuition.value).toBeNull();
    }
  });
});

describe("asOfLabel", () => {
  it("names the release and the month it was retrieved", () => {
    expect(asOfLabel(new Date(Date.UTC(2026, 9, 3)))).toBe(
      "latest available, retrieved Oct 2026",
    );
  });
});
