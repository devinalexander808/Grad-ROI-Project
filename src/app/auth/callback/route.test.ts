import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** The magic-link landing route, with the Supabase server client faked. */

const exchangeCodeForSession = vi.fn<
  (code: string) => Promise<{ error: null | { message: string } }>
>(async () => ({ error: null }));
let configured = true;

vi.mock("@/lib/supabase/server", () => ({
  serverSupabase: async () => (configured ? { auth: { exchangeCodeForSession } } : null),
}));

const { GET } = await import("./route");

function visit(query: string) {
  return GET(new NextRequest(`http://localhost:3000/auth/callback${query}`));
}

function landedOn(response: Response): string {
  const location = new URL(response.headers.get("location") ?? "");
  return `${location.pathname}${location.search}`;
}

beforeEach(() => {
  configured = true;
  exchangeCodeForSession.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("/auth/callback", () => {
  it("signs in and returns to the page the user started from", async () => {
    const response = await visit("?code=abc&next=/calculator");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(landedOn(response)).toBe("/calculator");
  });

  it("goes home when no page was given", async () => {
    expect(landedOn(await visit("?code=abc"))).toBe("/");
  });

  it("never redirects off the site", async () => {
    expect(landedOn(await visit("?code=abc&next=//evil.example"))).toBe("/");
    expect(landedOn(await visit("?code=abc&next=https://evil.example"))).toBe("/");
  });

  it("sends an expired or reused link back to sign-in with an explanation", async () => {
    const response = await visit("?error=access_denied&error_description=Email+link+is+invalid+or+has+expired");
    expect(landedOn(response)).toBe("/sign-in?error=link");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("handles a code Supabase rejects", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "invalid flow state" } });
    expect(landedOn(await visit("?code=bad"))).toBe("/sign-in?error=link");
  });

  it("says when sign-in isn't set up", async () => {
    configured = false;
    expect(landedOn(await visit("?code=abc"))).toBe("/sign-in?error=setup");
  });
});
