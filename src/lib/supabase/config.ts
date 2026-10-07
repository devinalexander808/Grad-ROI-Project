/**
 * Where the browser and the server find Supabase Auth (PLAN Build 6, part a).
 *
 * Both sides use the publishable key (sb_publishable_…), which is safe in the
 * browser: it can only do what row level security allows. SUPABASE_SECRET_KEY
 * bypasses RLS and is never used for sign-in; it stays in server-only code
 * (cache.ts) and is never given a NEXT_PUBLIC_ name.
 */

export interface AuthConfig {
  url: string;
  publishableKey: string;
}

/**
 * Null when sign-in isn't set up, so pages can say so instead of crashing.
 * NEXT_PUBLIC_ values are inlined at build time; the project URL is not a
 * secret, so next.config.ts passes SUPABASE_URL through when
 * NEXT_PUBLIC_SUPABASE_URL isn't set.
 */
export function authConfig(): AuthConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
