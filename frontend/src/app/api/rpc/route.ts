// Server-side JSON-RPC proxy to a keyed Base RPC (Alchemy). Keeps the API key off
// the client: the frontend talks to /api/rpc (same-origin), this forwards to B20_RPC_URL.
// Falls back to the public Base RPC if no keyed URL is configured.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = process.env.B20_RPC_URL || "https://mainnet.base.org";

export async function POST(req: NextRequest) {
  let body: string;
  try { body = await req.text(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  try {
    const r = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "rpc upstream failed" }, { status: 502 });
  }
}
