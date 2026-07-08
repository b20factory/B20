// Multi-chain registry: B20factory runs two launch venues.
//  - base:      native B20 tokens via the Beryl precompile + Uniswap v4 stack
//  - robinhood: standard ERC-20 launches on a bonding curve (Primehod-style
//               factory) on Robinhood Chain, graduating to Uniswap v3
import { defineChain } from "viem";

export type VenueId = "base" | "robinhood";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      // Same-origin proxy: Indonesian ISPs block chain.robinhood.com, and the
      // proxy also keeps browser calls same-origin. The VPS forwards upstream.
      http: ["/api/rpc-rh"],
    },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

// B20factory launchpad factory on Robinhood Chain mainnet (chain 4663),
// deployed 2026-07-09, verified on Blockscout. Public info, safe to commit;
// override with NEXT_PUBLIC_RH_FACTORY for a redeploy.
const RH_FACTORY_DEPLOYED = "0xDD32C1B72442Dea7691485C95CFe769fbA34f8Ad";

export const RH = {
  chainId: 4663,
  factory: (process.env.NEXT_PUBLIC_RH_FACTORY || RH_FACTORY_DEPLOYED) as `0x${string}`,
  explorer: "https://robinhoodchain.blockscout.com",
  rpcProxy: "/api/rpc-rh",
  // Direct upstream, used server-side only (the browser goes through the proxy).
  rpcUpstream: "https://rpc.mainnet.chain.robinhood.com",
};

export const rhLive = /^0x[0-9a-fA-F]{40}$/.test(RH.factory);

// Primehod-style factory ABI (deployed for B20factory on Robinhood Chain).
export const RH_FACTORY_ABI = [
  {
    type: "function", name: "createToken", stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "baseFeeBps", type: "uint256" },
      { name: "graduationUsd", type: "uint256" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [{ name: "token", type: "address" }, { name: "curve", type: "address" }],
  },
  { type: "function", name: "tokensCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allTokens", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  {
    type: "function", name: "launchOf", stateMutability: "view", inputs: [{ type: "address" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "market", type: "address" },
      { name: "vesting", type: "address" },
      { name: "creator", type: "address" },
      { name: "locker", type: "address" },
      { name: "venue", type: "uint8" },
    ],
  },
  { type: "function", name: "metadataOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "string" }] },
  { type: "function", name: "ethUsdPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "event", name: "TokenLaunched",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "curve", type: "address", indexed: false },
      { name: "vesting", type: "address", indexed: false },
      { name: "baseFeeBps", type: "uint256", indexed: false },
    ],
  },
] as const;

export const RH_CURVE_ABI = [
  { type: "function", name: "priceX18", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ethRaised", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "graduationCap", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "graduated", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "currentFeeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "creator", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "buy", stateMutability: "payable", inputs: [{ name: "minTokensOut", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "sell", stateMutability: "nonpayable", inputs: [{ name: "tokensIn", type: "uint256" }, { name: "minEthOut", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "quoteBuy", stateMutability: "view", inputs: [{ name: "ethIn", type: "uint256" }], outputs: [{ name: "tokensOut", type: "uint256" }, { name: "fee", type: "uint256" }] },
  { type: "function", name: "quoteSell", stateMutability: "view", inputs: [{ name: "tokensIn", type: "uint256" }], outputs: [{ name: "ethOut", type: "uint256" }, { name: "fee", type: "uint256" }] },
] as const;
