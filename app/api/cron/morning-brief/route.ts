// app/api/cron/morning-brief/route.ts
// ~7:30am Toronto. Per founder: today's blocks + the week's one
// metric + partner's anchor → 3-sentence brief. SMS via Twilio if
// configured (phone numbers in profiles.phone), else Vercel logs.
import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase";
import { mondayOf, formatTime } from "@/lib/utils";

export const maxDuration = 30;

async function sendSMS(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return false;
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    }
  );
  return res.ok;
}

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const week = mondayOf(new Date());

  const [{ data: founders }, { data: weekly }, { data: anchors }] =
    await Promise.all([
      supabase.from("founders").select("user_id, display_name, profiles(*)"),
      supabase
        .from("reviews")
        .select("one_metric")
        .eq("type", "weekly")
        .eq("period_start", week)
        .maybeSingle(),
      supabase
        .from("anchor_commitments")
        .select("founder_id, commitment")
        .eq("week_start", week),
    ]);

  const results: Record<string, string> = {};

  for (const f of founders ?? []) {
    const { data: blocks } = await supabase
      .from("schedule_blocks")
      .select("start_at, end_at, tasks(title, is_anchor)")
      .eq("founder_id", f.user_id)
      .eq("block_date", today)
      .order("start_at");

    const rows = (blocks ?? []).map((b) => {
      const t = Array.isArray(b.tasks) ? b.tasks[0] : b.tasks;
      return { title: t?.title ?? "—", isAnchor: t?.is_anchor ?? false, start: b.start_at };
    });
    const numberOne = rows.find((r) => r.isAnchor) ?? rows[0];
    const partnerAnchor = (anchors ?? []).find((a) => a.founder_id !== f.user_id);

    const sentences: string[] = [];
    if (numberOne) {
      sentences.push(`Today's one thing: ${numberOne.title} at ${formatTime(numberOne.start)}.`);
      const rest = rows.filter((r) => r !== numberOne).slice(0, 2);
      if (rest.length > 0)
        sentences.push(`Also on deck: ${rest.map((r) => r.title).join("; ")}.`);
    } else {
      sentences.push("Nothing scheduled today — a clear day. Capture anything that comes up.");
    }
    if (weekly?.one_metric) sentences.push(`This week's metric: ${weekly.one_metric}`);
    if (partnerAnchor) sentences.push(`Partner's anchor: ${partnerAnchor.commitment}`);

    const brief = sentences.join(" ");
    const profile = Array.isArray(f.profiles) ? f.profiles[0] : f.profiles;
    const phone = (profile as { phone?: string } | null)?.phone;

    let delivered = false;
    if (phone) delivered = await sendSMS(phone, brief).catch(() => false);
    if (!delivered) console.log(`[morning-brief] ${f.display_name}: ${brief}`);
    results[f.display_name] = delivered ? "sms" : "logged";
  }

  return NextResponse.json({ ok: true, results });
}
