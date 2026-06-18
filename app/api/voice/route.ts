// app/api/voice/route.ts
// POST { text } → premium spoken audio via ElevenLabs, IF ELEVENLABS_API_KEY
// is configured. Otherwise returns 501 so the client falls back to the
// browser's built-in speech synthesis. The API key never leaves the server.
import { NextResponse } from "next/server";
import { createServerSupabase, currentFounder } from "@/lib/supabase";

export const maxDuration = 30;

// Default voice = "Rachel" (a stock ElevenLabs voice). Override with ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const founder = await currentFounder(supabase);
  if (!founder) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    // No premium voice configured — tell the client to use browser TTS.
    return NextResponse.json({ error: "no_premium_voice" }, { status: 501 });
  }

  const { text } = (await req.json()) as { text?: string };
  if (!text || !text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: text.slice(0, 2500),
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2 },
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "tts_failed", detail: await res.text() }, { status: 502 });
  }

  return new NextResponse(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
