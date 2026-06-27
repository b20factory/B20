import { ethers } from "hardhat";
// Prove the Clanker-style DYNAMIC fee: base fee in calm markets, ramps toward max
// when a swap moves price hard (volatility), capped at max. Launch with base 1%,
// max 5%, then watch currentFeeBps react to a big swap.
const D = require("../deployment-b20-base-sepolia.json");
const LAUNCHPAD = D.launchpad, SWAP_ROUTER = D.swapRouter, HOOK = D.feeHook;
const Z = "0x" + "0".repeat(64); const ONE = "0x" + "0".repeat(63) + "1";

const LP_ABI = ["function launchCollection((string name,string ticker,string bio,string[6] photoURIs,uint8 photoCount,string socialX,string socialGithub,string socialFarcaster,uint256 mintPriceWei,bool tokenEnabled,uint256 tokenFeeBps,uint256 decaySeconds,uint8 feeReceiveType,uint256 startMcPairWei,bool pairIsUSDC,bytes32[4] phaseRoots,uint256[4] phaseStarts,uint256[4] phaseEnds,uint256[4] phaseMaxPerWallet,string allowlistCID)) returns (address)", "event CollectionLaunched(address indexed collection,address indexed creator,string name,string ticker,uint256 mintPrice,uint256 mintStart)"];
const NFT_ABI = ["function mint(uint256 quantity, bytes32[] proof) payable", "function getCollectionInfo() view returns (tuple(string,string,string,string,string,string,string[6],uint8,address,uint256,uint256,bool,address,bool,uint256))"];
const HOOK_ABI = ["function baseFeeBps(bytes32) view returns (uint256)", "function maxFeeBps(bytes32) view returns (uint256)", "function currentFeeBps(bytes32) view returns (uint256)", "function lastTickDelta(bytes32) view returns (uint256)"];
const ROUTER_ABI = ["function swapExactIn((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,bool zeroForOne,uint256 amountIn,uint256 minOut,address recipient) payable returns (uint256)"];

async function main() {
  const [s] = await ethers.getSigners();
  const now = Math.floor(Date.now() / 1000); const FAR = 9999999999n;
  const lp = new ethers.Contract(LAUNCHPAD, LP_ABI, s);
  const p = {
    name: "B20 Dynamic " + Math.floor(Math.random() * 1e6), ticker: "B20DY", bio: "dynamic fee",
    photoURIs: ["ipfs://Qm1", "ipfs://Qm2", "ipfs://Qm3", "", "", ""], photoCount: 3,
    socialX: "", socialGithub: "", socialFarcaster: "",
    mintPriceWei: 0n, tokenEnabled: true, tokenFeeBps: 100n /* 1% base */, decaySeconds: 0n,
    feeReceiveType: 0, startMcPairWei: ethers.parseEther("3"), pairIsUSDC: false,
    phaseRoots: [ONE, ONE, ONE, Z],
    phaseStarts: [BigInt(now - 3), BigInt(now - 2), BigInt(now - 1), BigInt(now)],
    phaseEnds: [BigInt(now - 2), BigInt(now - 1), BigInt(now), FAR],
    phaseMaxPerWallet: [0n, 0n, 0n, 0n], allowlistCID: "",
  };
  console.log("launching (base fee 1%)...");
  const rc = await (await lp.launchCollection(p, { gasLimit: 7_000_000n })).wait();
  const col = rc.logs.map((l: any) => { try { return lp.interface.parseLog(l); } catch { return null; } }).find((e: any) => e && e.name === "CollectionLaunched").args.collection;
  const nft = new ethers.Contract(col, NFT_ABI, s);
  for (let d = 0; d < 100;) { const q = Math.min(20, 100 - d); const last = d + q >= 100; await (await nft.mint(q, [], { value: 0, gasLimit: last ? 16_000_000n : 6_000_000n })).wait(); d += q; }
  let token = ethers.ZeroAddress;
  for (let i = 0; i < 20; i++) { const info = await nft.getCollectionInfo(); if (info[11] && info[12] !== ethers.ZeroAddress) { token = info[12]; break; } await new Promise(r => setTimeout(r, 3000)); }
  if (token === ethers.ZeroAddress) throw new Error("no token");
  console.log("token:", token);

  const poolId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24", "int24", "address"], [ethers.ZeroAddress, token, 0, 60, HOOK]));
  const hook = new ethers.Contract(HOOK, HOOK_ABI, s);
  const router = new ethers.Contract(SWAP_ROUTER, ROUTER_ABI, s);
  const key = { currency0: ethers.ZeroAddress, currency1: token, fee: 0, tickSpacing: 60, hooks: HOOK };
  const show = async (label: string) => console.log(`${label}: base=${await hook.baseFeeBps(poolId)} max=${await hook.maxFeeBps(poolId)} CURRENT=${await hook.currentFeeBps(poolId)}bps lastTickDelta=${await hook.lastTickDelta(poolId)}`);

  await show("\nat launch (calm)");

  console.log("\n-> small buy 0.0005 ETH");
  await (await router.swapExactIn(key, true, ethers.parseEther("0.0005"), 0n, s.address, { value: ethers.parseEther("0.0005"), gasLimit: 2_000_000n })).wait();
  await new Promise(r => setTimeout(r, 2500));
  await show("after small buy");

  console.log("\n-> BIG buy 0.08 ETH (moves price hard = volatility)");
  await (await router.swapExactIn(key, true, ethers.parseEther("0.08"), 0n, s.address, { value: ethers.parseEther("0.08"), gasLimit: 2_000_000n })).wait();
  await new Promise(r => setTimeout(r, 2500));
  await show("after BIG buy");

  const feeAfterBig = await hook.currentFeeBps(poolId);
  console.log("\n-> another small buy at the elevated fee");
  await (await router.swapExactIn(key, true, ethers.parseEther("0.0005"), 0n, s.address, { value: ethers.parseEther("0.0005"), gasLimit: 2_000_000n })).wait();
  await new Promise(r => setTimeout(r, 2500));
  await show("after settle buy");

  console.log("\nDYNAMIC FEE:", feeAfterBig > 100n ? `OK (fee rose from 1% base to ${Number(feeAfterBig) / 100}% after the big swap, capped at 5%)` : "NO CHANGE (tune VOL_FULL_TICKS)");
}
main().catch((e) => { console.error("FAIL:", e.shortMessage || e.message); process.exit(1); });
