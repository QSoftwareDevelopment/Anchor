// app/api/gcal/callback/route.ts — GET: exchange code for tokens,
// store the refresh token for the founder identified by `state`.
// The session must belong to that same founder (state is verified,
// not trusted blindly).
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/plan?gcal=error`);
  }

  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder || founder.user_id !== state) {
    // Session doesn't match the founder who started the flow.
    return NextResponse.redirect(`${appUrl}/plan?gcal=mismatch`);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${appUrl}/plan?gcal=error`);
  }

  const tokens = await tokenRes.json();
  if (!tokens.refresh_token) {
    // No refresh token (user re-consented without prompt=consent taking effect)
    return NextResponse.redirect(`${appUrl}/plan?gcal=norefresh`);
  }

  const { error } = await supabase.from("gcal_tokens").upsert({
    user_id: founder.user_id,
    refresh_token: tokens.refresh_token,
    calendar_id: "primary",
    updated_at: new Date().toISOString(),
  });

  if (error) return NextResponse.redirect(`${appUrl}/plan?gcal=error`);
  return NextResponse.redirect(`${appUrl}/plan?gcal=connected`);
}
