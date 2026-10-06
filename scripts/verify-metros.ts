/**
 * One-off check: which metro area codes does BLS OEWS actually publish? Not
 * part of the app or the build. Covers California plus the next nine largest
 * states and New Jersey (PLAN.md Build 2).
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

/**
 * Census CBSA codes padded to 7 digits, with the Census name as a fallback
 * label. `stateFips` is the state the metro is listed under; `alsoIn` lists
 * other states it reaches into (New York and Philadelphia cover much of NJ).
 */
const CANDIDATES: {
  code: string;
  censusName: string;
  stateFips?: string;
  alsoIn?: string[];
}[] = [
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
  { code: "0042020", censusName: "San Luis Obispo–Paso Robles, CA" },  // Texas (48)
  { code: "0019100", censusName: "Dallas–Fort Worth–Arlington, TX", stateFips: "48" },
  { code: "0026420", censusName: "Houston–Pasadena–The Woodlands, TX", stateFips: "48" },
  { code: "0041700", censusName: "San Antonio–New Braunfels, TX", stateFips: "48" },
  { code: "0012420", censusName: "Austin–Round Rock–San Marcos, TX", stateFips: "48" },
  { code: "0021340", censusName: "El Paso, TX", stateFips: "48" },
  // Florida (12)
  { code: "0033100", censusName: "Miami–Fort Lauderdale–West Palm Beach, FL", stateFips: "12" },
  { code: "0045300", censusName: "Tampa–St. Petersburg–Clearwater, FL", stateFips: "12" },
  { code: "0036740", censusName: "Orlando–Kissimmee–Sanford, FL", stateFips: "12" },
  { code: "0027260", censusName: "Jacksonville, FL", stateFips: "12" },
  { code: "0035840", censusName: "North Port–Bradenton–Sarasota, FL", stateFips: "12" },
  // New York (36)
  { code: "0035620", censusName: "New York–Newark–Jersey City, NY-NJ", stateFips: "36", alsoIn: ["34"] },
  { code: "0015380", censusName: "Buffalo–Cheektowaga, NY", stateFips: "36" },
  { code: "0040380", censusName: "Rochester, NY", stateFips: "36" },
  { code: "0010580", censusName: "Albany–Schenectady–Troy, NY", stateFips: "36" },
  { code: "0045060", censusName: "Syracuse, NY", stateFips: "36" },
  // Illinois (17)
  { code: "0016980", censusName: "Chicago–Naperville–Elgin, IL-IN", stateFips: "17" },
  { code: "0040420", censusName: "Rockford, IL", stateFips: "17" },
  { code: "0037900", censusName: "Peoria, IL", stateFips: "17" },
  { code: "0016580", censusName: "Champaign–Urbana, IL", stateFips: "17" },
  { code: "0044100", censusName: "Springfield, IL", stateFips: "17" },
  // Pennsylvania (42)
  { code: "0037980", censusName: "Philadelphia–Camden–Wilmington, PA-NJ-DE-MD", stateFips: "42", alsoIn: ["34"] },
  { code: "0038300", censusName: "Pittsburgh, PA", stateFips: "42" },
  { code: "0010900", censusName: "Allentown–Bethlehem–Easton, PA-NJ", stateFips: "42", alsoIn: ["34"] },
  { code: "0025420", censusName: "Harrisburg–Carlisle, PA", stateFips: "42" },
  { code: "0042540", censusName: "Scranton–Wilkes-Barre, PA", stateFips: "42" },
  // Ohio (39)
  { code: "0018140", censusName: "Columbus, OH", stateFips: "39" },
  // 17460 (Cleveland–Elyria) returned no 2025 data: OMB's 2023 delineation
  // re-coded it as 17410, Cleveland, OH.
  { code: "0017410", censusName: "Cleveland, OH", stateFips: "39" },
  { code: "0017140", censusName: "Cincinnati, OH-KY-IN", stateFips: "39" },
  { code: "0010420", censusName: "Akron, OH", stateFips: "39" },
  { code: "0019430", censusName: "Dayton–Kettering–Beavercreek, OH", stateFips: "39" },
  // Georgia (13)
  { code: "0012060", censusName: "Atlanta–Sandy Springs–Roswell, GA", stateFips: "13" },
  { code: "0012260", censusName: "Augusta–Richmond County, GA-SC", stateFips: "13" },
  { code: "0042340", censusName: "Savannah, GA", stateFips: "13" },
  { code: "0017980", censusName: "Columbus, GA-AL", stateFips: "13" },
  { code: "0031420", censusName: "Macon–Bibb County, GA", stateFips: "13" },
  // North Carolina (37)
  { code: "0016740", censusName: "Charlotte–Concord–Gastonia, NC-SC", stateFips: "37" },
  { code: "0039580", censusName: "Raleigh–Cary, NC", stateFips: "37" },
  { code: "0024660", censusName: "Greensboro–High Point, NC", stateFips: "37" },
  { code: "0020500", censusName: "Durham–Chapel Hill, NC", stateFips: "37" },
  { code: "0049180", censusName: "Winston-Salem, NC", stateFips: "37" },
  // Michigan (26)
  { code: "0019820", censusName: "Detroit–Warren–Dearborn, MI", stateFips: "26" },
  { code: "0024340", censusName: "Grand Rapids–Wyoming–Kentwood, MI", stateFips: "26" },
  { code: "0029620", censusName: "Lansing–East Lansing, MI", stateFips: "26" },
  { code: "0011460", censusName: "Ann Arbor, MI", stateFips: "26" },
  { code: "0022420", censusName: "Flint, MI", stateFips: "26" },
  // New Jersey (34): NJ-only metros. New York, Philadelphia and Allentown above
  // also list under NJ.
  { code: "0045940", censusName: "Trenton–Princeton, NJ", stateFips: "34" },
  { code: "0012100", censusName: "Atlantic City–Hammonton, NJ", stateFips: "34" },
  { code: "0047220", censusName: "Vineland, NJ", stateFips: "34" },
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

  const verified: (typeof CANDIDATES[number] & { name: string })[] = [];
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
    if (ok) verified.push({ ...candidate, name: blsName ?? candidate.censusName });
    else failed.push(`${candidate.code} ${candidate.censusName}`);
  }

  console.log("\nVerified:");
  for (const m of verified) {
    const state = m.stateFips ? `, stateFips: "${m.stateFips}"` : "";
    const also = m.alsoIn ? `, alsoIn: ${JSON.stringify(m.alsoIn)}` : "";
    console.log(`  { code: "${m.code}", name: ${JSON.stringify(m.name)}${state}${also} },`);
  }
  console.log("\nFailed:");
  for (const f of failed) console.log(`  ${f}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
