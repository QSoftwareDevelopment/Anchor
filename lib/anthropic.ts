// lib/anthropic.ts
// ============================================================
// Shared Claude API caller. Server-side ONLY — never import
// from a Client Component. All four agents go through here.
// ============================================================

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1000;

export async function callClaude(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Claude API ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (typeof text !== "string") throw new Error("Claude API: empty response");
    return text;
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

// Agents that must return JSON sometimes wrap it in prose or fences.
// Extract the first JSON object found; throw if none.
export function extractJSON<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in response");
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
