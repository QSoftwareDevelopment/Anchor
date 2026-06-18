// lib/supabase.ts
// ============================================================
// Supabase clients.
//  - createServerSupabase(): for Server Components + Route
//    Handlers. Cookie-based session via @supabase/ssr.
//  - createBrowserSupabase(): for Client Components.
//  - createServiceSupabase(): service-role client. ONLY for
//    cron-protected Route Handlers (acts for both founders).
// ============================================================

import { cookies } from "next/headers";
import {
  createServerClient as createSSRServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export function createServerSupabase(): SupabaseClient {
  const cookieStore = cookies();
  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components can't set cookies; middleware refreshes the session.
          }
        },
      },
    }
  );
}

export function createServiceSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Convenience: get the signed-in founder (user id + display name) or null.
export async function currentFounder(
  supabase: SupabaseClient
): Promise<{ user_id: string; display_name: string } | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("founders")
    .select("user_id, display_name")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return data ?? null;
}

// All founders in the workspace (RLS returns every founder to a founder).
export async function listFounders(
  supabase: SupabaseClient
): Promise<{ user_id: string; display_name: string }[]> {
  const { data } = await supabase
    .from("founders")
    .select("user_id, display_name")
    .order("display_name");
  return data ?? [];
}
