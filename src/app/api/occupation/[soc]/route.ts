import type { NextRequest } from "next/server";
import {
  BlsError,
  DEFAULT_METRO_CODE,
  DEFAULT_STATE_FIPS,
  getOccupationSnapshot,
  type OccupationApiPayload,
} from "@/lib/bls";
import { findOccupation } from "@/lib/occupations";

/**
 * SPEC.md §4.1 for one occupation: employment and pay nationally, for the user's
 * state, and for their metro.
 *
 * GET /api/occupation/132051?state=06&metro=0042200
 *
 * Defaults are the ones verified in SPEC §10 — California and the San Luis
 * Obispo MSA. Not cached by Next; src/lib/bls.ts holds a 24-hour cache of the
 * BLS observations themselves (SPEC §7 moves it to Supabase).
 *
 * Every path through this handler returns a JSON body, including unexpected
 * throws. An escaping exception becomes a platform error page with an empty or
 * HTML body, which is what produced "Unexpected end of JSON input" on the client
 * — the page could not parse what came back.
 */

/** The BLS client uses Node APIs and a 24-hour in-process cache. */
export const runtime = "nodejs";

/** Reads search params and calls a live API; never prerender or cache it. */
export const dynamic = "force-dynamic";

function fail(status: number, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status });
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/occupation/[soc]">,
) {
  try {
    const { soc } = await ctx.params;

    if (!/^\d{6}$/.test(soc)) {
      return fail(
        400,
        `SOC code must be six digits with no hyphen, got "${soc}".`,
      );
    }

    const params = request.nextUrl.searchParams;
    const stateFips = params.get("state") ?? DEFAULT_STATE_FIPS;
    const metroCode = params.get("metro") ?? DEFAULT_METRO_CODE;

    if (!/^\d{2}$/.test(stateFips)) {
      return fail(400, `State FIPS must be two digits, got "${stateFips}".`);
    }
    if (!/^\d{7}$/.test(metroCode)) {
      return fail(400, `Metro code must be seven digits, got "${metroCode}".`);
    }

    const snapshot = await getOccupationSnapshot({
      socCode: soc,
      stateFips,
      metroCode,
    });

    const body: OccupationApiPayload = {
      soc,
      occupation: findOccupation(soc),
      source: snapshot.source,
      asOfYear: snapshot.asOfYear,
      national: snapshot.national,
      state: snapshot.state,
      metro: snapshot.metro,
    };

    return Response.json(body);
  } catch (cause) {
    // SPEC §6: blank states are honest. Say what went wrong; never invent
    // numbers, and never let the exception escape as a non-JSON error page.
    if (cause instanceof BlsError) {
      console.error("[occupation] BLS request failed:", cause.message);
      return fail(502, cause.message, { source: "BLS OEWS" });
    }

    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error("[occupation] Unexpected failure:", detail, cause);
    return fail(500, `Unexpected server error: ${detail}`);
  }
}
