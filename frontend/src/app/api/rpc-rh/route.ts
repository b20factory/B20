// Same-origin JSON-RPC proxy for Robinhood Chain.
// Some ISPs (e.g. Indonesian Internet Positif) block chain.robinhood.com, so the
// browser talks to this endpoint and the server forwards the call upstream.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM =
  process.env.RH_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

export async function POST(req: NextRequest) {
  let body: string;
  try { body = await req.text(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  try {
    const r = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "upstream unreachable" } },
      { status: 502 }
    );
  }
}
