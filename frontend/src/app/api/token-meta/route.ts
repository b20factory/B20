// Off-chain token metadata store (image, website, X/twitter, description).
// The direct launch() only writes name/symbol/fees on-chain, so socials + image
// live here, keyed by lowercased token address. File-backed, no auth (testnet).
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "data", "token-meta.json");

type Meta = {
  token: string;
  venue?: "base" | "robinhood";
  image?: string;
  website?: string;
  x?: string;
  github?: string;
  telegram?: string;
  description?: string;
  creator?: string;
  name?: string;
  symbol?: string;
  ts?: number;
};

async function readAll(): Promise<Record<string, Meta>> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

async function writeAll(data: Record<string, Meta>) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
}

const isAddr = (s: unknown): s is string => typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

// normalize an X handle/url into a full link; accept @handle, handle, or url
function normX(v?: string): string | undefined {
  if (!v) return undefined;
  let s = v.trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  s = s.replace(/^@/, "");
  return `https://x.com/${s}`;
}
function normUrl(v?: string): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
function normGithub(v?: string): string | undefined {
  if (!v) return undefined;
  let s = v.trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  s = s.replace(/^@/, "");
  return `https://github.com/${s}`;
}
function normTelegram(v?: string): string | undefined {
  if (!v) return undefined;
  let s = v.trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  s = s.replace(/^@/, "");
  return `https://t.me/${s}`;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const all = await readAll();
  if (token) {
    if (!isAddr(token)) return NextResponse.json({ error: "bad token" }, { status: 400 });
    return NextResponse.json(all[token.toLowerCase()] ?? null);
  }
  // no token => return the whole map for the feed
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!isAddr(body?.token)) return NextResponse.json({ error: "bad token" }, { status: 400 });

  const key = body.token.toLowerCase();
  const all = await readAll();
  const prev = all[key] ?? { token: key };
  const next: Meta = {
    ...prev,
    token: key,
    venue: body.venue === "robinhood" ? "robinhood" : body.venue === "base" ? "base" : prev.venue,
    image: clean(body.image, 500) ?? prev.image,
    website: normUrl(clean(body.website, 300)) ?? prev.website,
    x: normX(clean(body.x, 120)) ?? prev.x,
    github: normGithub(clean(body.github, 120)) ?? prev.github,
    telegram: normTelegram(clean(body.telegram, 120)) ?? prev.telegram,
    description: clean(body.description, 400) ?? prev.description,
    creator: isAddr(body.creator) ? body.creator.toLowerCase() : prev.creator,
    name: clean(body.name, 64) ?? prev.name,
    symbol: clean(body.symbol, 16) ?? prev.symbol,
    ts: Date.now(),
  };
  all[key] = next;
  await writeAll(all);
  return NextResponse.json(next);
}
