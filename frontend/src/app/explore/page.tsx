"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { usePublicClient } from "wagmi";
import { formatEther, keccak256, encodeAbiParameters } from "viem";
import { ADDR, ERC20_ABI, FACTORY_ABI, POOL_FEE, POOL_TICK_SPACING, IS_TESTNET } from "@/lib/contracts";
import { getAllTokenMeta, type TokenMeta } from "@/lib/tokenMeta";
import { getEthUsd, ETH_USD_FALLBACK } from "@/lib/ethPrice";

const ZERO = "0x0000000000000000000000000000000000000000";

const POOL_MANAGER = (process.env.NEXT_PUBLIC_POOL_MANAGER || "") as `0x${string}`;

const SWAP_EVENT = {
  type: "event", name: "Swap",
  inputs: [
    { name: "id", type: "bytes32", indexed: true },
    { name: "sender", type: "address", indexed: true },
    { name: "amount0", type: "int128", indexed: false },
    { name: "amount1", type: "int128", indexed: false },
    { name: "sqrtPriceX96", type: "uint160", indexed: false },
    { name: "liquidity", type: "uint128", indexed: false },
    { name: "tick", type: "int24", indexed: false },
    { name: "fee", type: "uint24", indexed: false },
  ],
} as const;

function poolIdFor(token: `0x${string}`): `0x${string}` {
  return keccak256(encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
    ["0x0000000000000000000000000000000000000000", token, POOL_FEE, POOL_TICK_SPACING, ADDR.feeHook]
  ));
}
// currency0 = ETH, currency1 = token. price of token in ETH = 1 / (sqrt^2).
function ethPerToken(sqrtPriceX96: bigint): number {
  const r = Number(sqrtPriceX96) / 2 ** 96;
  const tpe = r * r;
  return tpe > 0 ? 1 / tpe : 0;
}
function absI128(n: bigint): bigint { return n < 0n ? -n : n; }

type Card = {
  token: `0x${string}`;
  name: string;
  symbol: string;
  image: string;
  x?: string;
  idx: number;          // creation order
  priceEth: number;     // token price in ETH (last swap)
  mcapEth: number;      // price * supply
  changePct: number | null;
  volEth: number;       // recent ETH volume through the pool
  trades: number;
  earnedEth: number;    // swap fees accrued in the token's splitter
  series: number[];     // recent price points for the sparkline
};

function fmtEth(n: number): string {
  if (!isFinite(n) || n === 0) return "0";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.0001) return n.toFixed(5);
  // tiny values: plain decimals, never scientific notation (no trailing e-7)
  return n.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}
function pct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`; }

type Tab = "new" | "trending" | "live";

export default function Explore() {
  const pub = usePublicClient();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("trending");
  const [search, setSearch] = useState("");
  const [ethUsd, setEthUsd] = useState(ETH_USD_FALLBACK);

  useEffect(() => { getEthUsd().then(setEthUsd); }, []);

  const load = useCallback(async () => {
    if (!pub) return;
    try {
      const addrs = await pub.readContract({ address: ADDR.tokenFactory, abi: FACTORY_ABI, functionName: "getAllTokens" }) as `0x${string}`[];
      const meta = await getAllTokenMeta();

      // base cards (name/symbol on-chain, image/socials off-chain)
      const base: Card[] = [];
      for (let i = 0; i < addrs.length; i++) {
        const tok = addrs[i];
        try {
          const [nameRaw, symbolRaw] = await Promise.all([
            pub.readContract({ address: tok, abi: ERC20_ABI, functionName: "name" }),
            pub.readContract({ address: tok, abi: ERC20_ABI, functionName: "symbol" }),
          ]);
          const m: TokenMeta | undefined = meta[tok.toLowerCase()];
          base.push({
            token: tok, name: String(nameRaw), symbol: String(symbolRaw),
            image: m?.image || "", x: m?.x, idx: i,
            priceEth: 0, mcapEth: 0, changePct: null, volEth: 0, trades: 0,
            earnedEth: 0, series: [],
          });
        } catch {}
      }
      setCards(base.slice().reverse());

      // earned fees per token — splitter ETH balance (best-effort, parallel)
      const splitters = await Promise.all(base.map((c) =>
        pub.readContract({ address: ADDR.tokenFactory, abi: FACTORY_ABI, functionName: "tokenToSplitter", args: [c.token] }).catch(() => ZERO as `0x${string}`)
      ));
      const earnedWei = await Promise.all(splitters.map((s) =>
        s && s !== ZERO ? pub.getBalance({ address: s as `0x${string}` }).catch(() => 0n) : Promise.resolve(0n)
      ));
      const earnedByTok: Record<string, number> = {};
      base.forEach((c, i) => { earnedByTok[c.token.toLowerCase()] = Number(formatEther(earnedWei[i])); });

      // enrich with on-chain pool activity — one chunked getLogs over all b20 pools,
      // then bucket by poolId. No DexScreener, works on testnet.
      if (base.length && POOL_MANAGER) {
        const byPool: Record<string, { series: number[]; vol: number; n: number }> = {};
        const idToTok: Record<string, `0x${string}`> = {};
        for (const c of base) idToTok[poolIdFor(c.token).toLowerCase()] = c.token;

        const latest = await pub.getBlockNumber();
        const step = 4500n;
        let end = latest;
        for (let i = 0; i < 8; i++) {
          const start = end > step ? end - step : 0n;
          const logs = await pub.getLogs({ address: POOL_MANAGER, event: SWAP_EVENT, fromBlock: start, toBlock: end }).catch(() => [] as any[]);
          // logs come oldest->newest within the chunk; we walk chunks newest->oldest,
          // so prepend each chunk to keep the series chronological
          const perPool: Record<string, { prices: number[]; vol: number; n: number }> = {};
          for (const l of logs) {
            const a: any = (l as any).args;
            const id = String(a.id).toLowerCase();
            if (!idToTok[id]) continue;
            const p = ethPerToken(a.sqrtPriceX96 as bigint);
            const vol = Number(formatEther(absI128(a.amount0 as bigint)));
            const pp = perPool[id] || (perPool[id] = { prices: [], vol: 0, n: 0 });
            pp.prices.push(p); pp.vol += vol; pp.n += 1;
          }
          for (const id in perPool) {
            const b = byPool[id] || (byPool[id] = { series: [], vol: 0, n: 0 });
            b.series = [...perPool[id].prices, ...b.series];
            b.vol += perPool[id].vol; b.n += perPool[id].n;
          }
          if (start === 0n) break;
          if (Object.values(byPool).reduce((s, b) => s + b.series.length, 0) >= 400) break;
          end = start - 1n;
        }

        const supply = 1_000_000_000; // B20 fixed supply
        setCards((prev) => prev.map((c) => {
          const earnedEth = earnedByTok[c.token.toLowerCase()] ?? 0;
          const b = byPool[poolIdFor(c.token).toLowerCase()];
          if (!b || b.series.length === 0) return { ...c, earnedEth };
          const series = b.series.slice(-40);
          const price = series[series.length - 1];
          const first = series[0];
          const change = first > 0 ? ((price - first) / first) * 100 : null;
          return { ...c, priceEth: price, mcapEth: price * supply, changePct: change, volEth: b.vol, trades: b.n, earnedEth, series };
        }));
      } else {
        setCards((prev) => prev.map((c) => ({ ...c, earnedEth: earnedByTok[c.token.toLowerCase()] ?? 0 })));
      }
    } catch {}
    setLoading(false);
  }, [pub]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    // search by contract address (CA) as well as name / ticker
    if (q.startsWith("0x") && q.length >= 6) return cards.filter((c) => c.token.toLowerCase().includes(q));
    return cards.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
  }, [cards, search]);

  const newest = useMemo(() => [...filtered].sort((a, b) => b.idx - a.idx), [filtered]);
  const trending = useMemo(() => [...filtered].sort((a, b) => b.volEth - a.volEth || b.trades - a.trades || b.idx - a.idx), [filtered]);
  const live = useMemo(() => filtered.filter((c) => c.trades > 0).sort((a, b) => b.idx - a.idx), [filtered]);
  const featured = useMemo(() => trending.filter((c) => c.trades > 0).slice(0, 8), [trending]);

  const list = tab === "new" ? newest : tab === "live" ? live : trending;

  const tabBtn = (id: Tab, label: string) => (
    <button key={id} onClick={() => setTab(id)}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === id ? "bg-panel text-text shadow-card" : "text-muted hover:text-text"}`}>
      {label}
    </button>
  );

  return (
    <main className="pb-16">
      <Ticker cards={newest} />

      <div className="wrap py-8">
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <p className="h-sec mb-1.5">Explore</p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text">Discover B20 launches</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {IS_TESTNET && <span className="chip border-warn/30 text-warn text-[11px]">Testnet</span>}
            <Link href="/app" className="btn-primary">Launch</Link>
          </div>
        </div>

        <input className="input w-full mb-6" placeholder="Search by name, ticker, or contract address (0x…)" value={search} onChange={(e) => setSearch(e.target.value)} />

        {loading ? (
          <div className="term p-10 text-center text-muted">Scanning the chain…</div>
        ) : cards.length === 0 ? (
          <div className="term p-10 text-center">
            <div className="text-text font-medium mb-1">No tokens launched yet</div>
            <p className="text-sm text-muted mb-5">Be the first to deploy a native B20.</p>
            <Link href="/app" className="btn-primary">Launch a token</Link>
          </div>
        ) : search ? (
          <Grid items={list} ethUsd={ethUsd} />
        ) : (
          <div className="space-y-9">
            {featured.length > 0 && <Rail title="Featured" subtitle="Most active right now" items={featured} ethUsd={ethUsd} />}
            <div className="inline-flex rounded-lg bg-panel2 p-1">
              {tabBtn("trending", "Trending")}
              {tabBtn("new", "New")}
              {tabBtn("live", "Live")}
            </div>
            <Grid items={list} ethUsd={ethUsd} />
          </div>
        )}
      </div>
    </main>
  );
}

// scrolling activity ticker built from recent launches / trades
function Ticker({ cards }: { cards: Card[] }) {
  const events = cards.length
    ? cards.flatMap((c) => {
        const out: string[] = [];
        if (c.trades > 0) out.push(`$${c.symbol} ${pct(c.changePct ?? 0)} · ${fmtEth(c.volEth)} ETH vol`);
        else out.push(`$${c.symbol} just launched`);
        return out;
      }).slice(0, 24)
    : ["B20factory — native token launchpad on Base Beryl"];
  const items = [...events, ...events, ...events];
  return (
    <div className="border-b border-line bg-panel py-2 overflow-hidden select-none">
      <div className="flex whitespace-nowrap animate-ticker">
        {items.map((e, i) => (
          <span key={i} className="text-[11px] text-muted mx-7 font-mono tabular"><span className="text-beryl mr-2">•</span>{e}</span>
        ))}
      </div>
      <style jsx>{`
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-33.33%); } }
        .animate-ticker { animation: ticker ${Math.max(events.length * 5, 30)}s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .animate-ticker { animation: none; } }
      `}</style>
    </div>
  );
}

// tiny up/down sparkline from the recent price series
function Sparkline({ series, up }: { series: number[]; up: boolean }) {
  if (!series || series.length < 2) return <div className="h-7" />;
  const W = 96, H = 28, P = 2;
  const min = Math.min(...series), max = Math.max(...series);
  const range = max - min || max || 1;
  const x = (i: number) => P + (i / (series.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - min) / range) * (H - 2 * P);
  const d = series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const stroke = up ? "#0D9488" : "#D92D20";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <path d={`${d} L${x(series.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`} fill={stroke} fillOpacity="0.12" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function usd(n: number, ethUsd: number): string {
  const v = n * ethUsd;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v > 0) return `$${v.toFixed(4)}`;
  return "$0";
}

// horizontal swipeable rail
function Rail({ title, subtitle, items, ethUsd }: { title: string; subtitle?: string; items: Card[]; ethUsd: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  if (!items.length) return null;
  const nudge = (d: number) => scroller.current?.scrollBy({ left: d * 300, behavior: "smooth" });
  return (
    <section>
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-text leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="hidden sm:flex items-center gap-1.5">
          <button onClick={() => nudge(-1)} aria-label="left" className="w-7 h-7 inline-flex items-center justify-center rounded-full border border-line text-muted hover:border-beryl hover:text-beryl transition-colors">‹</button>
          <button onClick={() => nudge(1)} aria-label="right" className="w-7 h-7 inline-flex items-center justify-center rounded-full border border-line text-muted hover:border-beryl hover:text-beryl transition-colors">›</button>
        </div>
      </div>
      <div ref={scroller} className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x">
        {items.map((c) => (
          <div key={c.token} className="w-64 shrink-0 snap-start"><CardEl c={c} ethUsd={ethUsd} /></div>
        ))}
      </div>
    </section>
  );
}

function Grid({ items, ethUsd }: { items: Card[]; ethUsd: number }) {
  if (!items.length) return <div className="term p-8 text-center text-muted">nothing here yet</div>;
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((c) => <CardEl key={c.token} c={c} ethUsd={ethUsd} />)}
    </div>
  );
}

function CardEl({ c, ethUsd }: { c: Card; ethUsd: number }) {
  const up = (c.changePct ?? 0) >= 0;
  const traded = c.trades > 0;
  return (
    <div className="card-hover group p-4">
      <Link href={`/token/${c.token}`} className="flex items-start gap-3">
        {c.image ? (
          <img src={c.image} alt={c.symbol} className="w-11 h-11 rounded-lg object-cover shrink-0 border border-line" />
        ) : (
          <div className="w-11 h-11 rounded-lg border border-line bg-bg/60 flex items-center justify-center text-beryl font-bold text-sm shrink-0">{c.symbol.slice(0, 2)}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text group-hover:text-beryl transition-colors truncate">{c.name}</span>
            <span className="chip text-[10px] px-1.5 py-0 border-beryl/25 text-beryl/70 shrink-0">B20</span>
          </div>
          <div className="text-[12px] text-muted">{c.symbol}</div>
        </div>
        {traded ? <Sparkline series={c.series} up={up} /> : <div className="h-7 flex items-center text-[10px] text-muted">no trades</div>}
      </Link>

      <Link href={`/token/${c.token}`} className="block mt-3 pt-3 hairline">
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <div className="text-muted/80">Mcap</div>
            <div className="text-text font-mono tabular">{traded ? usd(c.mcapEth, ethUsd) : "--"}</div>
            {c.changePct !== null && <div className={`font-mono tabular ${up ? "text-beryl-glow" : "text-bad"}`}>{pct(c.changePct)}</div>}
          </div>
          <div>
            <div className="text-muted/80">Volume</div>
            <div className="text-text font-mono tabular">{c.volEth > 0 ? `${fmtEth(c.volEth)} ETH` : "--"}</div>
            <div className="text-muted/60 font-mono tabular">{c.volEth > 0 ? usd(c.volEth, ethUsd) : ""}</div>
          </div>
          <div>
            <div className="text-muted/80">Fees</div>
            <div className="text-beryl-glow font-mono tabular">{c.earnedEth > 0 ? `${fmtEth(c.earnedEth)} ETH` : "--"}</div>
            <div className="text-muted/60 font-mono tabular">{c.earnedEth > 0 ? usd(c.earnedEth, ethUsd) : ""}</div>
          </div>
        </div>
      </Link>

      <div className="flex gap-1.5 mt-3">
        <Link href={`/token/${c.token}`} className="chip-on flex-1 justify-center text-[11px] py-1">Buy</Link>
        <Link href={`/token/${c.token}`} className="chip flex-1 justify-center text-[11px] py-1 hover:border-bad/40 hover:text-bad">Sell</Link>
        <Link href={`/token/${c.token}`} className="chip text-[11px] py-1 px-2.5 hover:border-beryl-dim">Chart</Link>
      </div>
    </div>
  );
}
