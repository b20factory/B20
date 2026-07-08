import Link from "next/link";
import HeroTerminal from "@/components/HeroTerminal";
import Mascot from "@/components/Mascot";
import Reveal from "@/components/Reveal";
import { IS_TESTNET } from "@/lib/contracts";
import { BaseLogo, RobinhoodLogo } from "@/components/ChainLogo";

const STATS: [string, string][] = [
  ["1B", "Fixed supply"],
  ["0", "Admin keys"],
  ["≤5%", "Swap fee cap"],
  ["100%", "Liquidity locked"],
];

const FEATURES = [
  { h: "Native B20", p: "Minted by the Base Beryl 0xB20f… precompile. Fully ERC-20 compatible, with roughly 50% cheaper transfers." },
  { h: "Admin-less and capped", p: "Every launch ships with no admin: not mintable, not pausable, not freezable. Supply is capped and fully minted at birth." },
  { h: "Single-sided pool", p: "The trading slice is seeded single-sided into a locked V4 pool. Instantly tradeable, liquidity locked forever." },
  { h: "Dynamic fee, 1–5%", p: "The fee sits at your base rate and ramps toward your max only under volatility. Hard-capped at 5%, auditor-clean." },
  { h: "Fair vesting", p: "Public launches vest 20% to the creator at 1% of supply per month over 20 months. No team bag dumped on day one." },
  { h: "No transfer tax", p: "B20 is a clean ERC-20. The only fee is the swap fee, so buy/sell simulators pass and your token can be promoted." },
];

export default function Home() {
  return (
    <main className="wrap pb-24 relative">
      <div aria-hidden className="hero-glow" />
      {/* hero */}
      <section className="grid lg:grid-cols-2 gap-12 items-center pt-16 sm:pt-24">
        <div className="animate-fade-up">
          <span className="chip-on mb-6">Launchpad · B20 + Robinhood Chain</span>
          <h1 className="text-4xl sm:text-[3.4rem] font-semibold leading-[1.06] tracking-tight text-text">
            Launch <span className="text-brand">B20</span> tokens across two chains.
          </h1>
          <p className="mt-5 text-muted max-w-md text-lg leading-relaxed">
            Deploy a clean, admin-less token from a simple form or the command line —
            native B20, or a fair bonding curve on Robinhood Chain.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5"><BaseLogo size={14} /> Native B20</span>
            <span className="inline-flex items-center gap-1.5"><RobinhoodLogo size={14} /> Bonding curve · Robinhood Chain</span>
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/app" className="btn-primary text-base px-6 py-3">Launch a token</Link>
            <Link href="/app?mode=terminal" className="btn text-base px-6 py-3">Open terminal</Link>
          </div>
        </div>

        <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <HeroTerminal />
          <p className="mt-3 text-center text-xs text-muted">A live look at a launch from the terminal.</p>
        </div>
      </section>

      {/* guarantees strip — the term sheet */}
      <Reveal className="mt-16">
        <div className="term grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-line overflow-hidden">
          {STATS.map(([n, l], i) => (
            <div key={l} className={`px-5 sm:px-6 py-4 sm:py-5 border-line ${i % 2 === 1 ? "max-sm:border-l" : ""} ${i >= 2 ? "max-sm:border-t" : ""}`}>
              <div className="text-xl sm:text-2xl font-semibold tracking-tight text-text tabular">{n}</div>
              <div className="text-[13px] text-muted mt-0.5">{l}</div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* features */}
      <section className="mt-24">
        <Reveal>
          <p className="h-sec mb-2">What you get</p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text mb-8">Built to pass every check.</h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.h} delay={(i % 3) * 80}>
              <div className="card-hover h-full">
                <h3 className="font-semibold text-text mb-1.5">{f.h}</h3>
                <p className="text-sm text-muted leading-relaxed">{f.p}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* two chains */}
      <section className="mt-24">
        <Reveal>
          <p className="h-sec mb-2">Two chains, one launchpad</p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text mb-8">Pick where your token lives.</h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 gap-4">
          <Reveal>
            <div className="card-hover h-full">
              <div className="flex items-center gap-2 mb-2">
                <BaseLogo size={18} />
                <h3 className="font-semibold text-text">B20</h3>
                <span className="chip text-[10px] px-1.5 py-0 border-beryl/25 text-beryl/80">Native B20</span>
              </div>
              <p className="text-sm text-muted leading-relaxed">
                The 0xB20f… precompile mints a native B20 — admin-less, supply-capped, no transfer tax.
                Seeded single-sided into a locked Uniswap v4 pool, tradeable the moment it deploys.
              </p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="card-hover h-full">
              <div className="flex items-center gap-2 mb-2">
                <RobinhoodLogo size={18} />
                <h3 className="font-semibold text-text">Robinhood Chain</h3>
                <span className="chip text-[10px] px-1.5 py-0 border-[#00C805]/30 text-[#00C805]">Bonding curve</span>
              </div>
              <p className="text-sm text-muted leading-relaxed">
                A fair bonding curve where price rises with every buy. When it hits the graduation cap,
                liquidity migrates to Uniswap v3. Contracts verified on Blockscout.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* two surfaces + mascot */}
      <section className="mt-24 grid lg:grid-cols-[1fr_1.15fr] gap-10 items-center">
        <Reveal>
          <div className="term p-8 flex items-end justify-center bg-gradient-to-b from-panel to-panel2/70 min-h-[300px]">
            <Mascot size={200} />
          </div>
          <p className="mt-3 text-center text-xs text-muted">Beryl, your launch companion.</p>
        </Reveal>
        <Reveal delay={100}>
          <p className="h-sec mb-2">Two surfaces, one engine</p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text mb-4">
            Point and click, or type one command.
          </h2>
          <p className="text-muted leading-relaxed max-w-lg">
            Configure your launch in a clean <Link href="/app" className="link">form</Link> with
            presets and live pricing, or open the <Link href="/app?mode=terminal" className="link">terminal</Link> and
            deploy in one line. Both go through the same audited contracts.
          </p>
          <pre className="mt-5 rounded-xl bg-con-bg text-con-text p-4 text-[13px] leading-6 font-mono overflow-x-auto shadow-card max-w-lg"><code><span className="text-con-accent">$</span>{` launch --name "Beryl Cat" --symbol BCAT --base 3 --max 5`}</code></pre>
        </Reveal>
      </section>

      {/* docs teaser */}
      <Reveal className="mt-24">
        <div className="term p-8 sm:p-10 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="h-sec mb-2">The standard</p>
            <h2 className="text-2xl font-semibold tracking-tight text-text mb-3">What is B20?</h2>
            <p className="text-muted leading-relaxed mb-3">
              B20 is Base&apos;s native token standard, shipped in the Beryl upgrade. Token
              logic runs in the node as a Rust precompile — full ERC-20 compatibility at a
              lower cost and higher throughput.
            </p>
            <p className="text-muted leading-relaxed mb-5">B20factory turns launching one into a single transaction.</p>
            <Link href="/docs" className="btn">Read the docs</Link>
          </div>
          <pre className="rounded-xl bg-con-bg text-con-text p-5 text-[13px] leading-6 font-mono overflow-x-auto shadow-card"><code>{`# launch from the terminal
launch \\
  --name "Beryl Cat" \\
  --symbol BCAT \\
  --base 3 --max 5 \\
  --mc 10000
`}<span className="text-con-ok">{`
✓ token   0xb200…  native B20
✓ pool    single-sided · locked
✓ admin   none · supply capped`}</span></code></pre>
        </div>
      </Reveal>

      <footer className="mt-24 pt-8 hairline flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted">
        <span className="flex items-center gap-2">
          <Mascot size={22} talk={false} />
          <span className="font-semibold text-text">B20factory</span>
        </span>
        <Link className="hover:text-text transition-colors" href="/explore">Explore</Link>
        <Link className="hover:text-text transition-colors" href="/docs">Docs</Link>
        <Link className="hover:text-text transition-colors" href="/app">Launch</Link>
        <a className="hover:text-text transition-colors" href="https://x.com/B20Factory_" target="_blank" rel="noreferrer">X</a>
        <a className="hover:text-text transition-colors" href="https://github.com/b20factory/B20" target="_blank" rel="noreferrer">GitHub</a>
        <Link className="hover:text-text transition-colors" href="/feedback">Feedback</Link>
        <span className="ml-auto flex items-center gap-2">
          <span className={`chip inline-flex items-center gap-1 ${IS_TESTNET ? "border-warn/30 text-warn" : "border-beryl/25 text-beryl"}`}>
            <BaseLogo size={11} />{IS_TESTNET ? "B20 · testnet" : "B20 · mainnet"}
          </span>
          <span className="chip inline-flex items-center gap-1 border-[#00C805]/30 text-[#00C805]">
            <RobinhoodLogo size={11} />Robinhood · live
          </span>
        </span>
      </footer>
    </main>
  );
}
