"use client";
// Swap any Base token, Origin-style token view: price chart + live trades on
// the left, a buy/sell box on the right. Market data comes from GeckoTerminal
// (chart + trades); execution goes through the 0x Swap API v2 (permit2) via the
// server-side /api/swap proxy so the key stays private. Base MAINNET (8453).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { base } from "wagmi/chains";
import { formatUnits, parseUnits, parseEther, formatEther, numberToHex, size as sigSize, erc20Abi } from "viem";

const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const PRESETS: [string, string][] = [
  ["DEGEN", "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed"],
  ["TOSHI", "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4"],
  ["cbBTC", "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"],
];

type Market = {
  pool: string;            // gecko pool id (0x…)
  name: string;
  symbol: string;
  priceUsd: number;
  change24h: number;
  volume24h: number;
  liquidityUsd: number;
};
type Candle = { t: number; c: number };
type Trade = { buy: boolean; usd: number; trader: string; ts: number; tx: string };

const fmtUsd = (n: number) => {
  if (!isFinite(n) || n === 0) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(Math.min(10, Math.max(4, 2 - Math.floor(Math.log10(n)))))}`;
};
const fmtAmt = (n: number) => {
  if (!isFinite(n) || n === 0) return "0";
  if (n >= 1e6) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
};
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const ago = (sec: number) => {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - sec);
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
};

export default function SwapPage() {
  const [addr, setAddr] = useState("");
  const [token, setToken] = useState<`0x${string}` | "">("");
  const [market, setMarket] = useState<Market | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tf, setTf] = useState<"5m" | "1h" | "1d">("1h");
  const [chartErr, setChartErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const pick = (a: string) => {
    const v = a.trim();
    setAddr(v);
    if (/^0x[a-fA-F0-9]{40}$/.test(v)) setToken(v as `0x${string}`);
  };

  // market info + top pool
  useEffect(() => {
    if (!token) return;
    let on = true;
    setLoading(true); setNotFound(false); setMarket(null); setCandles([]); setTrades([]);
    (async () => {
      try {
        const j = await fetch(`/api/market?kind=pools&address=${token}`).then((r) => r.json());
        // prefer a pool where our token is the BASE side so price/kind read correctly
        const pools: any[] = j?.data || [];
        const isBase = (p: any) => (p?.relationships?.base_token?.data?.id || "").toLowerCase() === `base_${token.toLowerCase()}`;
        const p = pools.find(isBase) || pools[0];
        if (!p) { if (on) { setNotFound(true); setLoading(false); } return; }
        const at = p.attributes;
        const name = (at.name || "").split(" / ")[0];
        if (on) setMarket({
          pool: p.id.replace(/^base_/, ""),
          name: at.name || name,
          symbol: name,
          priceUsd: Number(isBase(p) ? at.base_token_price_usd : at.quote_token_price_usd) || 0,
          change24h: Number(at.price_change_percentage?.h24 || 0),
          volume24h: Number(at.volume_usd?.h24 || 0),
          liquidityUsd: Number(at.reserve_in_usd || 0),
        });
      } catch { if (on) setNotFound(true); }
      finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, [token]);

  // chart candles
  useEffect(() => {
    if (!market) return;
    let on = true;
    setChartErr("");
    (async () => {
      try {
        const r = await fetch(`/api/market?kind=ohlcv&address=${market.pool}&tf=${tf}`);
        const j = await r.json();
        const list: number[][] = j?.data?.attributes?.ohlcv_list || [];
        const cs = list.map((v) => ({ t: v[0], c: Number(v[4]) })).filter((c) => c.c > 0).sort((a, b) => a.t - b.t);
        if (on) {
          setCandles(cs);
          if (!r.ok || (cs.length < 2 && j?.errors)) setChartErr("Chart data is unavailable right now. Try again in a moment.");
        }
      } catch { if (on) { setCandles([]); setChartErr("Chart data is unavailable right now. Try again in a moment."); } }
    })();
    return () => { on = false; };
  }, [market, tf]);

  // live trades, refresh every 12s
  useEffect(() => {
    if (!market) return;
    let on = true;
    const load = async () => {
      try {
        const j = await fetch(`/api/market?kind=trades&address=${market.pool}`).then((r) => r.json());
        const ts: Trade[] = (j?.data || []).slice(0, 30).map((d: any) => ({
          buy: d.attributes.kind === "buy",
          usd: Number(d.attributes.volume_in_usd || 0),
          trader: d.attributes.tx_from_address || "",
          ts: Math.floor(new Date(d.attributes.block_timestamp).getTime() / 1000),
          tx: d.attributes.tx_hash,
        }));
        if (on) setTrades(ts);
      } catch {}
    };
    load();
    const id = setInterval(load, 12000);
    return () => { on = false; clearInterval(id); };
  }, [market]);

  return (
    <main className="wrap py-8 pb-20">
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <p className="h-sec mb-1.5">Swap</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text">Trade any Base token</h1>
        </div>
        <span className="ml-auto chip">Base · mainnet · via 0x</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <input className="input max-w-md font-mono text-[13px]" placeholder="Paste a token contract address (0x…)"
          value={addr} onChange={(e) => pick(e.target.value)} />
        {PRESETS.map(([s, a]) => (
          <button key={s} className={token === a ? "chip-on" : "chip hover:border-beryl-dim"} onClick={() => pick(a)}>{s}</button>
        ))}
      </div>

      {!token ? (
        <div className="term p-12 text-center">
          <p className="text-text font-medium mb-1">Pick a token to start</p>
          <p className="text-sm text-muted">Paste a contract address, or choose one of the presets above.</p>
        </div>
      ) : loading ? (
        <div className="term p-12 text-center text-muted">Loading market…</div>
      ) : notFound || !market ? (
        <div className="term p-12 text-center">
          <p className="text-text font-medium mb-1">No market found</p>
          <p className="text-sm text-muted">That token has no active liquidity pool on Base.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
          {/* left, market header + chart + live trades */}
          <div className="space-y-4 min-w-0">
            <div className="term p-5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div>
                  <div className="text-sm text-muted">{market.name}</div>
                  <div className="text-2xl font-semibold tracking-tight text-text font-mono tabular">{fmtUsd(market.priceUsd)}</div>
                </div>
                <Metric label="24h" value={`${market.change24h >= 0 ? "+" : ""}${market.change24h.toFixed(2)}%`} tone={market.change24h >= 0 ? "up" : "down"} />
                <Metric label="24h volume" value={fmtUsd(market.volume24h)} />
                <Metric label="Liquidity" value={fmtUsd(market.liquidityUsd)} />
                <div className="ml-auto inline-flex rounded-lg bg-panel2 p-1">
                  {(["5m", "1h", "1d"] as const).map((t) => (
                    <button key={t} onClick={() => setTf(t)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${tf === t ? "bg-panel text-text shadow-card" : "text-muted hover:text-text"}`}>{t}</button>
                  ))}
                </div>
              </div>
              <Chart candles={candles} err={chartErr} />
            </div>

            <LiveTrades trades={trades} />
          </div>

          {/* right, swap box */}
          <SwapBox token={token} symbol={market.symbol} priceUsd={market.priceUsd} />
        </div>
      )}
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div>
      <div className="text-[11px] text-muted uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-mono tabular font-medium ${tone === "up" ? "text-beryl-glow" : tone === "down" ? "text-bad" : "text-text"}`}>{value}</div>
    </div>
  );
}

function Chart({ candles, err }: { candles: Candle[]; err?: string }) {
  if (candles.length < 2) return <div className="h-[300px] flex items-center justify-center text-sm text-muted">{err || "Not enough data for a chart yet."}</div>;
  const W = 1000, H = 300, P = 8;
  const vals = candles.map((c) => c.c);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || max || 1;
  const x = (i: number) => P + (i / (candles.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - min) / range) * (H - 2 * P);
  const line = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(vals.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
  const up = vals[vals.length - 1] >= vals[0];
  const stroke = up ? "#0D9488" : "#D92D20";
  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 280 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="swapfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#swapfill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-muted mt-1 font-mono tabular">
        <span>Low {fmtUsd(min)}</span>
        <span>High {fmtUsd(max)}</span>
      </div>
    </div>
  );
}

function LiveTrades({ trades }: { trades: Trade[] }) {
  return (
    <div className="term p-5">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Live trades</p>
        <span className="w-1.5 h-1.5 rounded-full bg-beryl" />
      </div>
      {trades.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">No recent trades.</p>
      ) : (
        <div>
          <div className="grid grid-cols-[64px_1fr_auto_auto] gap-x-4 text-[10px] font-semibold text-muted uppercase tracking-wider pb-2 border-b border-line">
            <span>Type</span><span>Size</span><span className="text-right">Trader</span><span className="text-right">Time</span>
          </div>
          <div className="divide-y divide-line/70 max-h-72 overflow-y-auto">
            {trades.map((t, i) => (
              <a key={t.tx + i} href={`https://basescan.org/tx/${t.tx}`} target="_blank" rel="noreferrer"
                className="grid grid-cols-[64px_1fr_auto_auto] gap-x-4 items-center py-2 text-[13px] hover:bg-panel2/60 transition-colors">
                <span className={`font-medium ${t.buy ? "text-beryl-glow" : "text-bad"}`}>{t.buy ? "Buy" : "Sell"}</span>
                <span className="font-mono tabular text-text">{fmtUsd(t.usd)}</span>
                <span className="font-mono text-right text-muted">{short(t.trader)}</span>
                <span className="font-mono text-right text-muted/80">{ago(t.ts)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- swap box (0x v2 permit2 flow) ----
type Phase = "idle" | "quoting" | "approving" | "signing" | "sending" | "done" | "err";

function SwapBox({ token, symbol, priceUsd }: { token: `0x${string}`; symbol: string; priceUsd: number }) {
  const { address: wallet, isConnected, chainId } = useAccount();
  const { data: wc } = useWalletClient();
  const pub = usePublicClient({ chainId: base.id });
  const { switchChainAsync } = useSwitchChain();

  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("0.01");
  const [decimals, setDecimals] = useState(18);
  const [tokenBal, setTokenBal] = useState<bigint>(0n);
  const [ethBal, setEthBal] = useState<bigint>(0n);
  const [quoteOut, setQuoteOut] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const seq = useRef(0);

  const sellToken = tab === "buy" ? ETH : token;
  const buyToken = tab === "buy" ? token : ETH;

  // decimals + balances
  useEffect(() => {
    if (!pub) return;
    let on = true;
    (async () => {
      try {
        const d = await pub.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
        if (on) setDecimals(Number(d));
      } catch {}
      if (wallet) {
        const [tb, eb] = await Promise.all([
          pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }).catch(() => 0n),
          pub.getBalance({ address: wallet }).catch(() => 0n),
        ]);
        if (on) { setTokenBal(tb as bigint); setEthBal(eb); }
      }
    })();
    return () => { on = false; };
  }, [pub, token, wallet, phase]);

  const sellAmountWei = useMemo(() => {
    const n = parseFloat(amt);
    if (!(n > 0)) return null;
    try { return tab === "buy" ? parseEther(amt) : parseUnits(amt, decimals); } catch { return null; }
  }, [amt, tab, decimals]);

  // indicative quote (debounced), the live number under the input
  useEffect(() => {
    setQuoteOut(null); setErr("");
    if (!sellAmountWei) return;
    const my = ++seq.current;
    const id = setTimeout(async () => {
      try {
        const q = await fetch(`/api/swap?mode=price&sellToken=${sellToken}&buyToken=${buyToken}&sellAmount=${sellAmountWei}`).then((r) => r.json());
        if (seq.current !== my) return;
        if (q?.buyAmount) setQuoteOut(Number(formatUnits(BigInt(q.buyAmount), tab === "buy" ? decimals : 18)));
        else if (q?.error || q?.name) setErr("No route for this size.");
      } catch {}
    }, 450);
    return () => clearTimeout(id);
  }, [sellAmountWei, sellToken, buyToken, tab, decimals]);

  const busy = phase === "quoting" || phase === "approving" || phase === "signing" || phase === "sending";

  async function swap() {
    if (!wc || !pub || !wallet || !sellAmountWei) return;
    setErr(""); setMsg("");
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });

      setPhase("quoting");
      const q = await fetch(`/api/swap?mode=quote&sellToken=${sellToken}&buyToken=${buyToken}&sellAmount=${sellAmountWei}&taker=${wallet}&slippageBps=150`).then((r) => r.json());
      if (!q?.transaction?.data) throw new Error(q?.validationErrors?.[0]?.description || q?.error || "No route found for this trade.");

      // selling an ERC-20: make sure permit2 (or the router) can spend it
      if (tab === "sell") {
        const spender = (q.issues?.allowance?.spender || q.permit2?.eip712?.domain?.verifyingContract || q.transaction.to) as `0x${string}`;
        const allowance = await pub.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [wallet, spender] });
        if ((allowance as bigint) < sellAmountWei) {
          setPhase("approving");
          const ah = await wc.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, 2n ** 256n - 1n], chain: base });
          await pub.waitForTransactionReceipt({ hash: ah });
        }
      }

      // permit2: sign the typed data and append `len(sig) . sig` to the calldata
      let data: `0x${string}` = q.transaction.data;
      if (q.permit2?.eip712) {
        setPhase("signing");
        const types = { ...q.permit2.eip712.types };
        delete (types as any).EIP712Domain;
        const sig = await wc.signTypedData({
          account: wallet,
          domain: q.permit2.eip712.domain,
          types,
          primaryType: q.permit2.eip712.primaryType,
          message: q.permit2.eip712.message,
        });
        const lenHex = numberToHex(sigSize(sig), { size: 32 }).slice(2);
        data = (data + lenHex + sig.slice(2)) as `0x${string}`;
      }

      setPhase("sending");
      const h = await wc.sendTransaction({
        account: wallet, chain: base,
        to: q.transaction.to as `0x${string}`,
        data,
        value: tab === "buy" ? BigInt(q.transaction.value || sellAmountWei) : 0n,
        gas: q.transaction.gas ? (BigInt(q.transaction.gas) * 130n) / 100n : undefined,
      });
      await pub.waitForTransactionReceipt({ hash: h });
      setPhase("done");
      setMsg(tab === "buy" ? `Bought ${symbol} ✓` : `Sold ${symbol} for ETH ✓`);
    } catch (e: any) {
      setPhase("err");
      setErr(e?.shortMessage || e?.message || "Swap failed.");
    }
  }

  const outLabel = tab === "buy" ? symbol : "ETH";

  return (
    <div className="card space-y-3 lg:sticky lg:top-20">
      <div className="flex gap-1 p-1 rounded-lg bg-panel2">
        <button className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${tab === "buy" ? "bg-panel text-beryl-glow shadow-card" : "text-muted hover:text-text"}`}
          onClick={() => { setTab("buy"); setAmt("0.01"); setErr(""); setMsg(""); }}>Buy</button>
        <button className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${tab === "sell" ? "bg-panel text-bad shadow-card" : "text-muted hover:text-text"}`}
          onClick={() => { setTab("sell"); setAmt(""); setErr(""); setMsg(""); }}>Sell</button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="label !mb-0">{tab === "buy" ? "You pay (ETH)" : `You sell (${symbol})`}</label>
          {isConnected && (
            <span className="text-[11px] text-muted font-mono tabular">
              Balance {tab === "buy" ? fmtAmt(Number(formatEther(ethBal))) : fmtAmt(Number(formatUnits(tokenBal, decimals)))}
            </span>
          )}
        </div>
        <input className="input font-mono tabular" type="number" step="any" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} disabled={busy} placeholder="0" />
        <div className="flex gap-1.5 mt-2">
          {tab === "buy"
            ? ["0.005", "0.01", "0.05", "0.1"].map((v) => (
                <button key={v} className={amt === v ? "chip-on" : "chip hover:border-beryl-dim"} onClick={() => setAmt(v)}>{v}</button>
              ))
            : ([["25%", 0.25], ["50%", 0.5], ["Max", 1]] as [string, number][]).map(([l, f]) => (
                <button key={l} className="chip hover:border-beryl-dim"
                  onClick={() => setAmt(formatUnits((tokenBal * BigInt(Math.round(f * 1000))) / 1000n, decimals))}>{l}</button>
              ))}
        </div>
      </div>

      <div className="rounded-lg bg-panel2 px-3.5 py-3 text-sm flex items-center justify-between">
        <span className="text-muted">You receive</span>
        <span className="font-mono tabular text-text">
          {quoteOut !== null ? `≈ ${fmtAmt(quoteOut)} ${outLabel}` : sellAmountWei ? "…" : `0 ${outLabel}`}
        </span>
      </div>
      {quoteOut !== null && tab === "buy" && priceUsd > 0 && (
        <p className="text-[11px] text-muted -mt-1 font-mono tabular">≈ {fmtUsd(quoteOut * priceUsd)}</p>
      )}

      <button
        className={tab === "buy" ? "btn-primary w-full py-3 text-base" : "btn w-full py-3 text-base !border-bad/30 !text-bad"}
        disabled={!isConnected || !sellAmountWei || busy} onClick={swap}>
        {!isConnected ? "Connect wallet"
          : phase === "quoting" ? "Fetching quote…"
          : phase === "approving" ? "Approving…"
          : phase === "signing" ? "Confirm signature…"
          : phase === "sending" ? "Swapping…"
          : tab === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`}
      </button>

      {err && <p className="text-[11px] text-bad break-words">{err}</p>}
      {msg && <p className="text-[11px] text-beryl-glow">{msg}</p>}
      <p className="text-[11px] text-muted">Routed by 0x on Base mainnet · slippage 1.5%</p>
    </div>
  );
}
