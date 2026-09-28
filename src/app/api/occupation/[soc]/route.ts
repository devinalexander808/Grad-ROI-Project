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
 */

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/occupation/[soc]">,
) {
  const { soc } = await ctx.params;

  if (!/^\d{6}$/.test(soc)) {
    return badRequest(
      `SOC code must be six digits with no hyphen, got "${soc}".`,
    );
  }

  const params = request.nextUrl.searchParams;
  const stateFips = params.get("state") ?? DEFAULT_STATE_FIPS;
  const metroCode = params.get("metro") ?? DEFAULT_METRO_CODE;

  if (!/^\d{2}$/.test(stateFips)) {
    return badRequest(`State FIPS must be two digits, got "${stateFips}".`);
  }
  if (!/^\d{7}$/.test(metroCode)) {
    return badRequest(`Metro code must be seven digits, got "${metroCode}".`);
  }

  try {
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
    if (cause instanceof BlsError) {
      // SPEC §6: blank states are honest. Say the source is down; do not invent
      // numbers or return zeros.
      return Response.json({ error: cause.message }, { status: 502 });
    }
    throw cause;
  }
}
