import { http, createConfig } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { CHAIN_ID } from "./contracts";

export const ACTIVE_CHAIN = CHAIN_ID === 8453 ? base : baseSepolia;

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    injected({ target: { id: "injected", name: "Browser Wallet", provider: () => (typeof window !== "undefined" ? (window as any).ethereum : undefined) } }),
    coinbaseWallet({ appName: "B20factory", preference: "all" }),
  ],
  transports: {
    // On the client, route Base reads through the same-origin keyed proxy (/api/rpc)
    // so getLogs (chart/feed) hits a reliable keyed RPC without exposing the key.
    // On the server (SSR) fall back to the default public RPC.
    [base.id]: http(typeof window !== "undefined" ? "/api/rpc" : undefined),
    [baseSepolia.id]: http(),
  },
  ssr: true,
});
