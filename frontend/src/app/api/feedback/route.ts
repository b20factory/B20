// Feedback sink. Stores each message to data/feedback.json and, if a Telegram
// bot token + chat id are configured (server-only env), DMs it to the owner.
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA = path.join(process.cwd(), "data");
const FILE = path.join(DATA, "feedback.json");
const MAX = 2000;

// crude per-process throttle: drop bursts from a single IP
const hits = new Map<string, number[]>();
function throttled(ip: string) {
  const now = Date.now();
  const win = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  win.push(now);
  hits.set(ip, win);
  return win.length > 5; // max 5 / minute / ip
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (throttled(ip)) return NextResponse.json({ error: "slow down" }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const message = String(body?.message || "").trim().slice(0, MAX);
    const contact = String(body?.contact || "").trim().slice(0, 120);
    if (!message) return NextResponse.json({ error: "empty" }, { status: 400 });

    const entry = { ts: new Date().toISOString(), ip, contact, message };
    try {
      fs.mkdirSync(DATA, { recursive: true });
      const list = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : [];
      list.push(entry);
      fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
    } catch {}

    const token = process.env.FEEDBACK_TG_TOKEN;
    const chat = process.env.FEEDBACK_TG_CHAT;
    if (token && chat) {
      const text = `B20factory feedback\n${contact ? `from: ${contact}\n` : ""}${message}`;
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
        });
      } catch {}
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
