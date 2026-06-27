import { ethers } from "hardhat";
// B20factory E2E: OWNER direct-distribution. Owner prepares 20 addresses; at launch
// the reserved slice is minted straight to them (instant, no vesting). Public launches
// (creator != owner) still use monthly vesting - covered by testB20Launch.ts.
const D = require("../deployment-b20-base-sepolia.json");
const LAUNCHPAD = D.launchpad, SWAP_ROUTER = D.swapRouter, HOOK = D.feeHook, FACTORY = D.tokenFactory;
const Z = "0x" + "0".repeat(64); const ONE = "0x" + "0".repeat(63) + "1";

const LP_ABI = ["function launchCollection((string name,string ticker,string bio,string[6] photoURIs,uint8 photoCount,string socialX,string socialGithub,string socialFarcaster,uint256 mintPriceWei,bool tokenEnabled,uint256 tokenFeeBps,uint256 decaySeconds,uint8 feeReceiveType,uint256 startMcPairWei,bool pairIsUSDC,bytes32[4] phaseRoots,uint256[4] phaseStarts,uint256[4] phaseEnds,uint256[4] phaseMaxPerWallet,string allowlistCID)) returns (address)", "event CollectionLaunched(address indexed collection,address indexed creator,string name,string ticker,uint256 mintPrice,uint256 mintStart)"];
const NFT_ABI = ["function mint(uint256 quantity, bytes32[] proof) payable", "function getCollectionInfo() view returns (tuple(string,string,string,string,string,string,string[6],uint8,address,uint256,uint256,bool,address,bool,uint256))"];
const FACTORY_ABI = [
  "function setDistribution(address[] recipients, uint256[] bps)",
  "function distRecipientsLength() view returns (uint256)",
  "function tokenToVesting(address) view returns (address)",
  "function owner() view returns (address)",
];
const TOK_ABI = ["function totalSupply() view returns (uint256)", "function supplyCap() view returns (uint256)", "function balanceOf(address) view returns (uint256)"];

async function main() {
  const [s] = await ethers.getSigners();
  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, s);
  console.log("owner == signer:", (await factory.owner()).toLowerCase() === s.address.toLowerCase());

  // Prepare 20 recipient addresses, each 100 bps (1% of supply) => 20% total.
  const recipients = Array.from({ length: 20 }, () => ethers.Wallet.createRandom().address);
  const bps = recipients.map(() => 100);
  await (await factory.setDistribution(recipients, bps)).wait();
  console.log("setDistribution: 20 recipients @ 1% each (20% total). list len:", (await factory.distRecipientsLength()).toString());

  const now = Math.floor(Date.now() / 1000); const FAR = 9999999999n;
  const lp = new ethers.Contract(LAUNCHPAD, LP_ABI, s);
  const p = {
    name: "B20 Direct " + Math.floor(Math.random() * 1e6), ticker: "B20D", bio: "owner direct distribution",
    photoURIs: ["ipfs://Qm1", "ipfs://Qm2", "ipfs://Qm3", "", "", ""], photoCount: 3,
    socialX: "", socialGithub: "", socialFarcaster: "",
    mintPriceWei: 0n, tokenEnabled: true, tokenFeeBps: 300n, decaySeconds: 0n,
    feeReceiveType: 0, startMcPairWei: ethers.parseEther("3"), pairIsUSDC: false,
    phaseRoots: [ONE, ONE, ONE, Z],
    phaseStarts: [BigInt(now - 3), BigInt(now - 2), BigInt(now - 1), BigInt(now)],
    phaseEnds: [BigInt(now - 2), BigInt(now - 1), BigInt(now), FAR],
    phaseMaxPerWallet: [0n, 0n, 0n, 0n], allowlistCID: "",
  };
  console.log("launching as owner...");
  const rc = await (await lp.launchCollection(p, { gasLimit: 7_000_000n })).wait();
  const col = rc.logs.map((l: any) => { try { return lp.interface.parseLog(l); } catch { return null; } }).find((e: any) => e && e.name === "CollectionLaunched").args.collection;
  console.log("launched collection:", col);
  const nft = new ethers.Contract(col, NFT_ABI, s);
  // 100th mint triggers deployToken (createB20 + 20 direct mints + pool seed) -> heavy.
  for (let d = 0; d < 100;) {
    const q = Math.min(20, 100 - d); const last = d + q >= 100;
    const mtx = await nft.mint(q, [], { value: 0, gasLimit: last ? 16_000_000n : 6_000_000n });
    const mrc = await mtx.wait();
    d += q; console.log("  minted", d, last ? "(bonding) gasUsed=" + mrc.gasUsed.toString() : "");
  }
  console.log("bonded 100 -> token deploying");

  let token = ethers.ZeroAddress;
  for (let i = 0; i < 20; i++) { const info = await nft.getCollectionInfo(); if (info[11] && info[12] !== ethers.ZeroAddress) { token = info[12]; break; } await new Promise(r => setTimeout(r, 3000)); }
  if (token === ethers.ZeroAddress) throw new Error("no token");
  console.log("\nTOKEN:", token);

  const t = new ethers.Contract(token, TOK_ABI, s);
  // poll one recipient to settle RPC lag, then read all
  const expectEach = ethers.parseUnits("10000000", 18); // 1% of 1B
  for (let i = 0; i < 15; i++) { if ((await t.balanceOf(recipients[0])) >= expectEach) break; await new Promise(r => setTimeout(r, 2000)); }
  let allGood = true, totalToRecipients = 0n;
  for (const r of recipients) { const b = await t.balanceOf(r); totalToRecipients += b; if (b !== expectEach) allGood = false; }
  console.log("each of 20 recipients got exactly 1% (10M):", allGood);
  console.log("total sent to recipients:", ethers.formatUnits(totalToRecipients, 18), "(expect 200M = 20%)");
  console.log("vesting contract for this token:", await factory.tokenToVesting(token), "(expect 0x0 = no vesting, direct mode)");
  console.log("supplyCap == totalSupply == 1B:", (await t.supplyCap()) === (await t.totalSupply()) && (await t.totalSupply()) === ethers.parseUnits("1000000000", 18));

  // pool should hold the remaining 80% and be tradeable
  const router = new ethers.Contract(SWAP_ROUTER, ["function swapExactIn((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,bool zeroForOne,uint256 amountIn,uint256 minOut,address recipient) payable returns (uint256)"], s);
  const key = { currency0: ethers.ZeroAddress, currency1: token, fee: 0, tickSpacing: 60, hooks: HOOK };
  const before = await t.balanceOf(s.address);
  await (await router.swapExactIn(key, true, ethers.parseEther("0.001"), 0n, s.address, { value: ethers.parseEther("0.001"), gasLimit: 2_000_000n })).wait();
  let got = 0n; for (let i = 0; i < 15; i++) { got = (await t.balanceOf(s.address)) - before; if (got > 0n) break; await new Promise(r => setTimeout(r, 2000)); }
  console.log("pool tradeable (buy 0.001 ETH ->", ethers.formatUnits(got, 18), "tokens):", got > 0n);

  // clear distribution so public launches resume monthly vesting
  await (await factory.setDistribution([], [])).wait();
  console.log("\ndistribution cleared -> public launches back to monthly vesting. len:", (await factory.distRecipientsLength()).toString());
  console.log("\nDIRECT DISTRIBUTION:", allGood && totalToRecipients === ethers.parseUnits("200000000", 18) && got > 0n ? "OK" : "MISMATCH");
}
main().catch((e) => { console.error("FAIL:", e.shortMessage || e.message); process.exit(1); });
