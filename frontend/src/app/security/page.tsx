import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "Security | B20factory" },
  description:
    "Every B20factory contract is verified on-chain and reviewed with Slither plus a manual audit. Verification links per contract.",
};

const RH = "https://robinhoodchain.blockscout.com/address/";
const BASE = "https://sepolia.basescan.org/address/";

type Row = { name: string; note: string; addr: string; base: string };

const robinhood: Row[] = [
  { name: "PrimehodFactory (launchpad)", note: "deploys every Robinhood launch", addr: "0xDD32C1B72442Dea7691485C95CFe769fbA34f8Ad", base: RH },
];

// A concrete, fully-verified launch of each Robinhood market type.
const rhExamples: { title: string; rows: Row[] }[] = [
  {
    title: "Example — Bot Cat (BOTC), Uniswap v3 pool",
    rows: [
      { name: "Token (ERC-20)", note: "fully minted, no admin", addr: "0x697220D7ef4B35e30B8378B0C3D825E96287C08E", base: RH },
      { name: "V3 LP Locker", note: "holds the pool LP, no withdraw path", addr: "0xe685deaFE6770c6058e3Bb3a8769616E07a8f709", base: RH },
      { name: "Vesting", note: "creator slice, on schedule only", addr: "0x6891DCe2374a934aE571503335E8a373eD488342", base: RH },
    ],
  },
  {
    title: "Example — Beryl Hood (BHOOD), bonding curve",
    rows: [
      { name: "Token (ERC-20)", note: "fully minted, no admin", addr: "0x43608F3288b6B9F5B090B1A5bA07d35536b94667", base: RH },
      { name: "Bonding Curve", note: "holds ETH liquidity, no admin path", addr: "0x29498D80a265E6d037Dd74f4150C254004bbe74c", base: RH },
      { name: "Vesting", note: "creator slice, on schedule only", addr: "0x386213a87e0D7dc87Ff931710E3804396eF4B197", base: RH },
    ],
  },
];

const b20: Row[] = [
  { name: "Launchpad", note: "collection + bonding entrypoint", addr: "0x0e56e3e9C0C6209F10AdE0A3DED1daf252B7b309", base: BASE },
  { name: "Token Factory", note: "mints the native B20 + seeds the pool", addr: "0x35deBD09cA16f264DC37506C4A58a5b85AD9fD16", base: BASE },
  { name: "Fee Hook", note: "dynamic 1–5% swap fee, capped", addr: "0x0783bB68D3a3e4C2f061Da49669EC01f28cEE0CC", base: BASE },
  { name: "Swap Router", note: "buy / sell routing", addr: "0x7960d31705394094a4667ee3dB203455Ce7a1e7E", base: BASE },
];

const properties = [
  ["Liquidity locked", "The v3 LP NFT sits in a locker with no function that moves it or removes liquidity. The curve holds its ETH with no owner path to withdraw. On B20, the pool is single-sided and locked."],
  ["No admin keys", "Launched tokens are fully minted at birth: no mint, pause, freeze, blacklist, or upgrade. Nobody can seize or dilute holder balances."],
  ["Fees can’t brick", "Fees accrue and are pulled by immutable creator / platform recipients. Failed pushes park as claimable balances; buybacks fall back to ETH. distribute()/collect() are permissionless."],
  ["Fee is bounded", "Curve fee is hard-capped at 5% and can never read as a punitive tax; the v3 venue is a flat 1% pool fee. No hidden transfer tax."],
  ["Reentrancy-guarded", "Every state-changing entrypoint follows checks-effects-interactions and carries a reentrancy guard; ETH always moves last."],
];

function Table({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[520px] text-left text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.addr} className="border-b border-line last:border-b-0">
              <td className="px-4 py-3">
                <div className="font-medium text-text">{r.name}</div>
                <div className="text-[12px] text-muted">{r.note}</div>
              </td>
              <td className="px-4 py-3 font-mono text-[12px] text-muted">{r.addr.slice(0, 10)}…{r.addr.slice(-6)}</td>
              <td className="px-4 py-3 text-right">
                <a href={`${r.base}${r.addr}`} target="_blank" rel="noreferrer" className="chip text-[11px] py-1 px-2.5 border-beryl/30 text-beryl inline-flex items-center gap-1">
                  Verified ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Security() {
  return (
    <main className="wrap py-12 max-w-3xl">
      <p className="h-sec mb-2">Security</p>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">Verified and reviewed</h1>
      <p className="mt-3 text-muted leading-relaxed">
        Every B20factory contract is source-verified on its chain’s explorer and reviewed with{" "}
        <span className="text-text">Slither</span> static analysis plus a manual pass. The properties below
        are enforced by the contracts, not by trust.
      </p>

      {/* properties */}
      <div className="mt-8 grid sm:grid-cols-2 gap-3">
        {properties.map(([h, p]) => (
          <div key={h} className="card-hover">
            <h3 className="font-semibold text-text mb-1.5">{h}</h3>
            <p className="text-sm text-muted leading-relaxed">{p}</p>
          </div>
        ))}
      </div>

      {/* audit summary */}
      <div className="mt-8 term p-6">
        <h2 className="text-lg font-semibold text-text mb-2">Audit summary</h2>
        <p className="text-sm text-muted leading-relaxed">
          Both contract sets — the native B20 stack on Base and the Primehod-style stack on Robinhood
          Chain (factory, tokens, bonding curve, v3 pool locker, vesting) — were run through Slither and
          reviewed by hand. No critical or high-severity issue exists in the project’s own code. The only
          high-severity static hits are in the vendored, independently-audited Uniswap libraries, or are
          by-design ETH transfers to immutable recipients; all are triaged benign and documented.
        </p>
        <div className="mt-4">
          <a href="https://github.com/b20factory/B20" target="_blank" rel="noreferrer" className="btn text-sm">Source on GitHub ↗</a>
        </div>
      </div>

      {/* Robinhood */}
      <h2 className="mt-10 text-xl font-semibold tracking-tight text-text">Robinhood Chain</h2>
      <p className="text-sm text-muted mt-1 mb-4">Verified on Blockscout · mainnet · live.</p>
      <Table rows={robinhood} />
      {rhExamples.map((ex) => (
        <div key={ex.title} className="mt-4">
          <p className="text-sm font-medium text-text mb-2">{ex.title}</p>
          <Table rows={ex.rows} />
        </div>
      ))}
      <p className="text-[12px] text-muted mt-3">
        Every token launched on Robinhood — with its curve or v3 locker and its vesting — is verified the
        same way automatically. The two above are live examples.
      </p>

      {/* B20 on Base */}
      <h2 className="mt-10 text-xl font-semibold tracking-tight text-text">B20 on Base</h2>
      <p className="text-sm text-muted mt-1 mb-4">Base Sepolia · testnet. The mainnet stack is verified on Basescan at launch.</p>
      <Table rows={b20} />

      <div className="mt-10 hairline pt-6 flex flex-wrap gap-4 text-sm">
        <Link href="/explore" className="link">Explore the feed</Link>
        <Link href="/docs" className="link">Read the docs</Link>
        <Link href="/app" className="link">Launch a token</Link>
      </div>
    </main>
  );
}
