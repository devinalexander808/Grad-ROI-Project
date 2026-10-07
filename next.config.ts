import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // The browser needs the Supabase project URL for sign-in. It isn't a
    // secret, so reuse SUPABASE_URL rather than asking for a second copy.
    // Keys are never passed through here: the publishable key comes from
    // NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and the secret key stays server-only.
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
  },
};

export default nextConfig;
