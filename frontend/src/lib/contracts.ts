// B20factory contract addresses (Base Sepolia) + the ABIs the app needs.
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532);

export const ADDR = {
  launchpad: (process.env.NEXT_PUBLIC_LAUNCHPAD || "") as `0x${string}`,
  tokenFactory: (process.env.NEXT_PUBLIC_TOKEN_FACTORY || "") as `0x${string}`,
  feeHook: (process.env.NEXT_PUBLIC_FEE_HOOK || "") as `0x${string}`,
  swapRouter: (process.env.NEXT_PUBLIC_SWAP_ROUTER || "") as `0x${string}`,
  b20Precompile: (process.env.NEXT_PUBLIC_B20_PRECOMPILE || "") as `0x${string}`,
};

// RecomLaunchpad.launchCollection(LaunchParams) — the bonding launch entrypoint.
// For B20factory: tokenFeeBps = BASE fee, decaySeconds = MAX fee (per-launch band).
export const LAUNCHPAD_ABI = [
  {
    type: "function",
    name: "launchCollection",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "ticker", type: "string" },
          { name: "bio", type: "string" },
          { name: "photoURIs", type: "string[6]" },
          { name: "photoCount", type: "uint8" },
          { name: "socialX", type: "string" },
          { name: "socialGithub", type: "string" },
          { name: "socialFarcaster", type: "string" },
          { name: "mintPriceWei", type: "uint256" },
          { name: "tokenEnabled", type: "bool" },
          { name: "tokenFeeBps", type: "uint256" },
          { name: "decaySeconds", type: "uint256" },
          { name: "feeReceiveType", type: "uint8" },
          { name: "startMcPairWei", type: "uint256" },
          { name: "pairIsUSDC", type: "bool" },
          { name: "phaseRoots", type: "bytes32[4]" },
          { name: "phaseStarts", type: "uint256[4]" },
          { name: "phaseEnds", type: "uint256[4]" },
          { name: "phaseMaxPerWallet", type: "uint256[4]" },
          { name: "allowlistCID", type: "string" },
        ],
      },
    ],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "CollectionLaunched",
    inputs: [
      { name: "collection", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "ticker", type: "string", indexed: false },
      { name: "mintPrice", type: "uint256", indexed: false },
      { name: "mintStart", type: "uint256", indexed: false },
    ],
  },
] as const;

export const NFT_ABI = [
  { type: "function", name: "mint", stateMutability: "payable", inputs: [{ name: "quantity", type: "uint256" }, { name: "proof", type: "bytes32[]" }], outputs: [] },
  {
    type: "function", name: "getCollectionInfo", stateMutability: "view", inputs: [],
    outputs: [{
      type: "tuple", name: "", components: [
        { name: "name", type: "string" }, { name: "ticker", type: "string" }, { name: "bio", type: "string" },
        { name: "image", type: "string" }, { name: "x", type: "string" }, { name: "gh", type: "string" },
        { name: "photos", type: "string[6]" }, { name: "photoCount", type: "uint8" }, { name: "creator", type: "address" },
        { name: "minted", type: "uint256" }, { name: "cap", type: "uint256" }, { name: "tokenDeployed", type: "bool" },
        { name: "token", type: "address" }, { name: "fc", type: "bool" }, { name: "extra", type: "uint256" },
      ],
    }],
  },
] as const;

export const FACTORY_ABI = [
  {
    type: "function", name: "launch", stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "baseFeeBps", type: "uint256" },
      { name: "maxFeeBps", type: "uint256" },
      { name: "startMcWei", type: "uint256" },
      { name: "feeReceiveType", type: "uint8" },
    ],
    outputs: [{ name: "tokenAddress", type: "address" }],
  },
  {
    type: "event", name: "TokenDeployed",
    inputs: [
      { name: "collection", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: false },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
    ],
  },
  { type: "function", name: "getAllTokens", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "getTokenCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenToVesting", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenToSplitter", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenToCollection", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address" }] },
] as const;

// B20Vesting — one per token, holds the creator's vested slice (default 20%).
// claim() is permissionless; tokens can only ever go to the immutable beneficiary.
export const VESTING_ABI = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "claimable", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "vested", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "claimed", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "releasePerPeriod", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "periodSeconds", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "startTime", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "beneficiary", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

// B20FeeSplitter — accrues swap fees in ETH; distribute() splits to creator/platform.
export const SPLITTER_ABI = [
  { type: "function", name: "distribute", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

export const HOOK_ABI = [
  { type: "function", name: "baseFeeBps", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxFeeBps", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "currentFeeBps", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }] },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

// OriginSwapRouter — exact-input buy/sell for the in-app swap box.
// buy  = swapExactIn(key, true,  ethIn,   minOut, recipient) with msg.value = ethIn
// sell = swapExactIn(key, false, tokenIn, minOut, recipient) after approve
export const ROUTER_ABI = [
  {
    type: "function", name: "swapExactIn", stateMutability: "payable",
    inputs: [
      {
        name: "key", type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint256" },
      { name: "minOut", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

// V4 pool params used when seeding (fee charged via hook, not the LP fee).
export const POOL_FEE = 0;
export const POOL_TICK_SPACING = 60;

// PoolKey for a B20 token's ETH pair (currency0 = native ETH = address(0)).
export function poolKey(token: `0x${string}`) {
  return {
    currency0: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    currency1: token,
    fee: POOL_FEE,
    tickSpacing: POOL_TICK_SPACING,
    hooks: ADDR.feeHook,
  } as const;
}

export const EXPLORER = CHAIN_ID === 8453 ? "https://basescan.org" : "https://sepolia.basescan.org";
export const IS_TESTNET = CHAIN_ID !== 8453;
