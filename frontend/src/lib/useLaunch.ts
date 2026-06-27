"use client";
import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog, parseEther } from "viem";
import { ADDR, FACTORY_ABI } from "./contracts";
import { ACTIVE_CHAIN } from "./wagmi";
import { saveTokenMeta } from "./tokenMeta";

export type LaunchInput = {
  name: string;
  symbol: string;
  startMcUsd: number;
  ethUsd: number;
  baseFeePct: number;   // 1..5
  maxFeePct: number;    // base..5
  feeReceiveType?: number; // 0=ETH, 1=TOKEN, 2=BOTH (creator's share delivery)
  imageUrl?: string;
  website?: string;     // off-chain social (token-meta store)
  x?: string;           // @handle or url
  description?: string;
};

export type Step = { id: string; label: string; status: "pending" | "run" | "ok" | "err"; note?: string };

export function useLaunch() {
  const { address } = useAccount();
  const pub = usePublicClient();
  const { data: wallet } = useWalletClient();
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<`0x${string}` | null>(null);

  const set = (id: string, patch: Partial<Step>) =>
    setSteps((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const launch = useCallback(async (input: LaunchInput): Promise<`0x${string}`> => {
    if (!wallet || !pub || !address) throw new Error("connect a wallet first");
    setBusy(true); setToken(null);
    const init: Step[] = [
      { id: "launch", label: "deploying B20 token", status: "pending" },
    ];
    setSteps(init);
    try {
      const startMcWei = parseEther((input.startMcUsd / input.ethUsd).toFixed(18));
      const base = BigInt(Math.round(input.baseFeePct * 100));
      const max  = BigInt(Math.round(input.maxFeePct  * 100));

      set("launch", { status: "run", note: "confirm in wallet" });
      const hash = await wallet.writeContract({
        address: ADDR.tokenFactory,
        abi: FACTORY_ABI,
        functionName: "launch",
        args: [input.name, input.symbol, base, max, startMcWei, input.feeReceiveType ?? 0],
        chain: ACTIVE_CHAIN,
      });

      set("launch", { status: "run", note: "waiting for confirmation…" });
      const rc = await pub.waitForTransactionReceipt({ hash });

      let tok: `0x${string}` | null = null;
      for (const log of rc.logs) {
        try {
          const d = decodeEventLog({ abi: FACTORY_ABI, data: log.data, topics: log.topics });
          if (d.eventName === "TokenDeployed") { tok = (d.args as any).token; break; }
        } catch {}
      }
      if (!tok) throw new Error("token address not found in receipt");

      setToken(tok);
      set("launch", { status: "ok", note: tok });

      // persist off-chain metadata (image + socials) so the token page & feed
      // can show them — the on-chain launch() carries none of this.
      if (input.imageUrl || input.website || input.x || input.description) {
        await saveTokenMeta({
          token: tok,
          image: input.imageUrl,
          website: input.website,
          x: input.x,
          description: input.description,
          creator: address,
          name: input.name,
          symbol: input.symbol,
        });
      }

      return tok;
    } catch (e: any) {
      setSteps((s) => s.map((x) => (x.status === "run" ? { ...x, status: "err", note: e?.shortMessage || e?.message } : x)));
      throw e;
    } finally {
      setBusy(false);
    }
  }, [wallet, pub, address]);

  return { launch, steps, busy, token };
}
