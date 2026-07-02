import { ethers } from "hardhat";

// FULL E2E of the B20factory stack the FRONTEND uses (Base Sepolia, fee-mode stack).
// Covers: direct launch (ETH + token fee modes), pool seeding, buy/sell round trip,
// dynamic fee views, vesting (views + claim gating), splitter distribute (ETH +
// token-buyback path), retrySeed idempotency, hook access control.
const FACTORY = "0x35deBD09cA16f264DC37506C4A58a5b85AD9fD16";
const ROUTER = "0x7960d31705394094a4667ee3dB203455Ce7a1e7E";
const HOOK = "0x0783bB68D3a3e4C2f061Da49669EC01f28cEE0CC";

const FACTORY_ABI = [
  "function launch(string name,string symbol,uint256 baseFeeBps,uint256 maxFeeBps,uint256 startMcWei,uint8 feeReceiveType) returns (address)",
  "function tokenToSplitter(address) view returns (address)",
  "function tokenToVesting(address) view returns (address)",
  "function tokenToCollection(address) view returns (address)",
  "function tokenToStartMc(address) view returns (uint256)",
  "function getAllTokens() view returns (address[])",
  "function router() view returns (address)",
  "function retrySeed(address)",
  "event TokenDeployed(address indexed collection, address indexed token, address creator, string name, string symbol)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];
const ROUTER_ABI = [
  "function swapExactIn((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,bool zeroForOne,uint256 amountIn,uint256 minOut,address recipient) payable returns (uint256)",
];
const HOOK_ABI = [
  "function currentFeeBps(bytes32) view returns (uint256)",
  "function baseFeeBps(bytes32) view returns (uint256)",
  "function maxFeeBps(bytes32) view returns (uint256)",
  "function registerPool((address,address,uint24,int24,address),address,uint256,uint256)",
];
const VEST_ABI = [
  "function beneficiary() view returns (address)",
  "function totalAmount() view returns (uint256)",
  "function releasePerPeriod() view returns (uint256)",
  "function periodSeconds() view returns (uint256)",
  "function claimable() view returns (uint256)",
  "function vested() view returns (uint256)",
  "function claim()",
];
const SPLIT_ABI = [
  "function creator() view returns (address)",
  "function platform() view returns (address)",
  "function creatorBps() view returns (uint256)",
  "function feeReceiveType() view returns (uint8)",
  "function distribute()",
  "function pending(address) view returns (uint256)",
];

const E = ethers;
let pass = 0, fail = 0;
function check(label: string, ok: boolean, extra = "") {
  if (ok) { pass++; console.log(`  PASS ${label} ${extra}`); }
  else { fail++; console.log(`  FAIL ${label} ${extra}`); }
}
const key = (token: string) => ({ currency0: E.ZeroAddress, currency1: token, fee: 0, tickSpacing: 60, hooks: HOOK });
function poolId(token: string): string {
  return E.keccak256(E.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint24", "int24", "address"],
    [E.ZeroAddress, token, 0, 60, HOOK]
  ));
}

async function launchAs(w: any, name: string, sym: string, recv: number): Promise<string> {
  const f = new E.Contract(FACTORY, FACTORY_ABI, w);
  const rc = await (await f.launch(name, sym, 300, 500, E.parseEther("3"), recv, { gasLimit: 6_000_000n })).wait();
  const ev = rc!.logs.map((l: any) => { try { return f.interface.parseLog(l); } catch { return null; } })
    .find((e: any) => e && e.name === "TokenDeployed");
  return ev.args.token as string;
}

async function main() {
  const [owner] = await E.getSigners();
  const prov = owner.provider!;
  console.log("signer (deployer/owner):", owner.address, E.formatEther(await prov.getBalance(owner.address)), "ETH");

  // fresh public-creator wallet so we test the PUBLIC path (not ownerDirect)
  const creator = new E.Wallet(E.Wallet.createRandom().privateKey, prov);
  await (await owner.sendTransaction({ to: creator.address, value: E.parseEther("0.05") })).wait();
  // public Sepolia RPC lags; poll until the funding is actually reflected
  for (let i = 0; i < 30 && (await prov.getBalance(creator.address)) === 0n; i++) await new Promise((r) => setTimeout(r, 2000));
  console.log("creator wallet:", creator.address, "funded", E.formatEther(await prov.getBalance(creator.address)), "ETH\n");

  const f = new E.Contract(FACTORY, FACTORY_ABI, prov);
  const hook = new E.Contract(HOOK, HOOK_ABI, prov);

  console.log("== 1. Direct launch (fee mode: ETH) ==");
  const tokenA = await launchAs(creator, "E2E Alpha", "E2EA", 0);
  console.log("  tokenA:", tokenA);
  const tA = new E.Contract(tokenA, ERC20_ABI, prov);
  check("token is B20 (0xB200 prefix)", tokenA.toLowerCase().startsWith("0xb200"));
  check("total supply 1B", (await tA.totalSupply()) === E.parseEther("1000000000"));
  check("pool seeded (only rounding dust left)", (await tA.balanceOf(FACTORY)) < 10n ** 6n, `dust=${await tA.balanceOf(FACTORY)} wei-token`);
  check("in getAllTokens", (await f.getAllTokens()).map((a: string) => a.toLowerCase()).includes(tokenA.toLowerCase()));
  check("direct-launch marker (startMc)", (await f.tokenToStartMc(tokenA)) > 0n);

  const vestAddr = await f.tokenToVesting(tokenA);
  const splitAddr = await f.tokenToSplitter(tokenA);
  const vest = new E.Contract(vestAddr, VEST_ABI, prov);
  const split = new E.Contract(splitAddr, SPLIT_ABI, prov);
  check("vesting exists", vestAddr !== E.ZeroAddress);
  check("vesting beneficiary == creator (H-1)", (await vest.beneficiary()).toLowerCase() === creator.address.toLowerCase());
  check("vesting holds 20% (200M)", (await tA.balanceOf(vestAddr)) === E.parseEther("200000000"));
  check("vesting release 1%/period", (await vest.releasePerPeriod()) === E.parseEther("10000000"));
  check("splitter creator == creator", (await split.creator()).toLowerCase() === creator.address.toLowerCase());
  check("splitter mode ETH", (await split.feeReceiveType()) === 0n);
  check("hook base fee 3%", (await hook.baseFeeBps(poolId(tokenA))) === 300n);
  check("hook max fee 5%", (await hook.maxFeeBps(poolId(tokenA))) === 500n);
  check("current fee starts at base", (await hook.currentFeeBps(poolId(tokenA))) === 300n);

  console.log("\n== 2. Buy / sell round trip ==");
  const router = new E.Contract(ROUTER, ROUTER_ABI, creator);
  const buyEth = E.parseEther("0.01");
  const ethBefore = await prov.getBalance(creator.address);
  await (await router.swapExactIn(key(tokenA), true, buyEth, 0n, creator.address, { value: buyEth, gasLimit: 1_000_000n })).wait();
  const got = await tA.balanceOf(creator.address);
  check("buy delivers tokens", got > 0n, `got ${E.formatEther(got)} E2EA for 0.01 ETH`);
  const splitBal1 = await prov.getBalance(splitAddr);
  check("swap fee accrued to splitter (ETH)", splitBal1 > 0n, `${E.formatEther(splitBal1)} ETH`);

  await (await new E.Contract(tokenA, ERC20_ABI, creator).approve(ROUTER, got)).wait();
  await (await router.swapExactIn(key(tokenA), false, got, 0n, creator.address, { gasLimit: 1_000_000n })).wait();
  const ethAfter = await prov.getBalance(creator.address);
  const spent = ethBefore - ethAfter; // net cost of round trip incl gas
  const retainedPct = 100 - Number((spent * 10000n) / buyEth) / 100;
  check("sell works, round trip keeps >88% (not a honeypot)", spent < (buyEth * 12n) / 100n, `net cost ${E.formatEther(spent)} ETH (~${(Number(spent) / 1e16).toFixed(1)}% incl gas)`);
  check("token balance back to 0 after sell", (await tA.balanceOf(creator.address)) === 0n);

  console.log("\n== 3. Vesting gating ==");
  check("claimable now = 0 (30d period)", (await vest.claimable()) === 0n);
  let claimReverted = false;
  try { await (await new E.Contract(vestAddr, VEST_ABI, creator).claim({ gasLimit: 300000n })).wait(); } catch { claimReverted = true; }
  check("claim() reverts before first period", claimReverted);

  console.log("\n== 4. Splitter distribute (ETH mode) ==");
  const platform = await split.platform();
  const cBefore = await prov.getBalance(creator.address);
  const distBal = await prov.getBalance(splitAddr);
  await (await new E.Contract(splitAddr, SPLIT_ABI, owner)["distribute()"]({ gasLimit: 500000n })).wait(); // permissionless
  const cGain = (await prov.getBalance(creator.address)) - cBefore;
  check("creator got exactly 55%", cGain === (distBal * 55n) / 100n, `+${E.formatEther(cGain)} ETH of ${E.formatEther(distBal)}`);
  // platform's 45% is `bal - toCreator` by construction; prove it left the splitter
  // (splitter fully drained, nothing parked) instead of tracking treasury==caller delta.
  const leftover = (await prov.getBalance(splitAddr)) - (await split.pending(creator.address)) - (await split.pending(platform));
  check("splitter fully drained (platform 45% paid out)", leftover === 0n, `leftover=${E.formatEther(leftover)} ETH`);
  check("no parked pending", (await split.pending(creator.address)) === 0n && (await split.pending(platform)) === 0n);

  console.log("\n== 5. Fee mode TOKEN (creator buyback) ==");
  check("factory router wired", (await f.router()).toLowerCase() === ROUTER.toLowerCase(), await f.router());
  const tokenB = await launchAs(creator, "E2E Beta", "E2EB", 1);
  console.log("  tokenB:", tokenB);
  const tB = new E.Contract(tokenB, ERC20_ABI, prov);
  const splitB = await f.tokenToSplitter(tokenB);
  check("splitter mode TOKEN", (await new E.Contract(splitB, SPLIT_ABI, prov).feeReceiveType()) === 1n);
  await (await router.swapExactIn(key(tokenB), true, E.parseEther("0.008"), 0n, creator.address, { value: E.parseEther("0.008"), gasLimit: 1_000_000n })).wait();
  const tokBefore = await tB.balanceOf(creator.address);
  await (await new E.Contract(splitB, SPLIT_ABI, owner)["distribute()"]({ gasLimit: 900000n })).wait();
  const tokGain = (await tB.balanceOf(creator.address)) - tokBefore;
  check("creator fee delivered as TOKEN (buyback)", tokGain > 0n, `+${E.formatEther(tokGain)} E2EB`);

  console.log("\n== 6. Negative / safety ==");
  let rsReverted = false;
  try { await (await new E.Contract(FACTORY, FACTORY_ABI, owner).retrySeed(tokenA, { gasLimit: 500000n })).wait(); } catch { rsReverted = true; }
  check("retrySeed on seeded token reverts", rsReverted);
  let regReverted = false;
  try {
    await (await new E.Contract(HOOK, HOOK_ABI, owner).registerPool([E.ZeroAddress, tokenA, 0, 60, HOOK], owner.address, 300, 500, { gasLimit: 300000n })).wait();
  } catch { regReverted = true; }
  check("hook.registerPool from non-factory reverts", regReverted);

  console.log(`\n==== RESULT: ${pass} PASS / ${fail} FAIL ====`);
  console.log("tokenA:", tokenA, "\ntokenB:", tokenB, "\ncreator:", creator.address);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
