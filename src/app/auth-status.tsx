"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase/browser";

/**
 * The right end of the nav: "Sign in", or the signed-in email and "Sign out"
 * (PLAN Build 6, part a). Renders nothing until the browser knows which, and
 * nothing at all when sign-in isn't set up.
 */
export default function AuthStatus() {
  // undefined: not known yet; null: signed out.
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [signingOut, setSigningOut] = useState(false);
  const supabase = browserSupabase();

  useEffect(() => {
    if (supabase === null) return;
    let live = true;
    supabase.auth.getUser().then(({ data }) => {
      if (live) setEmail(data.user?.email ?? null);
    });
    // Sign-in in another tab, sign-out here, and token refreshes all land here.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  if (supabase === null || email === undefined) return null;

  if (email === null) {
    return (
      <Link
        href="/sign-in"
        className="ml-auto rounded-md px-2.5 py-1 text-sm text-ink-secondary hover:bg-plane hover:text-ink"
      >
        Sign in
      </Link>
    );
  }

  return (
    <span className="ml-auto flex min-w-0 items-center gap-2 text-sm">
      <span className="truncate text-ink-secondary" title={email}>
        {email}
      </span>
      <button
        type="button"
        disabled={signingOut}
        className="shrink-0 rounded-md px-2.5 py-1 text-ink-secondary hover:bg-plane hover:text-ink disabled:opacity-50"
        onClick={async () => {
          setSigningOut(true);
          await supabase.auth.signOut();
          setEmail(null);
          setSigningOut(false);
        }}
      >
        Sign out
      </button>
    </span>
  );
}
