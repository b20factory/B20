"use client";
import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog, parseEther } from "viem";
import { ADDR, FACTORY_ABI } from "./contracts";
import { ACTIVE_CHAIN } from "./wagmi";
import { RH, RH_FACTORY_ABI, rhLive, robinhoodChain, mcToPriceTick, type VenueId } from "./chains";
import { saveTokenMeta } from "./tokenMeta";

export type LaunchInput = {
  name: string;
  symbol: string;
  startMcUsd: number;
  ethUsd: number;
  baseFeePct: number;   // 1..5
  maxFeePct: number;    // base..5
  feeReceiveType?: number; // 0=ETH, 1=TOKEN, 2=BOTH (creator's share delivery)
  venue?: VenueId;      // "base" (default) or "robinhood"
  rhVenue?: "curve" | "v3"; // Robinhood only: bonding curve (default) or direct Uniswap v3 pool
  imageUrl?: string;
  website?: string;     // off-chain socials (token-meta store)
  x?: string;           // @handle or url
  github?: string;
  telegram?: string;
  description?: string; // bio
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
    const venue: VenueId = input.venue ?? "base";
    if (venue === "robinhood" && !rhLive) {
      throw new Error("Robinhood Chain launchpad is not deployed yet");
    }
    setBusy(true); setToken(null);
    const init: Step[] = [
      { id: "launch", label: venue === "robinhood" ? "deploying on Robinhood Chain" : "deploying B20 token", status: "pending" },
    ];
    setSteps(init);
    try {
      let tok: `0x${string}` | null = null;

      if (venue === "robinhood") {
        const v3 = input.rhVenue === "v3";
        set("launch", { status: "run", note: `confirm in wallet (Robinhood Chain, ${v3 ? "v3 pool" : "curve"})` });
        // wagmi switches/adds the chain automatically because it is registered
        // in the config; the wallet prompts once to add Robinhood Chain.
        const hash = v3
          ? await wallet.writeContract({
              address: RH.factory,
              abi: RH_FACTORY_ABI,
              functionName: "createTokenV3",
              // priceTick = starting price (WETH per token) from the market cap
              args: [input.name, input.symbol, mcToPriceTick(input.startMcUsd, input.ethUsd), ""],
              chain: robinhoodChain,
            })
          : await wallet.writeContract({
              address: RH.factory,
              abi: RH_FACTORY_ABI,
              functionName: "createToken",
              args: [
                input.name,
                input.symbol,
                BigInt(Math.round(input.baseFeePct * 100)),
                BigInt(Math.round(input.startMcUsd)),
                "",
              ],
              chain: robinhoodChain,
            });
        set("launch", { status: "run", note: "waiting for confirmation…" });
        const rc = await pub.waitForTransactionReceipt({ hash });
        for (const log of rc.logs) {
          try {
            const d = decodeEventLog({ abi: RH_FACTORY_ABI, data: log.data, topics: log.topics });
            if (d.eventName === "TokenLaunched") { tok = (d.args as any).token; break; }
          } catch {}
        }
      } else {
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
        for (const log of rc.logs) {
          try {
            const d = decodeEventLog({ abi: FACTORY_ABI, data: log.data, topics: log.topics });
            if (d.eventName === "TokenDeployed") { tok = (d.args as any).token; break; }
          } catch {}
        }
      }

      if (!tok) throw new Error("token address not found in receipt");

      setToken(tok);
      set("launch", { status: "ok", note: tok });

      // Always persist off-chain metadata: the feed uses creator + venue for the
      // "deployed by" line and the chain badge, and image/socials for the card.
      await saveTokenMeta({
        token: tok,
        venue,
        image: input.imageUrl,
        website: input.website,
        x: input.x,
        github: input.github,
        telegram: input.telegram,
        description: input.description,
        creator: address,
        name: input.name,
        symbol: input.symbol,
      });

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
