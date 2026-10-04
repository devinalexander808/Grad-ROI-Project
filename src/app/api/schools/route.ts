import type { NextRequest } from "next/server";
import { ScorecardError, searchSchools, type SchoolMatch } from "@/lib/scorecard";

/**
 * School search for the program picker (SPEC Appendix A3).
 *
 * GET /api/schools?q=cal%20poly → { schools: SchoolMatch[] }
 *
 * Like /api/occupation, every path returns JSON, so the client can always show
 * a readable message.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return Response.json({ schools: [] satisfies SchoolMatch[] });
    }
    if (q.length > 100) {
      return Response.json(
        { error: "School name is too long." },
        { status: 400 },
      );
    }
    return Response.json({ schools: await searchSchools(q) });
  } catch (cause) {
    if (cause instanceof ScorecardError) {
      console.error("[schools] Scorecard request failed:", cause.message);
      return Response.json(
        { error: cause.message, source: "College Scorecard" },
        { status: 502 },
      );
    }
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error("[schools] Unexpected failure:", detail);
    return Response.json(
      { error: `Unexpected server error: ${detail}` },
      { status: 500 },
    );
  }
}
