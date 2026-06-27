import { ethers } from "hardhat";
// Verify B20FeeSplitter: (1) unit test with distinct creator/platform wallets to
// prove the exact 55/45 split; (2) real flow - swap fees accumulate in the per-token
// splitter from the hook, then distribute() pays them out.
const D = require("../deployment-b20-base-sepolia.json");
const LAUNCHPAD = D.launchpad, SWAP_ROUTER = D.swapRouter, HOOK = D.feeHook, FACTORY = D.tokenFactory;
const Z = "0x" + "0".repeat(64); const ONE = "0x" + "0".repeat(63) + "1";
const LP_ABI = ["function launchCollection((string name,string ticker,string bio,string[6] photoURIs,uint8 photoCount,string socialX,string socialGithub,string socialFarcaster,uint256 mintPriceWei,bool tokenEnabled,uint256 tokenFeeBps,uint256 decaySeconds,uint8 feeReceiveType,uint256 startMcPairWei,bool pairIsUSDC,bytes32[4] phaseRoots,uint256[4] phaseStarts,uint256[4] phaseEnds,uint256[4] phaseMaxPerWallet,string allowlistCID)) returns (address)", "event CollectionLaunched(address indexed collection,address indexed creator,string name,string ticker,uint256 mintPrice,uint256 mintStart)"];
const NFT_ABI = ["function mint(uint256 quantity, bytes32[] proof) payable", "function getCollectionInfo() view returns (tuple(string,string,string,string,string,string,string[6],uint8,address,uint256,uint256,bool,address,bool,uint256))"];
const ROUTER_ABI = ["function swapExactIn((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,bool zeroForOne,uint256 amountIn,uint256 minOut,address recipient) payable returns (uint256)"];
const SPLIT_ABI = ["function creatorBps() view returns (uint256)", "function creator() view returns (address)", "function platform() view returns (address)", "function distribute()", "event Distributed(uint256 toCreator, uint256 toPlatform)"];
const fmt = (x: bigint) => ethers.formatEther(x);

async function unitTest(s: any) {
  console.log("== UNIT: 55/45 split with distinct wallets ==");
  const creator = ethers.Wallet.createRandom().address;
  const platform = ethers.Wallet.createRandom().address;
  const Splitter = await ethers.getContractFactory("B20FeeSplitter");
  const sp = await Splitter.deploy(creator, platform, 55); await sp.waitForDeployment();
  const addr = await sp.getAddress();
  // fund the splitter with 0.1 ETH
  await (await s.sendTransaction({ to: addr, value: ethers.parseEther("0.1") })).wait();
  console.log("  funded splitter 0.1 ETH; creatorBps:", (await sp.creatorBps()).toString());
  await (await sp.distribute()).wait();
  const p = ethers.provider;
  const cBal = await p.getBalance(creator), pBal = await p.getBalance(platform);
  console.log("  creator got:", fmt(cBal), "(expect 0.055) | platform got:", fmt(pBal), "(expect 0.045)");
  const ok = cBal === ethers.parseEther("0.055") && pBal === ethers.parseEther("0.045");
  console.log("  =>", ok ? "OK" : "MISMATCH");
  return ok;
}

async function realFlow(s: any) {
  console.log("\n== REAL FLOW: hook fees -> splitter -> distribute ==");
  const now = Math.floor(Date.now() / 1000); const FAR = 9999999999n;
  const lp = new ethers.Contract(LAUNCHPAD, LP_ABI, s);
  const p = {
    name: "B20 Splitter " + Math.floor(Math.random() * 1e6), ticker: "B20S", bio: "splitter",
    photoURIs: ["ipfs://Qm1", "ipfs://Qm2", "ipfs://Qm3", "", "", ""], photoCount: 3,
    socialX: "", socialGithub: "", socialFarcaster: "",
    mintPriceWei: 0n, tokenEnabled: true, tokenFeeBps: 300n, decaySeconds: 300n /* max=base=3% flat for predictable fee */,
    feeReceiveType: 0, startMcPairWei: ethers.parseEther("3"), pairIsUSDC: false,
    phaseRoots: [ONE, ONE, ONE, Z],
    phaseStarts: [BigInt(now - 3), BigInt(now - 2), BigInt(now - 1), BigInt(now)],
    phaseEnds: [BigInt(now - 2), BigInt(now - 1), BigInt(now), FAR],
    phaseMaxPerWallet: [0n, 0n, 0n, 0n], allowlistCID: "",
  };
  const rc = await (await lp.launchCollection(p, { gasLimit: 7_000_000n })).wait();
  const col = rc.logs.map((l: any) => { try { return lp.interface.parseLog(l); } catch { return null; } }).find((e: any) => e && e.name === "CollectionLaunched").args.collection;
  const nft = new ethers.Contract(col, NFT_ABI, s);
  for (let d = 0; d < 100;) { const q = Math.min(20, 100 - d); const last = d + q >= 100; await (await nft.mint(q, [], { value: 0, gasLimit: last ? 16_000_000n : 6_000_000n })).wait(); d += q; }
  let token = ethers.ZeroAddress;
  for (let i = 0; i < 20; i++) { const info = await nft.getCollectionInfo(); if (info[11] && info[12] !== ethers.ZeroAddress) { token = info[12]; break; } await new Promise(r => setTimeout(r, 3000)); }
  if (token === ethers.ZeroAddress) throw new Error("no token");

  const factory = new ethers.Contract(FACTORY, ["function tokenToSplitter(address) view returns (address)"], s);
  const splitterAddr = await factory.tokenToSplitter(token);
  const sp = new ethers.Contract(splitterAddr, SPLIT_ABI, s);
  console.log("  token:", token, "splitter:", splitterAddr);

  const router = new ethers.Contract(SWAP_ROUTER, ROUTER_ABI, s);
  const key = { currency0: ethers.ZeroAddress, currency1: token, fee: 0, tickSpacing: 60, hooks: HOOK };
  // a few buys to accrue ETH fee into the splitter
  for (let i = 0; i < 3; i++) await (await router.swapExactIn(key, true, ethers.parseEther("0.02"), 0n, s.address, { value: ethers.parseEther("0.02"), gasLimit: 2_000_000n })).wait();
  let accrued = 0n;
  for (let i = 0; i < 15; i++) { accrued = await ethers.provider.getBalance(splitterAddr); if (accrued > 0n) break; await new Promise(r => setTimeout(r, 2000)); }
  console.log("  splitter accrued from swap fees:", fmt(accrued), "ETH (expect ~3% of 0.06 = ~0.0018)");

  const dtx = await sp.distribute(); const drc = await dtx.wait();
  const ev = drc.logs.map((l: any) => { try { return sp.interface.parseLog(l); } catch { return null; } }).find((e: any) => e && e.name === "Distributed");
  const after = await ethers.provider.getBalance(splitterAddr);
  console.log("  distribute() -> toCreator:", fmt(ev.args.toCreator), "toPlatform:", fmt(ev.args.toPlatform));
  const ratio = Number(ev.args.toCreator) / (Number(ev.args.toCreator) + Number(ev.args.toPlatform)) * 100;
  console.log("  creator share:", ratio.toFixed(1) + "% (expect 55%) | splitter emptied:", after === 0n);
  const ok = accrued > 0n && after === 0n && Math.abs(ratio - 55) < 0.5;
  console.log("  =>", ok ? "OK" : "MISMATCH");
  return ok;
}

async function main() {
  const [s] = await ethers.getSigners();
  const u = await unitTest(s);
  const r = await realFlow(s);
  console.log("\nSPLITTER:", u && r ? "OK (55/45 split + hook->splitter->distribute work)" : "MISMATCH");
}
main().catch((e) => { console.error("FAIL:", e.shortMessage || e.message); process.exit(1); });
