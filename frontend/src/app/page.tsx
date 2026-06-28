import Link from "next/link";
import HeroTerminal from "@/components/HeroTerminal";
import Mascot from "@/components/Mascot";
import { IS_TESTNET } from "@/lib/contracts";

const STATS = [
  ["1B", "fixed supply"],
  ["0", "mint authority"],
  ["≤5%", "swap fee"],
  ["100%", "LP locked"],
];

const FEATURES = [
  { h: "native B20", p: "Minted by the Base Beryl 0xB20f… precompile — native, ERC-20 compatible, ~50% cheaper transfers." },
  { h: "admin-less + capped", p: "Launches with no admin: not mintable, not pausable, not freezable. Supply capped and fully minted at birth." },
  { h: "single-sided pool", p: "The trading slice is seeded single-sided into a locked V4 pool — instantly tradeable, liquidity locked forever." },
  { h: "dynamic fee 1–5%", p: "Volatility-based: sits at your base, ramps toward max only on volatility, capped at 5%. Auditor-clean." },
  { h: "fair vesting", p: "Public launches vest 20% to the creator, 1% a month over 20 months. No team bag dumped on day one." },
  { h: "no transfer tax", p: "B20 is a clean ERC-20. The only fee is the swap fee — so buy/sell simulators pass and you can boost." },
];

export default function Home() {
  return (
    <main className="wrap pb-24">
      {/* hero */}
      <section className="grid lg:grid-cols-2 gap-10 items-center pt-14 sm:pt-20">
        <div>
          <span className="chip-on mb-5">▸ launchpad · base beryl</span>
          <h1 className="text-4xl sm:text-[3.25rem] font-bold leading-[1.05] tracking-tight text-text">
            launch native <span className="gradient-text glow-text">B20</span> tokens
            <br /> like you write code.
          </h1>
          <p className="mt-5 text-text/65 max-w-md leading-relaxed">
            The terminal-native launchpad for Base. Deploy a clean, admin-less token with
            a locked single-sided pool — from the app form or a command line.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/app" className="btn-primary text-base px-5 py-2.5">launch a token</Link>
            <Link href="/app?mode=terminal" className="btn-ghost text-base px-5 py-2.5">open terminal</Link>
            <Link href="/docs" className="btn-ghost text-base px-5 py-2.5">docs</Link>
          </div>
          <div className="mt-8 grid grid-cols-4 gap-3 max-w-md">
            {STATS.map(([n, l]) => (
              <div key={l} className="border-l border-line pl-3">
                <div className="text-beryl text-lg font-semibold">{n}</div>
                <div className="text-[11px] text-muted leading-tight">{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-8 bg-beryl/10 blur-[60px] rounded-full pointer-events-none" />
          <div className="term overflow-hidden relative">
            <div className="term-bar">
              <span className="dot bg-bad/70" /><span className="dot bg-warn/70" /><span className="dot bg-beryl/70" />
              <span className="ml-2 text-xs text-muted">B20 · native asset</span>
              <span className="ml-auto text-[11px] text-beryl/70">● live</span>
            </div>
            <div className="relative flex items-end justify-center px-8 pt-16 pb-8 min-h-[340px] bg-gradient-to-b from-panel2 to-bg">
              <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(rgba(63,240,212,1)_1px,transparent_1px),linear-gradient(90deg,rgba(63,240,212,1)_1px,transparent_1px)] bg-[size:22px_22px]" />
              <div className="relative">
                <Mascot size={210} />
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-muted">meet <span className="text-beryl">Beryl</span>, your launch companion</p>
        </div>
      </section>

      {/* two surfaces */}
      <section className="mt-24 grid lg:grid-cols-[1fr_1.25fr] gap-8 items-center">
        <div>
          <div className="h-sec mb-3"><span className="text-beryl">two surfaces, one engine</span></div>
          <p className="text-text/65 leading-relaxed">
            Deploy from a clean <Link href="/app" className="link">app form</Link> with sliders and
            presets, or drop into the <Link href="/app?mode=terminal" className="link">terminal</Link> and
            launch with a single command. Same contracts, your choice of surface.
          </p>
          <pre className="prose-term mt-4"><code className="text-text/90">{`› launch --name "Beryl Cat" \\
    --symbol BCAT --base 3% --max 5%`}</code></pre>
        </div>
        <HeroTerminal />
      </section>

      {/* features */}
      <section className="mt-24">
        <div className="h-sec mb-6"><span className="text-beryl">what you get</span></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div key={f.h} className="card-hover group">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] text-beryl-dim">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-beryl group-hover:text-beryl-glow transition-colors">{f.h}</span>
              </div>
              <p className="text-sm text-text/65 leading-relaxed">{f.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* docs preview */}
      <section className="mt-24 term overflow-hidden">
        <div className="term-bar">
          <span className="dot bg-bad/70" /><span className="dot bg-warn/70" /><span className="dot bg-beryl/70" />
          <span className="ml-2 text-xs text-muted">docs / quickstart.md</span>
        </div>
        <div className="p-6 grid md:grid-cols-2 gap-8">
          <div className="prose-term">
            <h2 className="!mt-0">what is B20?</h2>
            <p>
              B20 is Base's native token standard, shipped in the Beryl upgrade. Token
              logic runs in the node as a Rust precompile — full ERC-20 compatibility,
              lower cost, higher throughput.
            </p>
            <p className="text-text/60">B20factory makes launching one a one-line operation.</p>
            <Link href="/docs" className="link text-sm">→ read the full docs</Link>
          </div>
          <pre className="text-[13px] self-center w-full"><code>{`# launch from the terminal
launch \\
  --name "Beryl Cat" \\
  --symbol BCAT \\
  --base 3 --max 5 \\
  --mc 10000

✓ token   0xb200…  native B20
✓ pool    single-sided · locked
✓ admin   none · supply capped`}</code></pre>
        </div>
      </section>

      <footer className="mt-24 pt-8 hairline flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <Mascot size={22} talk={false} />
        <span className="text-beryl font-semibold">B20factory</span>
        <span className="text-muted/70">native launchpad · base beryl</span>
        <Link className="link" href="/explore">explore</Link>
        <Link className="link" href="/docs">docs</Link>
        <Link className="link" href="/app">launch</Link>
        <a className="link" href="https://x.com/B20Factory_" target="_blank" rel="noreferrer">X</a>
        <a className="link" href="https://github.com/b20factory/B20" target="_blank" rel="noreferrer">github</a>
        <Link className="link" href="/feedback">feedback</Link>
        <span className={`ml-auto chip ${IS_TESTNET ? "border-warn/30 text-warn/80" : "border-beryl/30 text-beryl/80"}`}>{IS_TESTNET ? "base sepolia · testnet" : "base · mainnet"}</span>
      </footer>
    </main>
  );
}
