import { ethers, network } from "hardhat";
import * as fs from "fs";

// B20factory full deploy: B20FeeHook (mined for 0xCC flags) + vault + B20TokenFactory
// + NFT deployer + launchpad + airdrop distributor + swap router, wired together.
// Identical topology to OriginPad's deployFull, but the token factory mints a NATIVE
// B20 ASSET (admin-less, supply-capped, 100% single-sided) via the Beryl precompile,
// and the hook uses a Clanker-style 1%-5% fee band (no 80% anti-sniper spike).
const POOL_MANAGERS: Record<string, string> = {
  "base-sepolia": "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408",
  "base": "0x498581fF718922c3f8e6A244956aF099B2652b2b",
};
const USDC: Record<string, string> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};
const B20_FACTORY = "0xB20f000000000000000000000000000000000000";
// beforeInitialize (0x2000) + beforeSwap (0x80) + afterSwap (0x40)
// + beforeSwapReturnDelta (0x08) + afterSwapReturnDelta (0x04) = 0x20CC
const FLAGS = 0x20ccn;
const MASK = 0x3fffn;

async function waitCode(addr: string) {
  for (let i = 0; i < 40; i++) {
    if ((await ethers.provider.getCode(addr)) !== "0x") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("no code at " + addr);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const POOL_MANAGER = POOL_MANAGERS[network.name];
  if (!POOL_MANAGER) throw new Error("no PoolManager for network " + network.name);
  const isTestnet = network.name === "base-sepolia";

  // Sanity: the B20 factory precompile must exist on this network (Beryl).
  const b20Code = await ethers.provider.getCode(B20_FACTORY);
  console.log("B20 factory precompile present:", b20Code !== "0x" ? "code" : "precompile(no-code, ok)");

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("deployer:", deployer.address, "network:", network.name, "balance:", ethers.formatEther(bal), "ETH");

  const PLATFORM_TREASURY = deployer.address;
  const KAS_WALLET = deployer.address;
  const ORACLE_ADDRESS = process.env.MAINNET_ORACLE_ADDRESS || deployer.address;
  console.log("oracle role:", ORACLE_ADDRESS);

  // 1. Create2Factory + mine + deploy B20FeeHook
  console.log("\n── Create2Factory + B20FeeHook ──");
  const C2 = await ethers.getContractFactory("Create2Factory");
  const c2 = await C2.deploy(); await c2.waitForDeployment();
  const c2Addr = await c2.getAddress();
  const Hook = await ethers.getContractFactory("B20FeeHook");
  const initCode = ethers.concat([Hook.bytecode, Hook.interface.encodeDeploy([POOL_MANAGER, deployer.address])]);
  const initCodeHash = ethers.keccak256(initCode);
  let salt = 0n, hookAddr = "";
  for (;;) {
    const addr = ethers.getCreate2Address(c2Addr, ethers.toBeHex(salt, 32), initCodeHash);
    if ((BigInt(addr) & MASK) === FLAGS) { hookAddr = addr; break; }
    salt++;
  }
  await (await c2.deploy(ethers.toBeHex(salt, 32), initCode)).wait();
  await waitCode(hookAddr);
  console.log("B20FeeHook:", hookAddr, "salt:", salt.toString());

  // 2. No airdrop in B20factory. The launchpad/NFT still take an "airdropVault"
  // fee sink param, so route it to the platform treasury (no RecomVault/epoch system).
  const vaultAddr = PLATFORM_TREASURY;
  console.log("airdrop vault: DISABLED (fee sink -> treasury", vaultAddr + ")");

  // 3. B20 token factory
  const Factory = await ethers.getContractFactory("B20TokenFactory");
  const factory = await Factory.deploy(PLATFORM_TREASURY, vaultAddr, KAS_WALLET, POOL_MANAGER, hookAddr, USDC[network.name] || ethers.ZeroAddress); await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress(); console.log("B20TokenFactory:", factoryAddr);

  // 4. wire hook -> factory
  const hook = await ethers.getContractAt("B20FeeHook", hookAddr);
  await (await hook.setFactory(factoryAddr)).wait(); console.log("hook.setFactory done");

  // 5. NFT deployer
  const NFTDep = await ethers.getContractFactory("RecomNFTDeployer");
  const nftDep = await NFTDep.deploy(); await nftDep.waitForDeployment();
  const nftDepAddr = await nftDep.getAddress(); console.log("RecomNFTDeployer:", nftDepAddr);

  // 6. Launchpad
  const Launchpad = await ethers.getContractFactory("RecomLaunchpad");
  const launchpad = await Launchpad.deploy(PLATFORM_TREASURY, vaultAddr, KAS_WALLET, factoryAddr, nftDepAddr); await launchpad.waitForDeployment();
  const launchpadAddr = await launchpad.getAddress(); console.log("RecomLaunchpad:", launchpadAddr);

  await (await nftDep.setLaunchpad(launchpadAddr)).wait();
  console.log("RecomNFTDeployer.setLaunchpad ->", launchpadAddr);

  // 7. Swap router (kept for parity; B20FeeSplitter pays ETH so buyback unused)
  const Router = await ethers.getContractFactory("OriginSwapRouter");
  const router = await Router.deploy(POOL_MANAGER); await router.waitForDeployment();
  const routerAddr = await router.getAddress(); console.log("OriginSwapRouter:", routerAddr);
  await (await factory.setRouter(routerAddr)).wait();
  console.log("factory.setRouter ->", routerAddr);

  // 8. Report launch defaults baked into the factory
  console.log("launch defaults: vestBps", (await factory.vestBps()).toString(),
    "| vestReleaseBps", (await factory.vestReleaseBps()).toString(),
    "| vestPeriod(s)", (await factory.vestPeriod()).toString(),
    "| creatorFeeBps", (await factory.creatorFeeBps()).toString());

  const out = {
    project: "B20factory", network: network.name, chainId: isTestnet ? 84532 : 8453,
    b20FactoryPrecompile: B20_FACTORY,
    poolManager: POOL_MANAGER, feeHook: hookAddr, create2Factory: c2Addr, salt: salt.toString(),
    tokenFactory: factoryAddr, nftDeployer: nftDepAddr, launchpad: launchpadAddr,
    swapRouter: routerAddr, treasury: PLATFORM_TREASURY, deployer: deployer.address,
  };
  fs.writeFileSync(`deployment-b20-${network.name}.json`, JSON.stringify(out, null, 2));
  console.log("\n=== B20factory DEPLOYED ===\n" + JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
