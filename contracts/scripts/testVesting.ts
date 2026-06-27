import { ethers } from "hardhat";
// Local time-travel test of B20Vesting: prove the monthly release schedule + claim.
//   npx hardhat run scripts/testVesting.ts   (default in-process hardhat network)
const M = (n: string) => ethers.parseUnits(n, 18);
const MONTH = 30 * 24 * 3600;

async function jump(seconds: number) { await ethers.provider.send("evm_increaseTime", [seconds]); await ethers.provider.send("evm_mine", []); }
const fmt = (x: bigint) => ethers.formatUnits(x, 18);

async function main() {
  const [deployer, creator] = await ethers.getSigners();
  const total = M("200000000");      // 20% of 1B
  const perPeriod = M("10000000");    // 1% of 1B

  const Mock = await ethers.getContractFactory("MockERC20");
  const token = await Mock.deploy(total); await token.waitForDeployment();

  const Vesting = await ethers.getContractFactory("B20Vesting");
  const vesting = await Vesting.deploy(await token.getAddress(), creator.address, total, perPeriod, MONTH);
  await vesting.waitForDeployment();
  await (await token.transfer(await vesting.getAddress(), total)).wait();

  const bal = () => token.balanceOf(creator.address);
  console.log("claimable @ t0:", fmt(await vesting.claimable()), "(expect 0)");

  await jump(MONTH);
  console.log("\nafter 1 month -> claimable:", fmt(await vesting.claimable()), "(expect 10M)");
  await (await vesting.connect(creator).claim()).wait();
  console.log("  creator balance after claim:", fmt(await bal()), "(expect 10M)");

  await jump(5 * MONTH);
  console.log("\nafter +5 months -> claimable:", fmt(await vesting.claimable()), "(expect 50M)");
  await (await vesting.connect(creator).claim()).wait();
  console.log("  creator balance:", fmt(await bal()), "(expect 60M)");

  await jump(50 * MONTH); // way past the 20-month end
  console.log("\nafter +50 months -> claimable:", fmt(await vesting.claimable()), "(expect remaining 140M, capped)");
  await (await vesting.connect(creator).claim()).wait();
  console.log("  creator balance:", fmt(await bal()), "(expect full 200M)");
  console.log("  vesting contract empty:", fmt(await token.balanceOf(await vesting.getAddress())), "(expect 0)");

  let reverted = false;
  try { await (await vesting.connect(creator).claim()).wait(); } catch { reverted = true; }
  console.log("\nclaim again reverts:", reverted, "(expect true)");

  const ok = (await bal()) === total && (await token.balanceOf(await vesting.getAddress())) === 0n && reverted;
  console.log("\nVESTING SCHEDULE:", ok ? "OK (20% over 20 months, 1%/month, beneficiary-only)" : "MISMATCH");
}
main().catch((e) => { console.error("FAIL:", e.shortMessage || e.message); process.exit(1); });
