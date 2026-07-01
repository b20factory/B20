"use client";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useState, useEffect, useCallback } from "react";
import { formatEther } from "viem";
import Link from "next/link";
import { ADDR, NFT_ABI, ERC20_ABI, FACTORY_ABI, VESTING_ABI, SPLITTER_ABI } from "@/lib/contracts";
import { ACTIVE_CHAIN } from "@/lib/wagmi";

type TokenRow = {
  token: `0x${string}`;
  collection: `0x${string}`;
  name: string;
  symbol: string;
  image: string;
  splitter: `0x${string}`;
  vesting: `0x${string}`;
  earned: bigint;        // ETH accrued in the splitter
  vestClaimable: bigint; // tokens unlocked, not yet claimed
};

const ZERO = "0x0000000000000000000000000000000000000000";

export default function MyTokens() {
  const { address, isConnected } = useAccount();
  const pub = usePublicClient();
  const { data: wc } = useWalletClient();
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");

  const load = useCallback(async () => {
    if (!pub || !address) { setLoading(false); return; }
    try {
      const tokens = await pub.readContract({ address: ADDR.tokenFactory, abi: FACTORY_ABI, functionName: "getAllTokens" }) as `0x${string}`[];
      const results: TokenRow[] = [];
      for (const tok of tokens) {
        try {
          const col = await pub.readContract({ address: ADDR.tokenFactory, abi: FACTORY_ABI, functionName: "tokenToCollection", args: [tok] }) as `0x${string}`;
          const ci: any = await pub.readContract({ address: col, abi: NFT_ABI, functionName: "getCollectionInfo" });
          const creator: string = ci[8] || "";
          if (creator.toLowerCase() !== address.toLowerCase()) continue;

          const [name, symbol] = await Promise.all([
            pub.readContract({ address: tok, abi: ERC20_ABI, functionName: "name" }),
            pub.readContract({ address: tok, abi: ERC20_ABI, functionName: "symbol" }),
          ]);
          const [splitter, vesting] = await Promise.all([
            pub.readContract({ address: ADDR.tokenFactory, abi: FACTORY_ABI, functionName: "tokenToSplitter", args: [tok] }) as Promise<`0x${string}`>,
            pub.readContract({ address: ADDR.tokenFactory, abi: FACTORY_ABI, functionName: "tokenToVesting", args: [tok] }) as Promise<`0x${string}`>,
          ]);
          let earned = 0n, vestClaimable = 0n;
          if (splitter && splitter !== ZERO) earned = await pub.getBalance({ address: splitter }).catch(() => 0n);
          if (vesting && vesting !== ZERO) {
            vestClaimable = await pub.readContract({ address: vesting, abi: VESTING_ABI, functionName: "claimable" }).catch(() => 0n) as bigint;
          }

          results.push({ token: tok, collection: col, name: String(name), symbol: String(symbol), image: ci[3] || "", splitter, vesting, earned, vestClaimable });
        } catch {}
      }
      setRows(results);
    } catch {}
    setLoading(false);
  }, [pub, address]);

  useEffect(() => { load(); }, [load]);

  async function claimFees(r: TokenRow) {
    if (!wc || r.splitter === ZERO) return;
    setBusy(r.token + ":fee");
    try {
      const h = await wc.writeContract({ address: r.splitter, abi: SPLITTER_ABI, functionName: "distribute", chain: ACTIVE_CHAIN });
      await pub!.waitForTransactionReceipt({ hash: h });
      await load();
    } catch {} finally { setBusy(""); }
  }
  async function claimVesting(r: TokenRow) {
    if (!wc || r.vesting === ZERO) return;
    setBusy(r.token + ":vest");
    try {
      const h = await wc.writeContract({ address: r.vesting, abi: VESTING_ABI, functionName: "claim", chain: ACTIVE_CHAIN });
      await pub!.waitForTransactionReceipt({ hash: h });
      await load();
    } catch {} finally { setBusy(""); }
  }

  const totalEarned = rows.reduce((s, r) => s + r.earned, 0n);

  if (!isConnected) return (
    <main className="wrap py-16 text-center">
      <p className="text-muted mb-4">Connect your wallet to open the creator panel.</p>
      <Link href="/app" className="btn-primary">Back to launch</Link>
    </main>
  );

  return (
    <main className="wrap py-10">
      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text">Creator panel</h1>
          <p className="text-sm text-muted mt-1.5">Your B20 tokens. Claim swap fees and vested supply.</p>
        </div>
        {rows.length > 0 && (
          <div className="ml-auto text-right">
            <div className="text-xs text-muted">Total fees accrued</div>
            <div className="text-beryl-glow text-lg font-semibold font-mono tabular">{Number(formatEther(totalEarned)).toFixed(6)} ETH</div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-muted">Scanning tokens…</div>
      ) : rows.length === 0 ? (
        <div className="term p-8 text-center">
          <div className="text-text font-medium mb-1">No tokens found for this wallet</div>
          <p className="text-sm text-muted mb-5">Launch your first B20 and it will show up here.</p>
          <Link href="/app" className="btn-primary">Launch a token</Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r) => (
            <div key={r.token} className="card-hover group">
              <Link href={`/token/${r.token}`} className="flex items-start gap-3">
                {r.image ? (
                  <img src={r.image} alt={r.symbol} className="w-12 h-12 rounded-lg object-cover shrink-0 border border-line" />
                ) : (
                  <div className="w-12 h-12 rounded-lg border border-line bg-panel2 flex items-center justify-center text-beryl font-semibold shrink-0">{r.symbol.slice(0, 2)}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-text group-hover:text-beryl transition-colors truncate">{r.name}</div>
                  <div className="text-[12px] text-muted">{r.symbol} · {r.token.slice(0, 8)}…</div>
                </div>
              </Link>

              <div className="mt-3 pt-3 hairline space-y-2 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Fees accrued</span>
                  <span className="text-beryl-glow font-mono tabular">{Number(formatEther(r.earned)).toFixed(6)} ETH</span>
                </div>
                <button className="btn w-full text-[12px] py-1.5" disabled={r.earned === 0n || busy === r.token + ":fee"} onClick={() => claimFees(r)}>
                  {busy === r.token + ":fee" ? "Claiming…" : r.earned === 0n ? "No fees yet" : "Claim fees"}
                </button>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-muted">Vesting claimable</span>
                  <span className="text-beryl-glow font-mono tabular">{Number(formatEther(r.vestClaimable)).toLocaleString()} {r.symbol}</span>
                </div>
                <button className="btn w-full text-[12px] py-1.5" disabled={r.vestClaimable === 0n || busy === r.token + ":vest"} onClick={() => claimVesting(r)}>
                  {busy === r.token + ":vest" ? "Claiming…" : r.vestClaimable === 0n ? "Nothing unlocked yet" : "Claim vesting"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 hairline pt-4 text-xs text-muted flex gap-4">
        <Link href="/app" className="link">← Launch another</Link>
        <Link href="/explore" className="link">Explore feed →</Link>
      </div>
    </main>
  );
}
