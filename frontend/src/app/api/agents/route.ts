// Agent registry: terminal users register a display name for their wallet.
// Launches from a registered wallet show "by <name>" plus an AGENT badge in the
// feed; everyone else shows a short address. File-backed like token-meta.
//
// Register requires a wallet signature over a fixed message, so nobody can
// claim a name for an address they don't control.
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { verifyMessage } from "viem";
import { registerMessage } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "data", "agents.json");
const NAME_RE = /^[a-zA-Z0-9_\-. ]{3,24}$/;

type Agent = { address: string; name: string; ts: number };

async function readAll(): Promise<Record<string, Agent>> {
  try {
    const j = JSON.parse(await fs.readFile(FILE, "utf8"));
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

async function writeAll(data: Record<string, Agent>) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function GET() {
  const all = await readAll();
  // public map: lowercased address -> name
  const out: Record<string, string> = {};
  for (const k in all) out[k] = all[k].name;
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  let body: { address?: unknown; name?: unknown; sig?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });
  }
  const address = String(body.address ?? "");
  const name = String(body.name ?? "").trim();
  const sig = String(body.sig ?? "");

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ ok: false, error: "bad address" }, { status: 400 });
  }
  if (!NAME_RE.test(name)) {
    return NextResponse.json(
      { ok: false, error: "name must be 3-24 chars: letters, numbers, space, _ - ." },
      { status: 400 }
    );
  }

  let valid = false;
  try {
    valid = await verifyMessage({
      address: address as `0x${string}`,
      message: registerMessage(name, address),
      signature: sig as `0x${string}`,
    });
  } catch {}
  if (!valid) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  const all = await readAll();
  const key = address.toLowerCase();
  const taken = Object.entries(all).find(
    ([addr, a]) => a.name.toLowerCase() === name.toLowerCase() && addr !== key
  );
  if (taken) {
    return NextResponse.json({ ok: false, error: "that name is taken" }, { status: 409 });
  }
  all[key] = { address: key, name, ts: Date.now() };
  await writeAll(all);
  return NextResponse.json({ ok: true, name });
}
