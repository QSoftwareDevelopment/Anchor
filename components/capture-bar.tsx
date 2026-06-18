// components/capture-bar.tsx
// Sticky top bar, every screen. Optimistic: the input clears on submit,
// the agent triages in the background, the founder gets on with their day.
//
// Why it matters: the capture bar closes the open loop (Zeigarnik effect)
// — an unrecorded thought keeps nagging, so the cost of recording it must
// be near zero. Press "/" from anywhere to jump here without reaching for
// the mouse; the input clears instantly so a second thought can follow.
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function CaptureBar() {
  const [value, setValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // "/" focuses the capture input from anywhere (unless already typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el as HTMLElement | null)?.isContentEditable;
      if (typing) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The assistant home has its own composer — no capture bar there.
  if (pathname === "/" || pathname.startsWith("/login")) return null;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    setValue(""); // optimistic — the thought is captured, move on
    showToast("Routing...");
    try {
      const res = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: text }),
      });
      if (!res.ok) throw new Error();
      showToast("Queued for triage");
      window.dispatchEvent(new CustomEvent("qa:captures-changed"));
      if (pathname.startsWith("/inbox")) router.refresh();
    } catch {
      setValue(text); // give the thought back, no loss
      showToast("Didn't save. Try again");
    }
  }

  return (
    <div className="sticky top-0 z-40 border-b border-qa-line bg-qa-bg/85 backdrop-blur md:pl-[232px]">
      <form onSubmit={submit} className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2.5 sm:px-5">
        <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-qa-accent sm:inline">
          Capture
        </span>
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            aria-label="Capture a thought"
            placeholder="Transmit a thought to Anchor..."
            className="qa-input py-2 pr-10"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          {!focused && !value && (
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-qa-line-strong bg-qa-surface px-1.5 py-0.5 font-mono text-[11px] text-qa-text-2 sm:block">
              /
            </kbd>
          )}
        </div>
        <button
          type="submit"
          disabled={!value.trim()}
          className="qa-btn qa-btn-primary hidden px-3 py-2 text-sm disabled:opacity-40 sm:inline-flex"
        >
          Send
        </button>
        {toast && (
          <span className="shrink-0 text-sm text-qa-text-2 qa-fade" role="status">
            {toast}
          </span>
        )}
      </form>
    </div>
  );
}
