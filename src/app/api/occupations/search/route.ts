import type { NextRequest } from "next/server";
import {
  OnetError,
  searchOnet,
  type OccupationSearchPayload,
} from "@/lib/onet";

/**
 * Job title → SOC codes through O*NET Web Services (PLAN.md Build 2, SPEC §10).
 *
 * GET /api/occupations/search?q=nurse
 *
 * The seed table in occupations.ts is searched in the browser and shows
 * instantly; this route supplies the O*NET matches listed under it.
 * src/lib/onet.ts holds a 24-hour cache of O*NET answers.
 *
 * Every path returns a JSON body, including unexpected throws, for the same
 * reason as /api/occupation/[soc]: the client must always be able to read why.
 * No match is a 200 with an empty list, not an error.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shortest query worth sending; one letter matches most of O*NET. */
const MIN_QUERY = 2;
const MAX_QUERY = 100;

function fail(status: number, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const query = (request.nextUrl.searchParams.get("q") ?? "").trim();

    if (query.length < MIN_QUERY) {
      return fail(400, `Type at least ${MIN_QUERY} letters to search.`);
    }
    if (query.length > MAX_QUERY) {
      return fail(400, `Search text must be ${MAX_QUERY} characters or fewer.`);
    }

    const body: OccupationSearchPayload = {
      query,
      source: "O*NET Web Services",
      results: await searchOnet(query),
    };
    return Response.json(body);
  } catch (cause) {
    if (cause instanceof OnetError) {
      console.error("[occupations/search] O*NET request failed:", cause.message);
      return fail(502, cause.message, { source: "O*NET Web Services" });
    }

    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error("[occupations/search] Unexpected failure:", detail, cause);
    return fail(500, `Unexpected server error: ${detail}`);
  }
}
