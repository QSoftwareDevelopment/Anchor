// lib/voice.ts — client-only voice helpers for the Jarvis assistant.
// Speech OUT: tries the premium ElevenLabs proxy (/api/voice); if that's not
// configured, falls back to the browser's built-in SpeechSynthesis.
// Speech IN: push-to-talk via the Web Speech API (Chrome/Safari).
"use client";

let currentAudio: HTMLAudioElement | null = null;

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && ("speechSynthesis" in window || true);
}

export function stopSpeaking() {
  if (typeof window === "undefined") return;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

// Pick a pleasant English voice for the browser fallback.
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (!voices.length) return null;
  const prefer = ["Google UK English Male", "Daniel", "Samantha", "Google US English", "Microsoft Aria Online"];
  for (const name of prefer) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  return voices.find((v) => v.lang?.startsWith("en")) ?? voices[0];
}

function browserSpeak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = 1.03;
  u.pitch = 1.0;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

/**
 * Speak text. Uses premium ElevenLabs audio when available, else browser TTS.
 * Returns a promise that resolves when audio finishes (best-effort).
 */
export async function speakSmart(text: string, onEnd?: () => void): Promise<void> {
  stopSpeaking();
  if (!text.trim()) {
    onEnd?.();
    return;
  }
  try {
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok && res.headers.get("content-type")?.includes("audio")) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudio = null;
        onEnd?.();
      };
      await audio.play();
      return;
    }
  } catch {
    /* fall through to browser TTS */
  }
  browserSpeak(text, onEnd);
}

// ---------- Speech recognition (push-to-talk) ----------
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function speechRecognitionAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * Start a single push-to-talk capture. Returns a stop() function.
 * onResult fires with the final transcript; onState reports listening on/off.
 */
export function listen(
  onResult: (transcript: string) => void,
  onState?: (listening: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  if (!Ctor) return () => {};

  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const transcript = e.results?.[0]?.[0]?.transcript ?? "";
    if (transcript.trim()) onResult(transcript.trim());
  };
  rec.onend = () => onState?.(false);
  rec.onerror = () => onState?.(false);
  try {
    rec.start();
    onState?.(true);
  } catch {
    onState?.(false);
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
  };
}
