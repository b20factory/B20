import { ethers } from "hardhat";
// B20factory E2E on Base Sepolia: launch -> bond 100 -> native B20 token auto-deploys
// -> verify it is admin-less / supply-capped / clean -> buy + sell round-trip (what a
// honeypot simulator does) and measure the effective fee.
const D = require("../deployment-b20-base-sepolia.json");
const LAUNCHPAD = D.launchpad, SWAP_ROUTER = D.swapRouter, HOOK = D.feeHook, FACTORY = D.tokenFactory;
const B20_FACTORY = "0xB20f000000000000000000000000000000000000";
const Z = "0x" + "0".repeat(64); const ONE = "0x" + "0".repeat(63) + "1";

const LP_ABI = ["function launchCollection((string name,string ticker,string bio,string[6] photoURIs,uint8 photoCount,string socialX,string socialGithub,string socialFarcaster,uint256 mintPriceWei,bool tokenEnabled,uint256 tokenFeeBps,uint256 decaySeconds,uint8 feeReceiveType,uint256 startMcPairWei,bool pairIsUSDC,bytes32[4] phaseRoots,uint256[4] phaseStarts,uint256[4] phaseEnds,uint256[4] phaseMaxPerWallet,string allowlistCID)) returns (address)", "event CollectionLaunched(address indexed collection,address indexed creator,string name,string ticker,uint256 mintPrice,uint256 mintStart)"];
const NFT_ABI = ["function mint(uint256 quantity, bytes32[] proof) payable", "function getCollectionInfo() view returns (tuple(string,string,string,string,string,string,string[6],uint8,address,uint256,uint256,bool,address,bool,uint256))"];
const B20F_ABI = ["function isB20Initialized(address) view returns (bool)", "function isB20(address) view returns (bool)"];
const TOK_ABI = [
  "function name() view returns (string)", "function symbol() view returns (string)",
  "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)",
  "function supplyCap() view returns (uint256)", "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)",
  "function mint(address,uint256)", "function hasRole(bytes32,address) view returns (bool)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
];
const ROUTER_ABI = ["function swapExactIn((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,bool zeroForOne,uint256 amountIn,uint256 minOut,address recipient) payable returns (uint256)"];
const HOOK_ABI = ["function currentFeeBps(bytes32) view returns (uint256)", "function baseFeeBps(bytes32) view returns (uint256)", "function maxFeeBps(bytes32) view returns (uint256)"];

const poll = async (fn: () => Promise<bigint>, cmp: (v: bigint) => boolean, n = 15) => {
  let v = 0n; for (let i = 0; i < n; i++) { try { v = await fn(); if (cmp(v)) return v; } catch {} await new Promise(r => setTimeout(r, 2000)); } return v;
};

async function main() {
  const [s] = await ethers.getSigners();
  console.log("creator:", s.address, "bal:", ethers.formatEther(await ethers.provider.getBalance(s.address)));
  const now = Math.floor(Date.now() / 1000); const FAR = 9999999999n;
  const lp = new ethers.Contract(LAUNCHPAD, LP_ABI, s);
  const p = {
    name: "B20factory Test", ticker: "B20T", bio: "native B20 single-sided launch",
    photoURIs: ["ipfs://Qm1", "ipfs://Qm2", "ipfs://Qm3", "", "", ""], photoCount: 3,
    socialX: "", socialGithub: "", socialFarcaster: "",
    mintPriceWei: 0n, tokenEnabled: true,
    tokenFeeBps: 300n,    // 3% base
    decaySeconds: 30n,    // anti-sniper: 5% -> 3% over 30s
    feeReceiveType: 0, startMcPairWei: ethers.parseEther("3"), pairIsUSDC: false,
    phaseRoots: [ONE, ONE, ONE, Z],
    phaseStarts: [BigInt(now - 3), BigInt(now - 2), BigInt(now - 1), BigInt(now)],
    phaseEnds: [BigInt(now - 2), BigInt(now - 1), BigInt(now), FAR],
    phaseMaxPerWallet: [0n, 0n, 0n, 0n], allowlistCID: "",
  };
  console.log("launching B20factory collection...");
  const rc = await (await lp.launchCollection(p, { gasLimit: 7_000_000n })).wait();
  const col = rc.logs.map((l: any) => { try { return lp.interface.parseLog(l); } catch { return null; } }).find((e: any) => e && e.name === "CollectionLaunched").args.collection;
  console.log("collection:", col);

  const nft = new ethers.Contract(col, NFT_ABI, s);
  for (let d = 0; d < 100;) { const q = Math.min(20, 100 - d); const last = d + q >= 100; await (await nft.mint(q, [], { value: 0, gasLimit: last ? 16_000_000n : 6_000_000n })).wait(); d += q; console.log("minted", d, last ? "(bonding -> token deploy)" : ""); }

  let token = ethers.ZeroAddress;
  for (let i = 0; i < 20; i++) { const info = await nft.getCollectionInfo(); if (info[11] && info[12] !== ethers.ZeroAddress) { token = info[12]; break; } await new Promise(r => setTimeout(r, 3000)); }
  if (token === ethers.ZeroAddress) throw new Error("no token deployed");
  console.log("\nB20 TOKEN DEPLOYED:", token);

  // ── Verify native B20 identity + anti-honeypot config ──────────────────────
  const fac = new ethers.Contract(B20_FACTORY, B20F_ABI, s);
  const t = new ethers.Contract(token, TOK_ABI, s);
  await poll(() => fac.isB20Initialized(token).then((b: boolean) => b ? 1n : 0n), v => v === 1n);
  console.log("isB20:", await fac.isB20(token), "| isB20Initialized:", await fac.isB20Initialized(token));
  console.log("name/symbol/decimals:", await t.name(), "/", await t.symbol(), "/", (await t.decimals()).toString());
  const cap = await t.supplyCap(), sup = await t.totalSupply();
  console.log("supplyCap:", ethers.formatUnits(cap, 18), "| totalSupply:", ethers.formatUnits(sup, 18), "| capped&fullyMinted:", cap === sup && sup === ethers.parseUnits("1000000000", 18));
  let notMintable = false;
  try { await (await t.mint(s.address, 1n)).wait(); } catch { notMintable = true; }
  console.log("not mintable by anyone:", notMintable);

  // ── Verify supply split (80% pool / 20% vested) + vesting schedule + fee split ──
  const factory = new ethers.Contract(FACTORY, [
    "function tokenToVesting(address) view returns (address)",
    "function tokenToSplitter(address) view returns (address)",
  ], s);
  const vestingAddr = await factory.tokenToVesting(token);
  const splitterAddr = await factory.tokenToSplitter(token);
  const vesting = new ethers.Contract(vestingAddr, [
    "function totalAmount() view returns (uint256)", "function releasePerPeriod() view returns (uint256)",
    "function periodSeconds() view returns (uint256)", "function beneficiary() view returns (address)",
    "function claimable() view returns (uint256)",
  ], s);
  const splitter = new ethers.Contract(splitterAddr, ["function creatorBps() view returns (uint256)"], s);
  const vestBal = await t.balanceOf(vestingAddr);
  console.log("\nvesting contract:", vestingAddr);
  console.log("  vested slice held:", ethers.formatUnits(vestBal, 18), "(expect 200M = 20%)");
  console.log("  totalAmount:", ethers.formatUnits(await vesting.totalAmount(), 18),
    "| releasePerPeriod:", ethers.formatUnits(await vesting.releasePerPeriod(), 18),
    "| period(s):", (await vesting.periodSeconds()).toString());
  console.log("  beneficiary == creator:", (await vesting.beneficiary()).toLowerCase() === s.address.toLowerCase());
  console.log("  claimable now (pre-period):", ethers.formatUnits(await vesting.claimable(), 18), "(expect 0)");
  console.log("fee splitter:", splitterAddr, "| creatorBps:", (await splitter.creatorBps()).toString(), "(expect 55, platform 45)");

  // ── Buy + sell round-trip (honeypot simulation) ────────────────────────────
  const key = { currency0: ethers.ZeroAddress, currency1: token, fee: 0, tickSpacing: 60, hooks: HOOK };
  const poolId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint24", "int24", "address"], [ethers.ZeroAddress, token, 0, 60, HOOK]));
  const hook = new ethers.Contract(HOOK, HOOK_ABI, s);
  console.log("\npool base fee bps:", (await hook.baseFeeBps(poolId)).toString(), "| max fee bps:", (await hook.maxFeeBps(poolId)).toString(), "| current fee bps:", (await hook.currentFeeBps(poolId)).toString());

  const router = new ethers.Contract(SWAP_ROUTER, ROUTER_ABI, s);
  const buyEth = ethers.parseEther("0.001");
  const tokBefore = await t.balanceOf(s.address);
  await (await router.swapExactIn(key, true, buyEth, 0n, s.address, { value: buyEth, gasLimit: 2_000_000n })).wait();
  const bought = await poll(() => t.balanceOf(s.address).then((b: bigint) => b - tokBefore), v => v > 0n);
  console.log("BUY 0.001 ETH ->", ethers.formatUnits(bought, 18), token === ethers.ZeroAddress ? "" : "tokens", bought > 0n ? "OK" : "FAIL");

  if (bought > 0n) {
    if ((await t.allowance(s.address, SWAP_ROUTER)) < bought) await (await t.approve(SWAP_ROUTER, ethers.MaxUint256)).wait();
    const ethBefore = await ethers.provider.getBalance(s.address);
    const sellAmt = bought / 2n;
    const stx = await router.swapExactIn(key, false, sellAmt, 0n, s.address, { value: 0n, gasLimit: 2_000_000n });
    const src = await stx.wait();
    const ethAfter = await ethers.provider.getBalance(s.address);
    const ethBack = ethAfter - ethBefore + src.gasUsed * (src.gasPrice ?? 0n);
    console.log("SELL", ethers.formatUnits(sellAmt, 18), "tokens -> ETH (gross of gas):", ethers.formatEther(ethBack), ethBack > 0n ? "OK (NOT a honeypot)" : "FAIL");
  }

  console.log("\nbasescan:", "https://sepolia.basescan.org/token/" + token);
}
main().catch((e) => { console.error("FAIL:", e.shortMessage || e.message); process.exit(1); });
