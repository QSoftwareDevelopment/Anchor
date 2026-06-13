// components/review-card.tsx
// Renders agent review output as clean prose. Handles the agents' simple
// markdown — "## headings", "- bullets", and **bold** — without pulling in
// a markdown library. The serif body (see .review-prose) makes the memo
// read like writing from a partner, not UI chrome.
import { Fragment, type ReactNode } from "react";

// inline **bold**
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    )
  );
}

export default function ReviewCard({ summary }: { summary: string }) {
  const lines = summary.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    out.push(
      <ul key={key}>
        {list.map((li, i) => (
          <li key={i}>{inline(li)}</li>
        ))}
      </ul>
    );
    list = [];
  };

  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) {
      flushList(`l${i}`);
      return;
    }
    if (t.startsWith("## ")) {
      flushList(`l${i}`);
      out.push(<h2 key={i}>{t.slice(3)}</h2>);
      return;
    }
    if (/^[-•*]\s+/.test(t)) {
      list.push(t.replace(/^[-•*]\s+/, ""));
      return;
    }
    flushList(`l${i}`);
    out.push(<p key={i}>{inline(t)}</p>);
  });
  flushList("end");

  return <div className="review-prose qa-card p-6">{out}</div>;
}
