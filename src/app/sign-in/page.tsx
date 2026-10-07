"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { browserSupabase } from "@/lib/supabase/browser";

/**
 * Sign in with a link by email (PLAN Build 6, part a): one box, no password.
 * Supabase sends the link; clicking it lands on /auth/callback, which signs
 * the user in and brings them back to the page they started from.
 */

type Status =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "sent"; email: string }
  | { state: "error"; message: string };

const CALLBACK_ERRORS: Record<string, string> = {
  link: "That sign-in link didn’t work. It may have expired, been used already, or been opened in a different browser. Send yourself a new one.",
  setup: "Sign-in isn’t set up on this site yet.",
};

/** Nothing to subscribe to: the query string doesn't change under this page. */
function noSubscription(): () => void {
  return () => {};
}

function readParams(): string {
  return window.location.search;
}

export default function SignInPage() {
  const search = useSyncExternalStore(noSubscription, readParams, () => "");
  const params = new URLSearchParams(search);
  const callbackError = CALLBACK_ERRORS[params.get("error") ?? ""] ?? null;
  const next = params.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const supabase = browserSupabase();

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (supabase === null) return;
    const address = email.trim();
    setStatus({ state: "sending" });

    const redirect = new URL("/auth/callback", window.location.origin);
    redirect.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirect.toString(), shouldCreateUser: true },
    });

    if (error) {
      setStatus({
        state: "error",
        message:
          error.status === 429
            ? "Too many sign-in emails just now. Wait a few minutes and try again."
            : `We couldn’t send the email: ${error.message}`,
      });
      return;
    }
    setStatus({ state: "sent", email: address });
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-ink-secondary">
        We’ll email you a link. Click it and you’re signed in, with no password
        to remember. New here? The same link creates your account.
      </p>

      <section className="mt-6 rounded-xl border border-hairline bg-surface p-5">
        {supabase === null ? (
          <p className="text-sm text-ink-secondary">
            {CALLBACK_ERRORS.setup}
          </p>
        ) : status.state === "sent" ? (
          <div role="status">
            <h2 className="text-sm font-semibold text-ink">Check your email</h2>
            <p className="mt-2 text-sm text-ink-secondary">
              We sent a sign-in link to{" "}
              <span className="font-medium text-ink">{status.email}</span>.
              Open it in this browser. It can take a minute to arrive; check
              spam if it doesn’t.
            </p>
            <button
              type="button"
              className="mt-3 text-xs text-accent hover:underline"
              onClick={() => setStatus({ state: "idle" })}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-3">
            {callbackError && status.state === "idle" && (
              <p role="alert" className="text-sm text-ink-secondary">
                {callbackError}
              </p>
            )}
            <label className="block">
              <span className="text-sm font-medium text-ink">Email</span>
              <span className="mt-1 flex items-center rounded-md border border-hairline bg-plane focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
                <input
                  className="w-full bg-transparent px-2.5 py-1.5 text-sm text-ink outline-none"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </span>
            </label>
            {status.state === "error" && (
              <p role="alert" className="text-sm text-ink-secondary">
                {status.message}
              </p>
            )}
            <button
              type="submit"
              disabled={status.state === "sending"}
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {status.state === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
        )}
      </section>

      <p className="mt-4 text-xs text-muted">
        Signing in is optional. Everything on{" "}
        <Link href="/" className="text-accent hover:underline">
          Pathfinder
        </Link>{" "}
        works without an account.
      </p>
    </div>
  );
}
