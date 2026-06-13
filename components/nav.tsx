// components/nav.tsx
// The four loop stages up top — Today / Plan / Inbox / Review — then
// Insights + Settings as support. Keeping the primary set to the four
// verbs of the operating loop respects Hick's Law: fewer top-level
// choices, faster orientation, and the nav mirrors the mental model
// (capture → plan → execute → review).
//
// Desktop: 60px icon sidebar. Mobile: bottom tab bar.
"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

const supabase = createBrowserSupabase();

type Item = { href: string; label: string; group: "primary" | "secondary"; icon: ReactNode };

const ICON = {
  today: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  plan: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  ),
  inbox: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 13h4l2 3h4l2-3h4" />
      <path d="M4 13V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6" />
      <path d="M4 13v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
    </svg>
  ),
  review: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21a9 9 0 1 0-9-9" />
      <path d="M3 12h4M12 8v4l2 2" />
    </svg>
  ),
  insights: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  settings: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08A1.7 1.7 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </svg>
  ),
};

const ITEMS: Item[] = [
  { href: "/today", label: "Today", group: "primary", icon: ICON.today },
  { href: "/plan", label: "Plan", group: "primary", icon: ICON.plan },
  { href: "/inbox", label: "Inbox", group: "primary", icon: ICON.inbox },
  { href: "/review", label: "Review", group: "primary", icon: ICON.review },
  { href: "/insights", label: "Insights", group: "secondary", icon: ICON.insights },
  { href: "/settings", label: "Settings", group: "secondary", icon: ICON.settings },
];

export default function Nav() {
  const pathname = usePathname();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (pathname.startsWith("/login")) return;
    let cancelled = false;
    async function refresh() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { count } = await supabase
        .from("captures")
        .select("id", { count: "exact", head: true })
        .eq("state", "pending")
        .eq("captured_by", auth.user.id);
      if (!cancelled) setPending(count ?? 0);
    }
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener("qa:captures-changed", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("qa:captures-changed", onChange);
    };
  }, [pathname]);

  if (pathname.startsWith("/login")) return null;

  const renderItem = (item: Item) => {
    const active = pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex flex-col items-center gap-0.5 rounded-qa-sm px-2 py-1.5 transition-colors md:mx-auto md:px-2.5",
          active ? "bg-qa-accent-soft text-qa-accent" : "text-qa-text-2 hover:bg-qa-surface hover:text-qa-text"
        )}
      >
        {item.icon}
        <span className="text-[10px] font-medium md:sr-only">{item.label}</span>
        {item.href === "/inbox" && pending > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-qa-accent px-1 font-mono text-[10px] font-semibold text-qa-accent-text">
            {pending}
          </span>
        )}
      </Link>
    );
  };

  const primary = ITEMS.filter((i) => i.group === "primary");
  const secondary = ITEMS.filter((i) => i.group === "secondary");

  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-qa-line bg-white py-1.5",
        "md:bottom-auto md:right-auto md:top-0 md:h-dvh md:w-[60px] md:flex-col md:justify-start md:gap-1.5 md:border-r md:border-t-0 md:pt-16"
      )}
    >
      {primary.map(renderItem)}
      {/* secondary group: inline on mobile, pinned to the bottom on desktop */}
      <div className="contents md:mt-auto md:mb-4 md:flex md:flex-col md:gap-1.5">
        {secondary.map(renderItem)}
      </div>
    </nav>
  );
}
