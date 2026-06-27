// Live ETH/USD for sizing the starting market cap -> pool ETH conversion.
// Server-side (no CORS), cached ~60s, with a chain of sources + a safe fallback.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK = 3500;
let cache = { usd: 0, ts: 0 };

async function fromCoinbase(): Promise<number> {
  const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { cache: "no-store" });
  const d = await r.json();
  return Number(d?.data?.amount);
}
async function fromCoingecko(): Promise<number> {
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", { cache: "no-store" });
  const d = await r.json();
  return Number(d?.ethereum?.usd);
}

export async function GET() {
  const now = Date.now();
  if (cache.usd > 0 && now - cache.ts < 60_000) {
    return NextResponse.json({ usd: cache.usd, cached: true });
  }
  for (const src of [fromCoinbase, fromCoingecko]) {
    try {
      const p = await src();
      if (p > 0 && isFinite(p)) {
        cache = { usd: p, ts: now };
        return NextResponse.json({ usd: p });
      }
    } catch {}
  }
  return NextResponse.json({ usd: cache.usd || FALLBACK, fallback: true });
}
