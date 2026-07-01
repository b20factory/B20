// Server-side proxy to the 0x Swap API (v2, permit2). Keeps the API key off the
// client. `mode=price` returns an indicative quote for the live display;
// `mode=quote` returns a firm, executable quote for the connected taker.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.ZEROX_API_KEY || "";
const ALLOWED = ["sellToken", "buyToken", "sellAmount", "taker", "slippageBps"];

export async function GET(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: "swap not configured" }, { status: 500 });
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") === "quote" ? "quote" : "price";

  const params = new URLSearchParams({ chainId: "8453" }); // Base mainnet
  for (const k of ALLOWED) {
    const v = sp.get(k);
    if (v) params.set(k, v);
  }
  if (!params.get("sellToken") || !params.get("buyToken") || !params.get("sellAmount")) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  try {
    const r = await fetch(`https://api.0x.org/swap/permit2/${mode}?${params}`, {
      headers: { "0x-api-key": KEY, "0x-version": "v2" },
      cache: "no-store",
    });
    const j = await r.json();
    return NextResponse.json(j, { status: r.status });
  } catch {
    return NextResponse.json({ error: "0x upstream failed" }, { status: 502 });
  }
}
