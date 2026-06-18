// components/nav.tsx
// ============================================================
// NAVIGATION — premium operating-system shell.
//  Desktop (md+): a fixed 232px glass sidebar with the Anchor mark,
//    grouped, labelled destinations, an animated active indicator,
//    and sign-out pinned to the bottom.
//  Mobile: a bottom tab bar of the four primaries + a "More" sheet
//    that slides up with everything else.
// One source of truth for the route list (ITEMS), rendered twice.
// ============================================================
"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
  group: "Workspace" | "Build" | "Partnership" | "Reflect" | "Account";
  primary?: boolean; // shown in the mobile bottom bar
};

const I = (path: ReactNode) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {path}
  </svg>
);

const ITEMS: Item[] = [
  {
    href: "/",
    label: "Assistant",
    exact: true,
    group: "Workspace",
    primary: true,
    icon: I(
      <>
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
        <path d="M19 15l.7 1.8L21.5 17.5 19.7 18.2 19 20l-.7-1.8L16.5 17.5 18.3 16.8z" />
      </>
    ),
  },
  {
    href: "/today",
    label: "Today",
    group: "Workspace",
    primary: true,
    icon: I(
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
      </>
    ),
  },
  {
    href: "/week",
    label: "Week",
    group: "Workspace",
    primary: true,
    icon: I(
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M9 9v12M15 9v12M8 2v4M16 2v4" />
      </>
    ),
  },
  {
    href: "/calendar",
    label: "Calendar",
    group: "Workspace",
    primary: true,
    icon: I(
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
        <circle cx="8" cy="14" r="0.6" fill="currentColor" />
        <circle cx="12" cy="14" r="0.6" fill="currentColor" />
        <circle cx="16" cy="14" r="0.6" fill="currentColor" />
        <circle cx="8" cy="18" r="0.6" fill="currentColor" />
        <circle cx="12" cy="18" r="0.6" fill="currentColor" />
      </>
    ),
  },
  {
    href: "/goals",
    label: "Goals",
    group: "Build",
    icon: I(
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      </>
    ),
  },
  {
    href: "/plan",
    label: "Plan",
    group: "Build",
    icon: I(
      <>
        <path d="M4 19V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
  },
  {
    href: "/inbox",
    label: "Inbox",
    group: "Build",
    icon: I(
      <>
        <path d="M3 13h4l1.5 3h7L17 13h4" />
        <path d="M5 13V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7" />
        <path d="M3 13v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
      </>
    ),
  },
  {
    href: "/team",
    label: "Team",
    group: "Partnership",
    icon: I(
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.2" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0M15 20a4 4 0 0 1 5.5-3.7" />
      </>
    ),
  },
  {
    href: "/money",
    label: "Money",
    group: "Partnership",
    icon: I(
      <>
        <rect x="2.5" y="6" width="19" height="13" rx="2" />
        <circle cx="12" cy="12.5" r="2.5" />
        <path d="M6 6V4.5M18 6V4.5" />
      </>
    ),
  },
  {
    href: "/contacts",
    label: "Contacts",
    group: "Partnership",
    icon: I(
      <>
        <path d="M4 4h16v16H4z" />
        <circle cx="12" cy="10" r="2.5" />
        <path d="M8 16a4 4 0 0 1 8 0M2 8h2M2 12h2M2 16h2" />
      </>
    ),
  },
  {
    href: "/resources",
    label: "Resources",
    group: "Partnership",
    icon: I(
      <>
        <path d="M4 5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
        <path d="M13 3v5h5M8 13h8M8 17h5" />
      </>
    ),
  },
  {
    href: "/review",
    label: "Review",
    group: "Reflect",
    icon: I(
      <>
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v4h-4" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
  {
    href: "/insights",
    label: "Insights",
    group: "Reflect",
    icon: I(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  },
  {
    href: "/settings",
    label: "Settings",
    group: "Account",
    icon: I(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08A1.7 1.7 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
      </>
    ),
  },
];

const GROUPS = ["Workspace", "Build", "Partnership", "Reflect", "Account"] as const;

const signOutIcon = I(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </>
);

function isActive(pathname: string, item: Item) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export default function Nav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  if (pathname.startsWith("/login") || pathname.startsWith("/signout")) return null;

  const primaries = ITEMS.filter((i) => i.primary);

  return (
    <>
      {/* ---------- DESKTOP SIDEBAR ---------- */}
      <aside
        aria-label="Main navigation"
        className="fixed left-0 top-0 z-40 hidden h-dvh w-[232px] flex-col border-r border-qa-line bg-[var(--qa-bg-2)]/70 px-3 pb-4 pt-5 backdrop-blur-xl md:flex"
      >
        <Link href="/" className="mb-5 flex items-center gap-2.5 px-2">
          <span
            className="grid h-9 w-9 place-items-center rounded-qa-sm font-mono text-base font-bold text-white"
            style={{ background: "var(--qa-grad)", boxShadow: "var(--qa-glow)" }}
          >
            A
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-[650] tracking-tight">Anchor OS</p>
            <p className="text-[11px] text-qa-text-3">Executive assistant</p>
          </div>
        </Link>

        <button
          onClick={() => window.dispatchEvent(new CustomEvent("qa:open-command-palette"))}
          className="mb-4 flex items-center gap-2.5 rounded-qa-sm border border-qa-line-strong bg-qa-glass px-2.5 py-2 text-sm text-qa-text-3 transition-colors hover:border-qa-accent/50 hover:text-qa-text"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span className="flex-1 text-left">Command center</span>
          <kbd className="rounded border border-qa-line-strong bg-qa-surface px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>

        <nav className="flex-1 space-y-4 overflow-y-auto">
          {GROUPS.map((group) => {
            const items = ITEMS.filter((i) => i.group === group);
            if (!items.length) return null;
            return (
              <div key={group}>
                <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-qa-text-3">
                  {group}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <SidebarLink key={item.href} item={item} active={isActive(pathname, item)} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mt-3 rounded-qa-sm border border-qa-line bg-qa-glass px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-qa-text-3">System</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-qa-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-qa-accent shadow-[0_0_10px_rgba(32,245,138,0.8)]" />
              Online
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-qa-text-3">Voice-first workspace, calendar, partner tasks, and decisions.</p>
        </div>

        <Link
          href="/signout"
          className="mt-2 flex items-center gap-3 rounded-qa-sm px-2.5 py-2 text-sm text-qa-text-2 transition-colors hover:bg-qa-glass hover:text-qa-warn"
        >
          <span className="shrink-0">{signOutIcon}</span>
          Sign out
        </Link>
      </aside>

      {/* ---------- MOBILE BOTTOM BAR ---------- */}
      <nav
        aria-label="Main navigation"
        className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-qa-line bg-[var(--qa-bg)]/85 py-1.5 backdrop-blur-xl md:hidden"
      >
        {primaries.map((item) => (
          <MobileTab key={item.href} item={item} active={isActive(pathname, item)} />
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="group flex flex-col items-center gap-0.5 rounded-qa-sm px-3 py-1.5 text-qa-text-2"
          aria-haspopup="dialog"
        >
          {I(
            <>
              <circle cx="5" cy="12" r="1.6" fill="currentColor" />
              <circle cx="12" cy="12" r="1.6" fill="currentColor" />
              <circle cx="19" cy="12" r="1.6" fill="currentColor" />
            </>
          )}
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* ---------- MOBILE "MORE" SHEET ---------- */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="More destinations">
          <div className="absolute inset-0 bg-black/50 qa-fade" onClick={() => setMoreOpen(false)} />
          <div className="qa-sheet absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-qa-line bg-[var(--qa-bg-2)] px-4 pb-8 pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-qa-line-strong" />
            <div className="grid grid-cols-3 gap-2">
              {ITEMS.filter((i) => !i.primary).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-qa border px-2 py-3 text-xs font-medium",
                    isActive(pathname, item)
                      ? "border-qa-accent/40 bg-qa-accent-soft text-qa-accent"
                      : "border-qa-line bg-qa-glass text-qa-text-2"
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
              <Link
                href="/signout"
                onClick={() => setMoreOpen(false)}
                className="flex flex-col items-center gap-1.5 rounded-qa border border-qa-line bg-qa-glass px-2 py-3 text-xs font-medium text-qa-warn"
              >
                {signOutIcon}
                Sign out
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SidebarLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-qa-sm px-2.5 py-2 text-sm font-medium transition-colors",
        active ? "bg-qa-accent-soft text-qa-text" : "text-qa-text-2 hover:bg-qa-glass hover:text-qa-text"
      )}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full"
          style={{ background: "var(--qa-grad)" }}
          aria-hidden
        />
      )}
      <span className={cn("shrink-0 transition-colors", active ? "text-qa-accent" : "")}>{item.icon}</span>
      {item.label}
    </Link>
  );
}

function MobileTab({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex flex-col items-center gap-0.5 rounded-qa-sm px-3 py-1.5 transition-colors",
        active ? "text-qa-accent" : "text-qa-text-2"
      )}
    >
      {item.icon}
      <span className="text-[10px] font-medium">{item.label}</span>
    </Link>
  );
}
