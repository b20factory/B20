import { CHAIN_ID, IS_TESTNET } from "./contracts";

export { IS_TESTNET };
export const ACTIVE_LABEL = CHAIN_ID === 8453 ? "base mainnet" : "base sepolia · testnet";

export function bpsToPct(bps?: number | bigint) {
  if (bps == null) return ", ";
  return (Number(bps) / 100).toString() + "%";
}

export function cls(...xs: (string | false | undefined | null)[]) {
  return xs.filter(Boolean).join(" ");
}
