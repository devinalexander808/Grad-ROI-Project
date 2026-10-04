import type { NextRequest } from "next/server";
import { ScorecardError, getSchoolPrograms } from "@/lib/scorecard";

/**
 * One school's graduate programs with first-year earnings, typical debt and
 * tuition, each labelled with a confidence level or an honest blank (SPEC
 * Appendix A3).
 *
 * GET /api/schools/110422 → SchoolPrograms
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/schools/[id]">,
) {
  try {
    const { id } = await ctx.params;
    if (!/^\d{1,9}$/.test(id)) {
      return Response.json(
        { error: `School id must be a number, got "${id}".` },
        { status: 400 },
      );
    }
    const programs = await getSchoolPrograms(Number(id));
    if (programs === null) {
      return Response.json(
        { error: "College Scorecard has no school with that id." },
        { status: 404 },
      );
    }
    return Response.json(programs);
  } catch (cause) {
    if (cause instanceof ScorecardError) {
      console.error("[schools/id] Scorecard request failed:", cause.message);
      return Response.json(
        { error: cause.message, source: "College Scorecard" },
        { status: 502 },
      );
    }
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error("[schools/id] Unexpected failure:", detail);
    return Response.json(
      { error: `Unexpected server error: ${detail}` },
      { status: 500 },
    );
  }
}
