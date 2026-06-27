import Link from "next/link";

const NAV = [
  ["overview", "overview"],
  ["b20", "the B20 standard"],
  ["launch", "launching a token"],
  ["fees", "dynamic fees"],
  ["supply", "supply & vesting"],
  ["splitter", "fee splitter"],
  ["terminal", "terminal commands"],
  ["safety", "why it's not a honeypot"],
];

export default function Docs() {
  return (
    <main className="wrap py-12 grid lg:grid-cols-[200px_1fr] gap-10">
      {/* side nav */}
      <aside className="hidden lg:block sticky top-20 self-start text-sm">
        <div className="text-muted uppercase text-xs tracking-wider mb-3">documentation</div>
        <ul className="space-y-1">
          {NAV.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-text/70 hover:text-beryl transition-colors">{label}</a>
            </li>
          ))}
        </ul>
      </aside>

      <article className="prose-term max-w-3xl">
        <h1>B20factory — docs</h1>
        <p className="text-muted">The terminal-native launchpad for native B20 tokens on Base Beryl.</p>

        <h2 id="overview">overview</h2>
        <p>
          B20factory launches <code>B20</code> tokens — Base's native token standard from
          the Beryl upgrade. Each launch produces a clean, admin-less token paired with a
          locked single-sided liquidity pool, so it is tradeable the moment it deploys.
        </p>
        <ul>
          <li>native B20 ASSET minted by the <code>0xB20f…</code> precompile</li>
          <li>no admin: not mintable, not pausable, not freezable</li>
          <li>supply capped at 1,000,000,000 and fully minted at creation</li>
          <li>single-sided V4 pool, liquidity locked forever</li>
          <li>volatility-based dynamic swap fee, 1%–5%</li>
        </ul>

        <h2 id="b20">the B20 standard</h2>
        <p>
          B20 token logic runs natively in the Base node as a Rust precompile rather than
          as EVM bytecode. It is a full superset of ERC-20 — every wallet, DEX, and tool
          works unchanged — while being cheaper and faster (Base targets ~50% cheaper
          transfers). B20factory deploys the <code>ASSET</code> variant.
        </p>
        <p>
          Because the token has <strong>no transfer tax</strong> and <strong>no mint
          authority</strong>, buy/sell simulators see a clean token — so it can be boosted
          and promoted without being flagged.
        </p>

        <h2 id="launch">launching a token</h2>
        <p>A launch is a free-mint collection that bonds and auto-deploys the token:</p>
        <ul>
          <li>set <code>name</code>, <code>symbol</code>, and a starting market cap (e.g. $10k)</li>
          <li>choose your fee band (base + max, each 1–5%)</li>
          <li>the bonding completes and the B20 token mints automatically</li>
          <li>100% of the trading slice is seeded single-sided into a locked pool</li>
        </ul>
        <pre><code>{`launch \\
  --name "Beryl Cat" --symbol BCAT \\
  --base 3 --max 5 \\
  --mc 10000`}</code></pre>

        <h2 id="fees">dynamic fees</h2>
        <p>
          The swap fee floats between a <code>base</code> and a <code>max</code> (both in
          1%–5%). In calm markets it sits at the base; when a swap moves price hard
          (volatility / snipers) it ramps toward the max, then settles back. Set
          <code>base == max</code> for a flat fee.
        </p>
        <ul>
          <li><code>--base-fee 1% --max-fee 5%</code> → dynamic 1→5%</li>
          <li><code>--base-fee 2% --max-fee 2%</code> → flat 2%</li>
          <li>worst case ever observable is the max (≤5%) — honeypot-safe</li>
        </ul>

        <h2 id="supply">supply & vesting</h2>
        <p>Total supply is 1,000,000,000, fully minted and capped at launch. The split:</p>
        <ul>
          <li><strong>80%</strong> → single-sided pool (locked forever)</li>
          <li><strong>20%</strong> → creator vesting, released 1% of supply per month (20 months)</li>
        </ul>
        <p>
          Vesting is claimable monthly by the creator only — no early release, no rug
          path. Platform-run launches can instead distribute the reserved slice directly
          to a prepared list of addresses at launch.
        </p>

        <h2 id="splitter">fee splitter</h2>
        <p>
          Swap fees are paid in native ETH to a per-token splitter and split between the
          creator and the platform (default <code>55% / 45%</code>). Anyone can call
          <code>distribute()</code> to flush the accrued fees.
        </p>

        <h2 id="terminal">terminal commands</h2>
        <pre><code>{`help                     list commands
balance                  wallet balance
launch [flags]           deploy a B20 token
fee --base --max         preview a fee band
clear                    clear screen`}</code></pre>

        <h2 id="safety">why it's not a honeypot</h2>
        <p>Detectors simulate a buy then a sell and flag high tax or failed sells. B20factory passes because:</p>
        <ul>
          <li>the B20 token has no transfer tax (clean ERC-20)</li>
          <li>no mint / pause / freeze authority exists</li>
          <li>the swap fee is capped at 5% — never read as a punitive tax</li>
          <li>liquidity is locked and the pool is single-sided but fully tradeable</li>
        </ul>

        <div className="mt-10 pt-6 border-t border-line text-sm">
          <Link href="/app" className="btn border-beryl/60 bg-beryl/15">launch a token →</Link>
        </div>
      </article>
    </main>
  );
}
