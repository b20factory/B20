"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAccount, useBalance, usePublicClient, useWalletClient } from "wagmi";
import { useState, useEffect, useCallback } from "react";
import { parseEther, formatEther, keccak256, encodeAbiParameters } from "viem";
import { ADDR, NFT_ABI, ERC20_ABI, FACTORY_ABI, ROUTER_ABI, HOOK_ABI, VESTING_ABI, SPLITTER_ABI, POOL_FEE, POOL_TICK_SPACING, EXPLORER, poolKey } from "@/lib/contracts";
import { ACTIVE_CHAIN } from "@/lib/wagmi";
import PriceChart from "@/components/PriceChart";
import { getTokenMeta } from "@/lib/tokenMeta";

type TokenInfo = {
  name: string;
  symbol: string;
  image: string;
  creator: string;
  splitter: string;
  vesting: string;
  collection: string;
  website?: string;
  x?: string;
};

type SwapState = "idle" | "approving" | "swapping" | "done" | "err";

export default function TokenPage() {
  const { address } = useParams<{ address: string }>();
  const tokenAddr = address as `0x${string}`;
  const { address: wallet, isConnected } = useAccount();
  const pub = usePublicClient();
  const { data: wc } = useWalletClient();

  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [tokenBal, setTokenBal] = useState<bigint>(0n);
  const [ethBal, setEthBal] = useState<bigint>(0n);
  const [splitterBal, setSplitterBal] = useState<bigint>(0n);
  const [feeBps, setFeeBps] = useState<number>(300);
  const [loading, setLoading] = useState(true);
  const [vest, setVest] = useState<{ claimable: bigint; vested: bigint; claimed: bigint; total: bigint; beneficiary: string } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState("");

  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [buyAmt, setBuyAmt] = useState("0.01");
  const [sellAmt, setSellAmt] = useState("");
  const [swapState, setSwapState] = useState<SwapState>("idle");
  const [swapErr, setSwapErr] = useState("");
  const [swapMsg, setSwapMsg] = useState("");

  const load = useCallback(async () => {
    if (!pub) return;
    try {
      const [name, symbol] = await Promise.all([
        pub.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "name" }),
        pub.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "symbol" }),
      ]);
      const col = await pub.readContract({ address: ADDR.tokenFactory, abi: FACTORY_ABI, functionName: "tokenToCollection", args: [tokenAddr] }).catch(() => "0x" as `0x${string}`);
      const splitter = await pub.readContract({ address: ADDR.tokenFactory, abi: FACTORY_ABI, functionName: "tokenToSplitter", args: [tokenAddr] }).catch(() => "0x" as `0x${string}`);
      const vesting = await pub.readContract({ address: ADDR.tokenFactory, abi: FACTORY_ABI, functionName: "tokenToVesting", args: [tokenAddr] }).catch(() => "0x" as `0x${string}`);

      let image = "";
      let creator = "";
      if (col && col !== "0x") {
        try {
          const ci: any = await pub.readContract({ address: col as `0x${string}`, abi: NFT_ABI, functionName: "getCollectionInfo" });
          image = ci[3] || "";
          creator = ci[8] || "";
        } catch {}
      }

      // off-chain metadata (image + socials) — overrides the empty on-chain image
      const meta = await getTokenMeta(tokenAddr);
      if (meta?.image) image = meta.image;
      if (meta?.creator && !creator) creator = meta.creator;

      setInfo({ name: String(name), symbol: String(symbol), image, creator, splitter: String(splitter), vesting: String(vesting), collection: String(col), website: meta?.website, x: meta?.x });

      if (wallet) {
        const [tb, eb] = await Promise.all([
          pub.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet] }),
          pub.getBalance({ address: wallet }),
        ]);
        setTokenBal(tb as bigint);
        setEthBal(eb);
      }

      if (splitter && splitter !== "0x") {
        const sb = await pub.getBalance({ address: splitter as `0x${string}` }).catch(() => 0n);
        setSplitterBal(sb);
      }

      // creator vesting schedule (20% default, releases over time)
      if (vesting && vesting !== "0x" && vesting !== "0x0000000000000000000000000000000000000000") {
        try {
          const [cl, ve, cd, tot, ben] = await Promise.all([
            pub.readContract({ address: vesting as `0x${string}`, abi: VESTING_ABI, functionName: "claimable" }),
            pub.readContract({ address: vesting as `0x${string}`, abi: VESTING_ABI, functionName: "vested" }),
            pub.readContract({ address: vesting as `0x${string}`, abi: VESTING_ABI, functionName: "claimed" }),
            pub.readContract({ address: vesting as `0x${string}`, abi: VESTING_ABI, functionName: "totalAmount" }),
            pub.readContract({ address: vesting as `0x${string}`, abi: VESTING_ABI, functionName: "beneficiary" }),
          ]);
          setVest({ claimable: cl as bigint, vested: ve as bigint, claimed: cd as bigint, total: tot as bigint, beneficiary: String(ben) });
        } catch {}
      }

      try {
        const pid = keccak256(encodeAbiParameters(
          [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
          ["0x0000000000000000000000000000000000000000", tokenAddr, POOL_FEE, POOL_TICK_SPACING, ADDR.feeHook]
        ));
        const cf = await pub.readContract({ address: ADDR.feeHook, abi: HOOK_ABI, functionName: "currentFeeBps", args: [pid] }) as bigint;
        setFeeBps(Number(cf));
      } catch {}
    } catch {}
    setLoading(false);
  }, [pub, tokenAddr, wallet]);

  useEffect(() => { load(); }, [load]);

  async function distribute() {
    if (!wc || !info?.splitter || info.splitter === "0x") return;
    try {
      const h = await wc.writeContract({ address: info.splitter as `0x${string}`, abi: SPLITTER_ABI, functionName: "distribute", chain: ACTIVE_CHAIN });
      await pub!.waitForTransactionReceipt({ hash: h });
      load();
    } catch {}
  }

  async function claimVesting() {
    if (!wc || !info?.vesting || info.vesting === "0x") return;
    setClaiming(true); setClaimMsg("");
    try {
      const h = await wc.writeContract({ address: info.vesting as `0x${string}`, abi: VESTING_ABI, functionName: "claim", chain: ACTIVE_CHAIN });
      await pub!.waitForTransactionReceipt({ hash: h });
      setClaimMsg("Claimed to creator ✓");
      await load();
    } catch (e: any) {
      setClaimMsg(e?.shortMessage || e?.message || "claim failed");
    } finally {
      setClaiming(false);
    }
  }

  async function buy() {
    if (!wc || !pub) return;
    const eth = parseFloat(buyAmt);
    if (!(eth > 0)) { setSwapErr("enter an ETH amount"); return; }
    setSwapErr(""); setSwapMsg(""); setSwapState("swapping");
    try {
      const h = await wc.writeContract({
        address: ADDR.swapRouter, abi: ROUTER_ABI, functionName: "swapExactIn",
        args: [poolKey(tokenAddr), true, parseEther(buyAmt), 0n, wallet!],
        value: parseEther(buyAmt), chain: ACTIVE_CHAIN,
      });
      await pub.waitForTransactionReceipt({ hash: h });
      setSwapState("done"); setSwapMsg(`Bought ${info?.symbol} ✓`);
      await load();
    } catch (e: any) {
      setSwapState("err"); setSwapErr(e?.shortMessage || e?.message || "buy failed");
    }
  }

  async function sell() {
    if (!wc || !pub) return;
    const amt = parseFloat(sellAmt);
    if (!(amt > 0)) { setSwapErr("enter a token amount"); return; }
    const amtWei = parseEther(sellAmt);
    if (amtWei > tokenBal) { setSwapErr("amount exceeds balance"); return; }
    setSwapErr(""); setSwapMsg("");
    try {
      const allowance = await pub.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "allowance", args: [wallet!, ADDR.swapRouter] }) as bigint;
      if (allowance < amtWei) {
        setSwapState("approving");
        const ah = await wc.writeContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "approve", args: [ADDR.swapRouter, amtWei], chain: ACTIVE_CHAIN });
        await pub.waitForTransactionReceipt({ hash: ah });
      }
      setSwapState("swapping");
      const h = await wc.writeContract({
        address: ADDR.swapRouter, abi: ROUTER_ABI, functionName: "swapExactIn",
        args: [poolKey(tokenAddr), false, amtWei, 0n, wallet!], chain: ACTIVE_CHAIN,
      });
      await pub.waitForTransactionReceipt({ hash: h });
      setSwapState("done"); setSwapMsg("Sold for ETH ✓"); setSellAmt("");
      await load();
    } catch (e: any) {
      setSwapState("err"); setSwapErr(e?.shortMessage || e?.message || "sell failed");
    }
  }

  const busy = swapState === "approving" || swapState === "swapping";

  function short(a: string) { return a ? a.slice(0, 8) + "…" + a.slice(-6) : ""; }

  if (loading) return (
    <main className="wrap py-16 text-muted">Loading token…</main>
  );
  if (!info) return (
    <main className="wrap py-16 text-bad">Token not found, or not deployed via B20factory.</main>
  );

  return (
    <main className="wrap py-10 space-y-6">
      {/* header */}
      <div className="flex items-start gap-4">
        {info.image ? (
          <img src={info.image} alt={info.symbol} className="w-16 h-16 rounded-xl object-cover shrink-0 border border-line shadow-card" />
        ) : (
          <div className="w-16 h-16 rounded-xl border border-line bg-panel2 flex items-center justify-center text-2xl text-beryl font-semibold shrink-0">{info.symbol.slice(0, 2)}</div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-text">{info.name} <span className="text-muted font-normal text-lg">{info.symbol}</span></h1>
          <div className="flex flex-wrap gap-2 mt-1.5">
            <a className="chip text-[11px] hover:border-beryl-dim/50 hover:text-beryl transition-colors" href={`${EXPLORER}/token/${tokenAddr}`} target="_blank" rel="noreferrer">{short(tokenAddr)} ↗</a>
            {info.x && <a className="chip text-[11px] hover:border-beryl-dim/50 hover:text-beryl transition-colors" href={info.x} target="_blank" rel="noreferrer">X ↗</a>}
            {info.website && <a className="chip text-[11px] hover:border-beryl-dim/50 hover:text-beryl transition-colors" href={info.website} target="_blank" rel="noreferrer">website ↗</a>}
            <span className="chip-on text-[11px]">B20 native</span>
            <span className="chip text-[11px]">Admin-less</span>
            <span className="chip text-[11px]">1B supply</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_320px] gap-6">
        {/* left — chart embed + tx feed placeholder */}
        <div className="space-y-4">
          <div className="term overflow-hidden">
            <div className="term-bar">
              {info.image ? (
                <img src={info.image} alt={info.symbol} className="w-5 h-5 rounded object-cover border border-line shrink-0" />
              ) : (
                <span className="w-5 h-5 rounded border border-line bg-panel2 flex items-center justify-center text-[9px] text-beryl font-semibold shrink-0">{info.symbol.slice(0, 2)}</span>
              )}
              <span className="ml-1 text-xs text-text font-medium truncate max-w-[160px]">{info.name}</span>
              <span className="text-[11px] text-muted">· {info.symbol}/ETH</span>
              <span className="ml-auto text-[11px] text-muted">On-chain · live</span>
            </div>
            <PriceChart token={tokenAddr} symbol={info.symbol} />
          </div>
        </div>

        {/* right — buy/sell + info */}
        <div className="space-y-4">
          {/* wallet balances */}
          {isConnected && (
            <div className="card text-sm space-y-1.5">
              <div className="text-muted text-[11px] font-semibold uppercase tracking-wider mb-2">Balances</div>
              <div className="flex justify-between"><span className="text-text/60">ETH</span><span className="text-text">{Number(formatEther(ethBal)).toFixed(5)}</span></div>
              <div className="flex justify-between"><span className="text-text/60">{info.symbol}</span><span className="text-text">{Number(formatEther(tokenBal)).toLocaleString()}</span></div>
            </div>
          )}

          {/* swap box — buy/sell via B20SwapRouter */}
          <div className="card space-y-3">
            <div className="flex gap-1 p-1 rounded-lg bg-panel2">
              <button className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${tab === "buy" ? "bg-panel text-beryl-glow shadow-card" : "text-muted hover:text-text"}`} onClick={() => { setTab("buy"); setSwapErr(""); setSwapMsg(""); }}>Buy</button>
              <button className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${tab === "sell" ? "bg-panel text-bad shadow-card" : "text-muted hover:text-text"}`} onClick={() => { setTab("sell"); setSwapErr(""); setSwapMsg(""); }}>Sell</button>
            </div>

            {tab === "buy" ? (
              <>
                <div>
                  <label className="label">ETH amount</label>
                  <input className="input" type="number" step="0.001" min="0" value={buyAmt} onChange={(e) => setBuyAmt(e.target.value)} disabled={busy} />
                  <div className="flex gap-1.5 mt-2">
                    {["0.005", "0.01", "0.05", "0.1"].map((v) => (
                      <button key={v} className={buyAmt === v ? "chip-on" : "chip hover:border-beryl-dim/50"} onClick={() => setBuyAmt(v)}>{v}</button>
                    ))}
                  </div>
                </div>
                <button className="btn-primary w-full py-2.5 text-base" disabled={!isConnected || busy} onClick={buy}>
                  {!isConnected ? "Connect wallet" : busy ? (swapState === "approving" ? "Approving…" : "Buying…") : `Buy ${info.symbol}`}
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="label">{info.symbol} amount</label>
                  <input className="input" type="number" step="any" min="0" placeholder="0" value={sellAmt} onChange={(e) => setSellAmt(e.target.value)} disabled={busy} />
                  <div className="flex gap-1.5 mt-2">
                    {[["25%", 0.25], ["50%", 0.5], ["max", 1]].map(([lbl, frac]) => (
                      <button key={lbl as string} className="chip hover:border-beryl-dim/50" onClick={() => setSellAmt(formatEther((tokenBal * BigInt(Math.round((frac as number) * 1000))) / 1000n))}>{lbl as string}</button>
                    ))}
                  </div>
                </div>
                <button className="btn w-full py-2.5 text-base !border-bad/40 !text-bad hover:!bg-bad/10" disabled={!isConnected || busy} onClick={sell}>
                  {!isConnected ? "Connect wallet" : busy ? (swapState === "approving" ? "Approving…" : "Selling…") : `Sell ${info.symbol}`}
                </button>
              </>
            )}

            {swapErr && <p className="text-[11px] text-bad break-words">{swapErr}</p>}
            {swapMsg && <p className="text-[11px] text-beryl-glow">{swapMsg}</p>}
            <p className="text-[11px] text-muted">Dynamic fee {(feeBps / 100).toFixed(2)}% · via B20SwapRouter</p>
          </div>

          {/* fee splitter — claim accrued swap fees */}
          {splitterBal > 0n && (
            <div className="card space-y-2">
              <div className="h-sec">Creator fees</div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Accrued</span>
                <span className="text-beryl-glow font-mono tabular">{Number(formatEther(splitterBal)).toFixed(6)} ETH</span>
              </div>
              <p className="text-[11px] text-muted">55% to the creator · 45% to the platform</p>
              {isConnected && (
                <button className="btn w-full" onClick={distribute}>Claim / distribute fees</button>
              )}
            </div>
          )}

          {/* creator vesting — claim the unlocked slice of the 20% creator allocation */}
          {vest && vest.total > 0n && (
            <div className="card space-y-2">
              <div className="h-sec">Creator vesting</div>
              <div className="relative h-1.5 rounded-full bg-line overflow-hidden">
                <div className="absolute h-full rounded-full bg-beryl/50" style={{ width: `${vest.total > 0n ? Number((vest.vested * 1000n) / vest.total) / 10 : 0}%` }} />
              </div>
              <div className="flex justify-between text-[12px] mt-1">
                <span className="text-muted">Claimable now</span>
                <span className="text-beryl-glow font-mono tabular">{Number(formatEther(vest.claimable)).toLocaleString()} {info.symbol}</span>
              </div>
              <div className="flex justify-between text-[11px] text-muted">
                <span>Vested {Number(formatEther(vest.vested)).toLocaleString()}</span>
                <span>of {Number(formatEther(vest.total)).toLocaleString()}</span>
              </div>
              {isConnected && (
                <button className="btn w-full" disabled={claiming || vest.claimable === 0n} onClick={claimVesting}>
                  {claiming ? "Claiming…" : vest.claimable === 0n ? "Nothing unlocked yet" : `Claim ${Number(formatEther(vest.claimable)).toLocaleString()} ${info.symbol}`}
                </button>
              )}
              {claimMsg && <p className="text-[11px] text-beryl-glow break-words">{claimMsg}</p>}
              <p className="text-[11px] text-muted">Unlocks on schedule to the creator · 1% of supply per month</p>
            </div>
          )}

          {/* token meta */}
          <div className="card text-[12px] space-y-2 text-text/60">
            {info.creator && <div className="flex justify-between"><span>Creator</span><a className="link" href={`${EXPLORER}/address/${info.creator}`} target="_blank" rel="noreferrer">{short(info.creator)} ↗</a></div>}
            {info.vesting && info.vesting !== "0x" && info.vesting !== "0x0000000000000000000000000000000000000000" && (
              <div className="flex justify-between"><span>Vesting</span><a className="link" href={`${EXPLORER}/address/${info.vesting}`} target="_blank" rel="noreferrer">{short(info.vesting)} ↗</a></div>
            )}
            {info.collection && info.collection !== "0x" && (
              <div className="flex justify-between"><span>Collection</span><a className="link" href={`${EXPLORER}/address/${info.collection}`} target="_blank" rel="noreferrer">{short(info.collection)} ↗</a></div>
            )}
          </div>
        </div>
      </div>

      <div className="pt-4 hairline text-xs text-muted">
        <Link href="/app/tokens" className="link">← My tokens</Link>
        <span className="mx-3">·</span>
        <Link href="/app" className="link">Launch another</Link>
      </div>
    </main>
  );
}
