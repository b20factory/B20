// Server-side cached feed. Does every chain read on the VPS once, caches the
// result, and serves compact JSON — so the browser makes ONE same-origin fetch
// and the board is effectively instant. The RPC is hit only on cache refresh,
// not once per visitor.
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { createPublicClient, http, formatEther } from "viem";
import { base as baseChain, baseSepolia } from "viem/chains";
import { CHAIN_ID, ADDR, FACTORY_ABI, ERC20_ABI } from "@/lib/contracts";
import { isHidden } from "@/lib/hidden";
import {
  RH, RH_FACTORY_ABI, RH_CURVE_ABI, RH_V3_POOL_ABI, RH_V3, VENUE_V3, v3PriceEth, rhLive,
} from "@/lib/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Card = {
  token: string; venue: "base" | "robinhood"; creator: string; agent?: string;
  name: string; symbol: string; image: string; x?: string;
  priceEth: number; mcapEth: number;
};

const DATA = path.join(process.cwd(), "data");
async function readJson(file: string): Promise<any> {
  try { return JSON.parse(await fs.readFile(path.join(DATA, file), "utf8")); } catch { return {}; }
}

// Server RPCs: the VPS reaches both chains directly, no proxy needed.
const baseClient = createPublicClient({
  chain: CHAIN_ID === 8453 ? baseChain : baseSepolia,
  transport: http(
    process.env.B20_RPC_URL || (CHAIN_ID === 8453 ? undefined : "https://sepolia.base.org"),
    { timeout: 20_000 }
  ),
});
const rhClient = createPublicClient({
  chain: { id: RH.chainId, name: "Robinhood", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RH.rpcUpstream] } } },
  transport: http(process.env.RH_RPC_URL || RH.rpcUpstream),
});

let cache: { at: number; cards: Card[] } | null = null;
const TTL = 15_000;

async function build(): Promise<Card[]> {
  const [meta, agents] = await Promise.all([readJson("token-meta.json"), readJson("agents.json")]);
  // agents.json stores { address, name, ts } per address — expose just the name.
  const agentOf = (addr?: string) => {
    if (!addr) return undefined;
    const a = agents[addr.toLowerCase()];
    return typeof a === "string" ? a : a?.name;
  };
  const cards: Card[] = [];

  // Base venue
  try {
    const addrs = (await baseClient.readContract({ address: ADDR.tokenFactory, abi: FACTORY_ABI, functionName: "getAllTokens" }) as `0x${string}`[]).filter((a) => !isHidden(a));
    const rows = await Promise.all(addrs.map(async (tok, i) => {
      try {
        const [name, symbol] = await Promise.all([
          baseClient.readContract({ address: tok, abi: ERC20_ABI, functionName: "name" }),
          baseClient.readContract({ address: tok, abi: ERC20_ABI, functionName: "symbol" }),
        ]);
        const m = meta[tok.toLowerCase()] || {};
        return { token: tok, venue: "base", creator: (m.creator || "").toLowerCase(), agent: agentOf(m.creator), name: String(name), symbol: String(symbol), image: m.image || "", x: m.x, priceEth: 0, mcapEth: 0, _idx: i } as Card & { _idx: number };
      } catch { return null; }
    }));
    for (const r of rows) if (r) cards.push(r);
  } catch {}

  // Robinhood venue (curve + v3)
  if (rhLive) {
    try {
      const n = Number(await rhClient.readContract({ address: RH.factory, abi: RH_FACTORY_ABI, functionName: "tokensCount" }));
      const built = await Promise.all(Array.from({ length: n }, (_, i) => i).map(async (i) => {
        try {
          const tok = await rhClient.readContract({ address: RH.factory, abi: RH_FACTORY_ABI, functionName: "allTokens", args: [BigInt(i)] }) as `0x${string}`;
          if (isHidden(tok)) return null;
          const [name, symbol, launch] = await Promise.all([
            rhClient.readContract({ address: tok, abi: ERC20_ABI, functionName: "name" }),
            rhClient.readContract({ address: tok, abi: ERC20_ABI, functionName: "symbol" }),
            rhClient.readContract({ address: RH.factory, abi: RH_FACTORY_ABI, functionName: "launchOf", args: [tok] }) as Promise<readonly [string, string, string, string, string, number]>,
          ]);
          const market = launch[1] as `0x${string}`;
          const isV3 = Number(launch[5]) === VENUE_V3;
          let priceEth = 0;
          try {
            if (isV3) {
              const tokenIs0 = tok.toLowerCase() < RH_V3.weth.toLowerCase();
              const slot0 = await rhClient.readContract({ address: market, abi: RH_V3_POOL_ABI, functionName: "slot0" }) as readonly [bigint, number, number, number, number, number, boolean];
              priceEth = v3PriceEth(slot0[0], tokenIs0);
            } else {
              priceEth = Number(formatEther(await rhClient.readContract({ address: market, abi: RH_CURVE_ABI, functionName: "priceX18" }) as bigint));
            }
          } catch {}
          const m = meta[tok.toLowerCase()] || {};
          const creator = (m.creator || launch[3] || "").toLowerCase();
          return { token: tok, venue: "robinhood", creator, agent: agentOf(creator), name: String(name), symbol: String(symbol), image: m.image || "", x: m.x, priceEth, mcapEth: priceEth * 1_000_000_000 } as Card;
        } catch { return null; }
      }));
      for (const r of built) if (r) cards.push(r);
    } catch {}
  }

  // newest first (base idx ascending -> reverse; robinhood appended after)
  return cards;
}

export async function GET() {
  const now = cache ? Date.now() : 0; // Date.now allowed in a request handler
  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json({ cards: cache.cards, cached: true });
  }
  try {
    const cards = await build();
    cache = { at: Date.now(), cards };
    return NextResponse.json({ cards, cached: false });
  } catch {
    // serve stale on error rather than an empty board
    if (cache) return NextResponse.json({ cards: cache.cards, cached: true, stale: true });
    return NextResponse.json({ cards: [] });
  }
}
