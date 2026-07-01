// Server-side proxy for GeckoTerminal market data (pools / ohlcv / trades).
// The browser only talks to our own origin, so adblockers, CORS quirks and
// Cloudflare bot checks on the upstream can't break the chart. A small
// in-memory cache keeps us far under the upstream rate limit.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GECKO = "https://api.geckoterminal.com/api/v2";
const cache = new Map<string, { t: number; body: string; status: number }>();
const TTL = 15_000; // ms

const HEX = /^0x[a-fA-F0-9]{40}$/;
const TF: Record<string, string> = {
  "5m": "minute?aggregate=5&limit=120",
  "1h": "hour?aggregate=1&limit=120",
  "1d": "day?aggregate=1&limit=120",
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") || "";
  const addr = (sp.get("address") || "").trim();
  if (!HEX.test(addr)) return NextResponse.json({ error: "bad address" }, { status: 400 });

  let url = "";
  if (kind === "pools") url = `${GECKO}/networks/base/tokens/${addr}/pools?page=1`;
  else if (kind === "ohlcv") url = `${GECKO}/networks/base/pools/${addr}/ohlcv/${TF[sp.get("tf") || "1h"] || TF["1h"]}`;
  else if (kind === "trades") url = `${GECKO}/networks/base/pools/${addr}/trades`;
  else return NextResponse.json({ error: "bad kind" }, { status: 400 });

  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < TTL) {
    return new NextResponse(hit.body, { status: hit.status, headers: { "Content-Type": "application/json" } });
  }
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    const body = await r.text();
    if (r.ok) cache.set(url, { t: Date.now(), body, status: r.status });
    if (cache.size > 300) cache.clear();
    return new NextResponse(body, { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch {
    return NextResponse.json({ error: "market upstream failed" }, { status: 502 });
  }
}
