// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Build 6, part a: email sign-in. The Supabase browser client is replaced with
 * a fake, so no email is sent and no network is touched.
 */

type AuthListener = (event: string, session: { user: { email: string } } | null) => void;

let currentEmail: string | null;
let listener: AuthListener | null;
let configured: boolean;

const auth = {
  getUser: vi.fn(async () => ({
    data: { user: currentEmail === null ? null : { email: currentEmail } },
  })),
  onAuthStateChange: vi.fn((cb: AuthListener) => {
    listener = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }),
  signInWithOtp: vi.fn<
    (args: unknown) => Promise<{ error: null | { status?: number; message: string } }>
  >(async () => ({ error: null })),
  signOut: vi.fn(async () => {
    currentEmail = null;
    listener?.("SIGNED_OUT", null);
    return { error: null };
  }),
};

vi.mock("@/lib/supabase/browser", () => ({
  browserSupabase: () => (configured ? { auth } : null),
}));

const { default: AuthStatus } = await import("./auth-status");
const { default: SignInPage } = await import("./sign-in/page");

beforeEach(() => {
  currentEmail = null;
  listener = null;
  configured = true;
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/sign-in");
});

afterEach(() => {
  cleanup();
});

describe("nav sign-in status", () => {
  it("offers Sign in when signed out", async () => {
    render(<AuthStatus />);
    const link = await screen.findByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toBe("/sign-in");
  });

  it("shows the email and signs out", async () => {
    currentEmail = "pat@example.com";
    render(<AuthStatus />);

    expect(await screen.findByText("pat@example.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it("shows nothing when sign-in isn't set up", () => {
    configured = false;
    const { container } = render(<AuthStatus />);
    expect(container.textContent).toBe("");
  });
});

describe("sign-in page", () => {
  it("emails a link that comes back through /auth/callback", async () => {
    window.history.replaceState(null, "", "/sign-in?next=/calculator");
    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: " pat@example.com " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "pat@example.com",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fcalculator",
        shouldCreateUser: true,
      },
    });
  });

  it("explains a link that didn't work", () => {
    window.history.replaceState(null, "", "/sign-in?error=link");
    render(<SignInPage />);
    expect(screen.getByRole("alert").textContent).toMatch(/link didn’t work/);
  });

  it("says plainly when too many emails were sent", async () => {
    auth.signInWithOtp.mockResolvedValueOnce({
      error: { status: 429, message: "rate limit" },
    });
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "pat@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Too many sign-in emails/);
  });

  it("says when sign-in isn't set up", () => {
    configured = false;
    render(<SignInPage />);
    expect(screen.getByText("Sign-in isn’t set up on this site yet.")).toBeTruthy();
  });
});
