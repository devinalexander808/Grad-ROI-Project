/**
 * One-off check: which candidate SOC codes does BLS OEWS actually publish a
 * national median wage for? Not part of the app or the build.
 *
 *   npx tsx scripts/verify-occupations.ts
 *
 * For each candidate it asks for the 2025 national median annual wage through
 * the app's own fetchSeries. Only codes that come back with a 2025 figure go
 * into src/lib/occupations.ts. Reads BLS_API_KEY from .env.local if present.
 */

import {
  DATA_TYPE,
  NATIONAL_AREA_CODE,
  buildSeriesId,
  fetchSeries,
} from "../src/lib/bls";

/** SOC codes were written from memory, so every one is checked here. */
const CANDIDATES: { soc: string; title: string }[] = [
  { soc: "132052", title: "Personal financial advisor" },
  { soc: "132031", title: "Budget analyst" },
  { soc: "132041", title: "Credit analyst" },
  { soc: "132061", title: "Financial examiner" },
  { soc: "132072", title: "Loan officer" },
  { soc: "132081", title: "Tax examiner" },
  { soc: "132053", title: "Insurance underwriter" },
  { soc: "152011", title: "Actuary" },
  { soc: "152041", title: "Statistician" },
  { soc: "152031", title: "Operations research analyst" },
  { soc: "131161", title: "Market research analyst" },
  { soc: "131111", title: "Management analyst" },
  { soc: "131081", title: "Logistician" },
  { soc: "131082", title: "Project management specialist" },
  { soc: "131071", title: "Human resources specialist" },
  { soc: "131141", title: "Compensation and benefits specialist" },
  { soc: "131151", title: "Training and development specialist" },
  { soc: "131023", title: "Purchasing agent" },
  { soc: "131051", title: "Cost estimator" },
  { soc: "131131", title: "Fundraiser" },
  { soc: "151252", title: "Software developer" },
  { soc: "151254", title: "Web developer" },
  { soc: "151242", title: "Database administrator" },
  { soc: "151212", title: "Information security analyst" },
  { soc: "151211", title: "Computer systems analyst" },
  { soc: "151241", title: "Computer network architect" },
  { soc: "151251", title: "Computer programmer" },
  { soc: "439021", title: "Data entry keyer" },
  { soc: "433031", title: "Bookkeeping, accounting or auditing clerk" },
  { soc: "111021", title: "General and operations manager" },
  { soc: "113031", title: "Financial manager" },
  { soc: "112021", title: "Marketing manager" },
  { soc: "112022", title: "Sales manager" },
  { soc: "113121", title: "Human resources manager" },
  { soc: "113021", title: "Computer and information systems manager" },
  { soc: "113061", title: "Purchasing manager" },
  { soc: "113131", title: "Training and development manager" },
  { soc: "119111", title: "Medical or health services manager" },
  { soc: "193011", title: "Economist" },
  { soc: "193051", title: "Urban or regional planner" },
  { soc: "413031", title: "Securities, commodities or financial services sales agent" },
  { soc: "419021", title: "Real estate broker" },
  { soc: "419022", title: "Real estate sales agent" },
  { soc: "413021", title: "Insurance sales agent" },
  { soc: "291141", title: "Registered nurse" },
  { soc: "291171", title: "Nurse practitioner" },
  { soc: "291071", title: "Physician assistant" },
  { soc: "291051", title: "Pharmacist" },
  { soc: "291123", title: "Physical therapist" },
  { soc: "231011", title: "Lawyer" },
  { soc: "232011", title: "Paralegal or legal assistant" },
  { soc: "172051", title: "Civil engineer" },
  { soc: "172141", title: "Mechanical engineer" },
  { soc: "172071", title: "Electrical engineer" },
  { soc: "172112", title: "Industrial engineer" },
  { soc: "252031", title: "Secondary school teacher" },
  { soc: "251011", title: "Business teacher, postsecondary" },
];

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    console.warn("No .env.local found; running unregistered.");
  }
  console.log(`BLS_API_KEY ${process.env.BLS_API_KEY ? "is set" : "is NOT set"}\n`);

  const idFor = (soc: string) =>
    buildSeriesId({
      areaType: "N",
      areaCode: NATIONAL_AREA_CODE,
      socCode: soc,
      dataType: DATA_TYPE.medianAnnualWage,
    });

  const observations = await fetchSeries(CANDIDATES.map((c) => idFor(c.soc)));

  const passed: string[] = [];
  const failed: string[] = [];

  for (const candidate of CANDIDATES) {
    const obs = observations.get(idFor(candidate.soc));
    const ok = obs?.value != null && obs.year === 2025;
    const line = `${candidate.soc} ${candidate.title}`;
    console.log(
      [
        ok ? "PASS" : "FAIL",
        line,
        ok
          ? `$${obs!.value!.toLocaleString("en-US")} (${obs!.year})`
          : `value=${obs?.value ?? "null"} year=${obs?.year ?? "null"}`,
      ].join(" | "),
    );
    (ok ? passed : failed).push(line);
  }

  console.log(`\nPassed (${passed.length}):`);
  for (const p of passed) console.log(`  ${p}`);
  console.log(`\nFailed (${failed.length}):`);
  for (const f of failed) console.log(`  ${f}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
