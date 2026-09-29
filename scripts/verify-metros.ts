/**
 * One-off check: which California metro area codes does BLS OEWS actually
 * publish? Not part of the app or the build.
 *
 *   npx tsx scripts/verify-metros.ts
 *
 * For each candidate it asks for the 2025 annual median wage for financial
 * analysts (SOC 13-2051) through the app's own fetchSeries, then asks BLS's
 * series catalog for the official area name. Needs BLS_API_KEY in .env.local
 * (the catalog is only served to registered keys).
 */

import {
  BLS_ENDPOINT,
  DATA_TYPE,
  buildSeriesId,
  fetchSeries,
} from "../src/lib/bls";

const SOC = "132051";

/** Census CBSA codes padded to 7 digits, with the Census name as a fallback label. */
const CANDIDATES: { code: string; censusName: string }[] = [
  { code: "0031080", censusName: "Los Angeles–Long Beach–Anaheim, CA" },
  { code: "0041860", censusName: "San Francisco–Oakland–Fremont, CA" },
  { code: "0041940", censusName: "San Jose–Sunnyvale–Santa Clara, CA" },
  { code: "0041740", censusName: "San Diego–Chula Vista–Carlsbad, CA" },
  { code: "0040900", censusName: "Sacramento–Roseville–Folsom, CA" },
  { code: "0040140", censusName: "Riverside–San Bernardino–Ontario, CA" },
  { code: "0023420", censusName: "Fresno, CA" },
  { code: "0012540", censusName: "Bakersfield–Delano, CA" },
  { code: "0037100", censusName: "Oxnard–Thousand Oaks–Ventura, CA" },
  { code: "0042220", censusName: "Santa Rosa–Petaluma, CA" },
  { code: "0041500", censusName: "Salinas, CA" },
  { code: "0044700", censusName: "Stockton–Lodi, CA" },
  { code: "0033700", censusName: "Modesto, CA" },
  { code: "0042100", censusName: "Santa Cruz–Watsonville, CA" },
  // METROS used to label 0042200 as San Luis Obispo. Confirmed against the
  // BLS CBSA code list: 42200 is Santa Maria–Santa Barbara, 42020 is SLO.
  { code: "0042200", censusName: "Santa Maria–Santa Barbara, CA" },
  { code: "0042020", censusName: "San Luis Obispo–Paso Robles, CA" },
];

interface CatalogSeries {
  seriesID?: string;
  catalog?: { area?: string; series_title?: string };
}

/** Official area names from the BLS series catalog, keyed by series ID. */
async function catalogNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const key = process.env.BLS_API_KEY;
  if (!key) return names;
  const response = await fetch(BLS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seriesid: ids,
      registrationkey: key,
      catalog: true,
      startyear: "2025",
      endyear: "2025",
    }),
  });
  const payload = (await response.json()) as {
    status?: string;
    message?: string[];
    Results?: { series?: CatalogSeries[] };
  };
  if (payload.status !== "REQUEST_SUCCEEDED") {
    // As of Sept 2026 BLS rejects catalog=true for OEWS series outright.
    console.warn(
      `Catalog request failed (${payload.status}); using Census names.`,
    );
    return names;
  }
  for (const series of payload.Results?.series ?? []) {
    const area = series.catalog?.area;
    if (series.seriesID && area) names.set(series.seriesID, area);
  }
  return names;
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    console.warn("No .env.local found; running unregistered (no catalog names).");
  }
  console.log(`BLS_API_KEY ${process.env.BLS_API_KEY ? "is set" : "is NOT set"}\n`);

  const idFor = (code: string) =>
    buildSeriesId({
      areaType: "M",
      areaCode: code,
      socCode: SOC,
      dataType: DATA_TYPE.medianAnnualWage,
    });

  const ids = CANDIDATES.map((c) => idFor(c.code));
  const observations = await fetchSeries(ids);
  const names = await catalogNames(ids);

  const verified: { code: string; name: string }[] = [];
  const failed: string[] = [];

  for (const candidate of CANDIDATES) {
    const id = idFor(candidate.code);
    const obs = observations.get(id);
    const ok = obs?.value != null && obs.year === 2025;
    const blsName = names.get(id);
    console.log(
      [
        candidate.code,
        ok ? "DATA   " : "NO DATA",
        ok ? `$${obs!.value!.toLocaleString("en-US")} (${obs!.year})` : `value=${obs?.value ?? "null"} year=${obs?.year ?? "null"}`,
        `BLS name: ${blsName ?? "(none)"}`,
        `Census: ${candidate.censusName}`,
      ].join(" | "),
    );
    if (ok) verified.push({ code: candidate.code, name: blsName ?? candidate.censusName });
    else failed.push(`${candidate.code} ${candidate.censusName}`);
  }

  console.log("\nVerified:");
  for (const m of verified) console.log(`  { code: "${m.code}", name: ${JSON.stringify(m.name)} }`);
  console.log("\nFailed:");
  for (const f of failed) console.log(`  ${f}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
