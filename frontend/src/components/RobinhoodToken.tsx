"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAccount, useWalletClient } from "wagmi";
import { createPublicClient, http, parseEther, formatEther } from "viem";
import { RH, RH_V3, RH_FACTORY_ABI, RH_CURVE_ABI, RH_V3_POOL_ABI, RH_V3_ROUTER_ABI, VENUE_V3, v3PriceEth, robinhoodChain, type VenueId } from "@/lib/chains";
import { ERC20_ABI } from "@/lib/contracts";
import { encodeFunctionData } from "viem";
import { RobinhoodLogo } from "@/components/ChainLogo";
import { getTokenMeta, type TokenMeta } from "@/lib/tokenMeta";
import { getAgents, shortAddr } from "@/lib/agents";

const ZERO = "0x0000000000000000000000000000000000000000";
const rhc = createPublicClient({ chain: robinhoodChain, transport: http(RH.rpcProxy) });

type Info = {
  venue: "curve" | "v3";
  name: string; symbol: string; image: string; creator: string;
  curve: `0x${string}`;      // curve contract OR (v3) the pool address
  pool: `0x${string}`;       // v3 pool address
  tokenIs0: boolean;         // v3: token is token0 in the pool
  priceEth: number; ethRaised: number; gradCap: number;
  graduated: boolean; feeBps: number; agent?: string;
  website?: string; x?: string; github?: string; telegram?: string; bio?: string;
};

export default function RobinhoodToken({ token }: { token: `0x${string}` }) {
  const { address: wallet, isConnected } = useAccount();
  const { data: wc } = useWalletClient();

  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenBal, setTokenBal] = useState<bigint>(0n);
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [buyAmt, setBuyAmt] = useState("0.01");
  const [sellAmt, setSellAmt] = useState("");
  const [quote, setQuote] = useState<string>("");
  const [state, setState] = useState<"idle" | "approving" | "swapping" | "done" | "err">("idle");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [name, symbol, launch, meta, agents] = await Promise.all([
        rhc.readContract({ address: token, abi: ERC20_ABI, functionName: "name" }),
        rhc.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" }),
        rhc.readContract({ address: RH.factory, abi: RH_FACTORY_ABI, functionName: "launchOf", args: [token] }) as Promise<readonly [string, string, string, string, string, number]>,
        getTokenMeta(token),
        getAgents(),
      ]);
      const market = launch[1] as `0x${string}`; // curve contract, or the v3 pool
      const venue: "curve" | "v3" = Number(launch[5]) === VENUE_V3 ? "v3" : "curve";
      let creator = String(launch[3] || "");
      let priceEth = 0, ethRaised = 0, gradCap = 0, graduated = false, feeBps = 300;
      let tokenIs0 = false;
      if (venue === "v3" && market && market !== ZERO) {
        // v3: price straight off the pool's spot price; it's a real pool, no
        // curve — any bot can trade it. Fee is the fixed 1% tier (100 bps for
        // the shared /100 display; RH_V3.fee is in Uniswap's 1e-6 units).
        feeBps = 100;
        tokenIs0 = token.toLowerCase() < RH_V3.weth.toLowerCase();
        try {
          const slot0 = await rhc.readContract({ address: market, abi: RH_V3_POOL_ABI, functionName: "slot0" }) as readonly [bigint, number, number, number, number, number, boolean];
          priceEth = v3PriceEth(slot0[0], tokenIs0);
        } catch {}
      } else if (market && market !== ZERO) {
        const [px, er, gc, gr, cf] = await Promise.all([
          rhc.readContract({ address: market, abi: RH_CURVE_ABI, functionName: "priceX18" }).catch(() => 0n),
          rhc.readContract({ address: market, abi: RH_CURVE_ABI, functionName: "ethRaised" }).catch(() => 0n),
          rhc.readContract({ address: market, abi: RH_CURVE_ABI, functionName: "graduationCap" }).catch(() => 0n),
          rhc.readContract({ address: market, abi: RH_CURVE_ABI, functionName: "graduated" }).catch(() => false),
          rhc.readContract({ address: market, abi: RH_CURVE_ABI, functionName: "currentFeeBps" }).catch(() => 300n),
        ]);
        priceEth = Number(formatEther(px as bigint));
        ethRaised = Number(formatEther(er as bigint));
        gradCap = Number(formatEther(gc as bigint));
        graduated = Boolean(gr);
        feeBps = Number(cf);
      }
      const m: TokenMeta | null = meta;
      if (m?.creator) creator = m.creator;
      const agent = creator ? agents[creator.toLowerCase()] : undefined;
      setInfo({
        venue, name: String(name), symbol: String(symbol),
        image: m?.image || "", creator,
        curve: market, pool: market, tokenIs0,
        priceEth, ethRaised, gradCap, graduated, feeBps, agent,
        website: m?.website, x: m?.x, github: m?.github, telegram: m?.telegram, bio: m?.description,
      });
      if (wallet) {
        const tb = await rhc.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet] }).catch(() => 0n);
        setTokenBal(tb as bigint);
      }
    } catch {}
    setLoading(false);
  }, [token, wallet]);

  useEffect(() => { load(); }, [load]);

  // live quote
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!info || info.curve === ZERO) return;
      try {
        // v3: estimate from the pool spot price and the 1% fee.
        if (info.venue === "v3") {
          if (tab === "buy" && parseFloat(buyAmt) > 0 && info.priceEth > 0) {
            const out = (parseFloat(buyAmt) * 0.99) / info.priceEth;
            if (alive) setQuote(`≈ ${out.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${info.symbol}`);
          } else if (tab === "sell" && parseFloat(sellAmt) > 0) {
            const out = parseFloat(sellAmt) * info.priceEth * 0.99;
            if (alive) setQuote(`≈ ${out.toFixed(6)} ETH`);
          } else setQuote("");
          return;
        }
        if (tab === "buy" && parseFloat(buyAmt) > 0) {
          const [out] = await rhc.readContract({ address: info.curve, abi: RH_CURVE_ABI, functionName: "quoteBuy", args: [parseEther(buyAmt)] }) as [bigint, bigint];
          if (alive) setQuote(`≈ ${Number(formatEther(out)).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${info.symbol}`);
        } else if (tab === "sell" && parseFloat(sellAmt) > 0) {
          const [out] = await rhc.readContract({ address: info.curve, abi: RH_CURVE_ABI, functionName: "quoteSell", args: [parseEther(sellAmt)] }) as [bigint, bigint];
          if (alive) setQuote(`≈ ${Number(formatEther(out)).toFixed(6)} ETH`);
        } else setQuote("");
      } catch { if (alive) setQuote(""); }
    })();
    return () => { alive = false; };
  }, [tab, buyAmt, sellAmt, info]);

  const SLIP = 0.12; // v3 pools start thin; a generous buffer avoids reverts

  async function buy() {
    if (!wc || !info) return;
    const eth = parseFloat(buyAmt);
    if (!(eth > 0)) { setErr("enter an ETH amount"); return; }
    setErr(""); setMsg(""); setState("swapping");
    try {
      if (info.venue === "v3") {
        const ethIn = parseEther(buyAmt);
        const estOut = info.priceEth > 0 ? (eth * 0.99) / info.priceEth : 0;
        const minOut = parseEther(Math.max(0, estOut * (1 - SLIP)).toFixed(18));
        const h = await wc.writeContract({
          address: RH_V3.router, abi: RH_V3_ROUTER_ABI, functionName: "exactInputSingle",
          args: [{ tokenIn: RH_V3.weth, tokenOut: token, fee: RH_V3.fee, recipient: wallet!, amountIn: ethIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
          value: ethIn, chain: robinhoodChain,
        });
        await rhc.waitForTransactionReceipt({ hash: h });
      } else {
        const h = await wc.writeContract({
          address: info.curve, abi: RH_CURVE_ABI, functionName: "buy", args: [0n],
          value: parseEther(buyAmt), chain: robinhoodChain,
        });
        await rhc.waitForTransactionReceipt({ hash: h });
      }
      setState("done"); setMsg(`Bought ${info.symbol} ✓`);
      await load();
    } catch (e: any) {
      setState("err"); setErr(e?.shortMessage || e?.message || "buy failed");
    }
  }

  async function sell() {
    if (!wc || !info) return;
    const amt = parseFloat(sellAmt);
    if (!(amt > 0)) { setErr("enter a token amount"); return; }
    let amtWei = parseEther(sellAmt);
    if (amtWei > tokenBal) amtWei = tokenBal;
    if (amtWei === 0n) { setErr("amount exceeds balance"); return; }
    setErr(""); setMsg("");
    try {
      const spender = info.venue === "v3" ? RH_V3.router : info.curve;
      const allowance = await rhc.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [wallet!, spender] }) as bigint;
      if (allowance < amtWei) {
        setState("approving");
        const ah = await wc.writeContract({ address: token, abi: ERC20_ABI, functionName: "approve", args: [spender, amtWei], chain: robinhoodChain });
        await rhc.waitForTransactionReceipt({ hash: ah });
      }
      setState("swapping");
      if (info.venue === "v3") {
        const estEth = Number(formatEther(amtWei)) * info.priceEth * 0.99;
        const minEth = parseEther(Math.max(0, estEth * (1 - SLIP)).toFixed(18));
        // swap token->WETH into the router, then unwrap to native ETH for the seller
        const swapData = encodeFunctionData({ abi: RH_V3_ROUTER_ABI, functionName: "exactInputSingle", args: [{ tokenIn: token, tokenOut: RH_V3.weth, fee: RH_V3.fee, recipient: "0x0000000000000000000000000000000000000002", amountIn: amtWei, amountOutMinimum: minEth, sqrtPriceLimitX96: 0n }] });
        const unwrapData = encodeFunctionData({ abi: RH_V3_ROUTER_ABI, functionName: "unwrapWETH9", args: [minEth, wallet!] });
        const h = await wc.writeContract({ address: RH_V3.router, abi: RH_V3_ROUTER_ABI, functionName: "multicall", args: [[swapData, unwrapData]], chain: robinhoodChain });
        await rhc.waitForTransactionReceipt({ hash: h });
      } else {
        const h = await wc.writeContract({ address: info.curve, abi: RH_CURVE_ABI, functionName: "sell", args: [amtWei, 0n], chain: robinhoodChain });
        await rhc.waitForTransactionReceipt({ hash: h });
      }
      setState("done"); setMsg("Sold for ETH ✓"); setSellAmt("");
      await load();
    } catch (e: any) {
      setState("err"); setErr(e?.shortMessage || e?.message || "sell failed");
    }
  }

  const busy = state === "approving" || state === "swapping";
  if (loading) return <main className="wrap py-16 text-muted">Loading token…</main>;
  if (!info) return <main className="wrap py-16 text-bad">Token not found on Robinhood Chain.</main>;

  const progress = info.gradCap > 0 ? Math.min(100, (info.ethRaised / info.gradCap) * 100) : 0;

  return (
    <main className="wrap py-10 space-y-6">
      <div className="flex items-start gap-4">
        {info.image ? (
          <img src={info.image} alt={info.symbol} className="w-16 h-16 rounded-xl object-cover border border-line" />
        ) : (
          <div className="w-16 h-16 rounded-xl border border-line bg-panel2 flex items-center justify-center text-beryl font-bold">{info.symbol.slice(0, 2)}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight text-text">{info.name}</h1>
            <span className="chip text-[10px] px-1.5 py-0 gap-1 border-[#00C805]/30 text-[#00C805] inline-flex items-center"><RobinhoodLogo size={10} />Robinhood</span>
          </div>
          <div className="text-sm text-muted flex items-center gap-1.5 flex-wrap">
            <span>{info.symbol}</span>
            {(info.agent || info.creator) && (
              <>
                <span className="text-muted/50">·</span>
                <span>by {info.agent ?? shortAddr(info.creator)}</span>
                {info.agent && <span className="chip text-[9px] px-1 py-0 border-con-accent/40 text-con-accent uppercase tracking-wide">agent</span>}
              </>
            )}
          </div>
          {info.bio && <p className="mt-1.5 text-sm text-muted max-w-xl leading-relaxed">{info.bio}</p>}
          <div className="mt-2 flex items-center gap-3 text-[13px]">
            {info.x && <a href={info.x} target="_blank" rel="noreferrer" className="link">X</a>}
            {info.github && <a href={info.github} target="_blank" rel="noreferrer" className="link">GitHub</a>}
            {info.telegram && <a href={info.telegram} target="_blank" rel="noreferrer" className="link">Telegram</a>}
            {info.website && <a href={info.website} target="_blank" rel="noreferrer" className="link">Website</a>}
            <a href={`${RH.explorer}/token/${token}`} target="_blank" rel="noreferrer" className="link">Blockscout ↗</a>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        {/* left: curve status */}
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><div className="text-muted text-xs">Price</div><div className="font-mono tabular text-text">{info.priceEth > 0 ? `${info.priceEth.toFixed(10).replace(/0+$/, "").replace(/\.$/, "")} ETH` : "--"}</div></div>
            <div><div className="text-muted text-xs">{info.venue === "v3" ? "Venue" : "Raised"}</div><div className="font-mono tabular text-text">{info.venue === "v3" ? "Uniswap v3" : `${info.ethRaised.toFixed(4)} ETH`}</div></div>
            <div><div className="text-muted text-xs">Fee</div><div className="font-mono tabular text-text">{(info.feeBps / 100).toFixed(1)}%</div></div>
          </div>
          {info.venue === "v3" ? (
            <div className="flex items-center gap-2 rounded-lg border border-[#00C805]/30 bg-[#00C805]/5 px-3 py-2 text-xs text-[#00C805]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00C805]" />
              Live on Uniswap v3 · tradeable by any wallet or bot
            </div>
          ) : (
            <div>
              <div className="flex justify-between text-xs text-muted mb-1">
                <span>{info.graduated ? "Graduated to Uniswap v3" : "Bonding to graduation"}</span>
                <span className="font-mono tabular">{progress.toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full bg-panel2 overflow-hidden">
                <div className="h-full rounded-full bg-[#00C805]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <p className="text-xs text-muted leading-relaxed">
            {info.venue === "v3"
              ? "Launched straight into a Uniswap v3 pool on Robinhood Chain. Trades through the standard SwapRouter02, so any wallet, aggregator, or bot can buy it."
              : "Native launch on Robinhood Chain via a fair bonding curve. It trades on the curve until it hits the graduation cap, then liquidity moves to Uniswap v3."}
          </p>
        </div>

        {/* right: buy/sell */}
        <div className="card p-4">
          <div className="inline-flex rounded-lg bg-panel2 p-1 mb-3 w-full">
            <button onClick={() => setTab("buy")} className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${tab === "buy" ? "bg-panel text-text shadow-card" : "text-muted"}`}>Buy</button>
            <button onClick={() => setTab("sell")} className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${tab === "sell" ? "bg-panel text-text shadow-card" : "text-muted"}`}>Sell</button>
          </div>

          {!isConnected ? (
            <p className="text-sm text-muted text-center py-4">Connect a wallet to trade. Your wallet will switch to Robinhood Chain.</p>
          ) : info.venue === "curve" && info.graduated ? (
            <p className="text-sm text-muted text-center py-4">Graduated — trade on Uniswap v3.</p>
          ) : tab === "buy" ? (
            <div className="space-y-2">
              <label className="text-xs text-muted">Pay (ETH)</label>
              <input className="input w-full" value={buyAmt} onChange={(e) => setBuyAmt(e.target.value)} inputMode="decimal" />
              {quote && <div className="text-xs text-muted">{quote}</div>}
              <button className="btn-primary w-full" disabled={busy} onClick={buy}>{busy ? "Buying…" : "Buy"}</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted"><span>Sell ({info.symbol})</span><button className="link" onClick={() => setSellAmt(formatEther(tokenBal))}>max {Number(formatEther(tokenBal)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</button></div>
              <input className="input w-full" value={sellAmt} onChange={(e) => setSellAmt(e.target.value)} inputMode="decimal" placeholder="0" />
              {quote && <div className="text-xs text-muted">{quote}</div>}
              <button className="btn w-full" disabled={busy} onClick={sell}>{busy ? "Selling…" : "Sell"}</button>
            </div>
          )}

          {msg && <p className="mt-2 text-xs text-beryl-glow">{msg}</p>}
          {err && <p className="mt-2 text-xs text-bad">{err}</p>}
        </div>
      </div>

      <div className="hairline pt-4 text-xs text-muted flex gap-4">
        <Link href="/explore" className="link">← Back to feed</Link>
        <a href={`${RH.explorer}/address/${token}`} target="_blank" rel="noreferrer" className="link">Contract ↗</a>
      </div>
    </main>
  );
}
