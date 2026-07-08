"use client";

// Native price chart built from on-chain Uniswap V4 swaps for this token's pool.
// DexScreener doesn't index a freshly launched V4 pool for a while, so a new B20
// token showed an empty chart. This reads PoolManager Swap events for the pool
// directly and plots market cap per trade, it works the moment the first swap
// lands, no third-party indexer.
import { useEffect, useState } from "react";
import { formatEther, keccak256, encodeAbiParameters } from "viem";
import { usePublicClient } from "wagmi";
import { ADDR, ERC20_ABI, POOL_FEE, POOL_TICK_SPACING } from "@/lib/contracts";

const POOL_MANAGER = (process.env.NEXT_PUBLIC_POOL_MANAGER || "") as `0x${string}`;

// poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
function poolIdFor(token: `0x${string}`): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      ["0x0000000000000000000000000000000000000000", token, POOL_FEE, POOL_TICK_SPACING, ADDR.feeHook]
    )
  );
}

const POOL_MANAGER_SWAP = {
  type: "event",
  name: "Swap",
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

// currency0 = ETH, currency1 = token. (sqrtP/2^96)^2 = token per ETH.
// Price of the token in ETH = 1 / (token per ETH).
function ethPerToken(sqrtPriceX96: bigint): number {
  const r = Number(sqrtPriceX96) / 2 ** 96;
  const tokenPerEth = r * r;
  return tokenPerEth > 0 ? 1 / tokenPerEth : 0;
}

function fmtEth(n: number): string {
  if (!isFinite(n) || n === 0) return "0";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

export default function PriceChart({ token, symbol }: { token: `0x${string}`; symbol: string }) {
  const client = usePublicClient();
  const [points, setPoints] = useState<number[]>([]);
  const [supply, setSupply] = useState(0);
  const [loading, setLoading] = useState(true);
  const poolId = poolIdFor(token);

  useEffect(() => {
    if (!client) return;
    let on = true;
    (async () => {
      setLoading(true);
      try {
        try {
          const ts = await client.readContract({ address: token, abi: ERC20_ABI, functionName: "totalSupply" }) as bigint;
          if (on) setSupply(Number(formatEther(ts)));
        } catch {}

        const latest = await client.getBlockNumber();
        const step = BigInt(4500);
        const series: number[] = [];
        let end = latest;
        let emptyStreak = 0;
        for (let i = 0; i < 12; i++) {
          const start = end > step ? end - step : BigInt(0);
          const logs = await client.getLogs({
            address: POOL_MANAGER,
            event: POOL_MANAGER_SWAP,
            args: { id: poolId },
            fromBlock: start,
            toBlock: end,
          }).catch(() => []);
          const prices = logs.map((l) => ethPerToken((l as any).args.sqrtPriceX96 as bigint)).filter((p) => p > 0);
          series.unshift(...prices);
          emptyStreak = prices.length ? 0 : emptyStreak + 1;
          if (start === BigInt(0)) break;
          if (series.length >= 150) break;
          if (series.length > 0 && emptyStreak >= 2) break;
          end = start - BigInt(1);
        }
        if (on) setPoints(series);
      } catch {
        if (on) setPoints([]);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [client, token]);

  const data = supply > 0 ? points.map((p) => p * supply) : points;
  const unit = supply > 0 ? "ETH mcap" : "ETH";

  if (loading) {
    return <div className="h-[420px] flex items-center justify-center text-xs text-muted animate-pulse">Loading chart…</div>;
  }

  if (data.length < 2) {
    return (
      <div className="h-[420px] flex flex-col items-center justify-center gap-2">
        <p className="text-sm font-medium text-text">No trades yet</p>
        {data.length > 0 && <p className="font-mono text-xs text-beryl-glow">{fmtEth(data[data.length - 1])} {unit}</p>}
        <p className="text-[11px] text-muted">The chart fills in the moment the first swap lands.</p>
      </div>
    );
  }

  const W = 1000, H = 420, PAD = 10;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || max || 1;
  const x = (i: number) => PAD + (i / (data.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / range) * (H - 2 * PAD);
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;
  const up = data[data.length - 1] >= data[0];
  const stroke = up ? "#0D9488" : "#D92D20";

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm font-semibold tabular" style={{ color: stroke }}>{fmtEth(data[data.length - 1])} {unit}</span>
        <span className="text-[11px] text-muted">{points.length} trade{points.length === 1 ? "" : "s"} · {symbol}/ETH</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 380 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="b20pcfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#b20pcfill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-muted mt-1 font-mono">
        <span>Low {fmtEth(min)}</span>
        <span>High {fmtEth(max)}</span>
      </div>
    </div>
  );
}
