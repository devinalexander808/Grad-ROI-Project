import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { authConfig } from "./config";

/**
 * A Supabase client for route handlers, acting as the signed-in user through
 * the request's cookies, or null when sign-in isn't set up. It uses the
 * publishable key, so row level security applies exactly as in the browser.
 */
export async function serverSupabase(): Promise<SupabaseClient | null> {
  const config = authConfig();
  if (config === null) return null;
  const store = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          store.set(name, value, options);
        }
      },
    },
  });
}
