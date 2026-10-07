import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";

/**
 * Where the magic link lands (PLAN Build 6, part a).
 *
 * GET /auth/callback?code=…&next=/calculator
 *
 * Supabase verifies the emailed link, then sends the browser here with a
 * one-time code. Exchanging it (PKCE: the browser that asked for the link
 * holds the matching verifier cookie) sets the session cookies, and the user
 * goes back to the page they signed in from. Anything that goes wrong lands on
 * /sign-in with a plain explanation, never an error page.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only same-site paths, so the link can't be turned into an open redirect. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const back = (path: string) => NextResponse.redirect(new URL(path, origin));
  const failed = (reason: "link" | "setup") => back(`/sign-in?error=${reason}`);

  try {
    const code = searchParams.get("code");
    if (!code) {
      // Supabase reports an expired or reused link as ?error=…&error_description=…
      const description = searchParams.get("error_description");
      if (description) console.warn("[auth] link rejected:", description);
      return failed("link");
    }

    const supabase = await serverSupabase();
    if (supabase === null) return failed("setup");

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn("[auth] code exchange failed:", error.message);
      return failed("link");
    }
    return back(safeNext(searchParams.get("next")));
  } catch (cause) {
    console.error(
      "[auth] callback failed:",
      cause instanceof Error ? cause.message : String(cause),
    );
    return failed("link");
  }
}
