import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // hardhat default
// Fresh mainnet key (NOT the leaked testnet key). Set in .env as MAINNET_PRIVATE_KEY.
const MAINNET_PRIVATE_KEY = process.env.MAINNET_PRIVATE_KEY || PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 1 },
      evmVersion: "cancun",
      viaIR: true,
      // RecomNFT sits at the EIP-170 24KB ceiling; stripping revert-reason strings
      // keeps it deployable without touching logic (requires still revert).
      debug: { revertStrings: "strip" },
    },
  },
  networks: {
    "base-sepolia": {
      // Public sepolia.base.org is flaky for heavy txs; prefer a keyed RPC if set.
      url: process.env.SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: [PRIVATE_KEY],
      chainId: 84532,
    },
    "base": {
      url: process.env.MAINNET_RPC_URL || "https://mainnet.base.org",
      accounts: [MAINNET_PRIVATE_KEY],
      chainId: 8453,
    },
  },
  // Etherscan V2 multichain: a single key routes by chainId (Base + Base Sepolia).
  etherscan: {
    apiKey: process.env.BASESCAN_API_KEY || "",
  },
  // Sourcify is in a scheduled brownout (API v1) — disable so verify uses Etherscan.
  sourcify: {
    enabled: false,
  },
};

export default config;
