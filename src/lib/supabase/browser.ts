"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authConfig } from "./config";

let client: SupabaseClient | null = null;

/**
 * The browser's Supabase client, one per tab, or null when sign-in isn't set
 * up. The session lives in cookies (not localStorage), so the server-side
 * callback route can finish a sign-in and later builds can read the user on
 * the server.
 */
export function browserSupabase(): SupabaseClient | null {
  if (client) return client;
  const config = authConfig();
  if (config === null) return null;
  client = createBrowserClient(config.url, config.publishableKey);
  return client;
}
