// middleware.ts — session refresh + route protection.
// Everything except /login and public assets requires a session.
// Cron + OAuth callback routes are excluded (they carry their own auth).

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/signout") ||
    path.startsWith("/api/cron") ||
    path.startsWith("/api/gcal/callback");

  if (!isPublic) {
    // No session → sign in.
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // Session exists, but access is limited to the two founders. The
    // founders table is the allowlist: RLS only returns a row when the
    // caller is actually in it, so a logged-in non-founder gets nothing
    // and is bounced to /login (which then signs them out). This is the
    // routing-layer guarantee that only Sid and Aaryan reach the app.
    const { data: founder } = await supabase
      .from("founders")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!founder) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?private=1";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
