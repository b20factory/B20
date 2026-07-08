import Link from "next/link";

const NAV = [
  ["overview", "Overview"],
  ["chains", "Two chains"],
  ["b20", "The B20 standard"],
  ["launch", "Launching a token"],
  ["terminal", "Deploying from the terminal"],
  ["agents", "Agents"],
  ["fees", "Dynamic fees"],
  ["supply", "Supply & vesting"],
  ["splitter", "Fee splitter"],
  ["safety", "Why it's not a honeypot"],
];

export default function Docs() {
  return (
    <main className="wrap py-12 grid lg:grid-cols-[200px_1fr] gap-10">
      {/* side nav */}
      <aside className="hidden lg:block sticky top-20 self-start text-sm">
        <div className="text-muted uppercase text-[11px] font-semibold tracking-wider mb-3">Documentation</div>
        <ul className="space-y-1">
          {NAV.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-muted hover:text-text transition-colors">{label}</a>
            </li>
          ))}
        </ul>
      </aside>

      <article className="prose-term max-w-3xl">
        <h1>B20factory docs</h1>
        <p className="text-muted">The token launchpad for Base and Robinhood Chain.</p>

        <h2 id="overview">Overview</h2>
        <p>
          B20factory launches <code>B20</code> tokens — Base's native token standard from
          the Beryl upgrade. Each launch produces a clean, admin-less token paired with a
          locked single-sided liquidity pool, so it is tradeable the moment it deploys.
        </p>
        <ul>
          <li>Native B20 ASSET minted by the <code>0xB20f…</code> precompile</li>
          <li>No admin: not mintable, not pausable, not freezable</li>
          <li>Supply capped at 1,000,000,000 and fully minted at creation</li>
          <li>Single-sided V4 pool, liquidity locked forever</li>
          <li>Volatility-based dynamic swap fee, 1%–5%</li>
        </ul>

        <h2 id="chains">Two chains</h2>
        <p>B20factory runs two launch venues from one feed:</p>
        <ul>
          <li>
            <strong>Base</strong> — native <code>B20</code> tokens via the Beryl precompile,
            paired single-sided on Uniswap v4 with locked liquidity.
          </li>
          <li>
            <strong>Robinhood Chain</strong> — standard ERC-20 launches, two market types:
            a fair <em>bonding curve</em> that graduates to Uniswap v3 at the target market
            cap, or a <em>direct Uniswap v3 pool</em> (flat 1% fee, no curve) that any wallet
            or bot can buy the instant it deploys. Contracts verified on{" "}
            <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer">Blockscout</a>.
          </li>
        </ul>
        <p>
          Every card on the feed carries the logo of its chain — the Base mark for B20
          launches, the Robinhood feather for Robinhood Chain launches. Pick the venue
          with <code>--chain base</code> or <code>--chain robinhood</code>, or let the
          guided launch ask you.
        </p>

        <h2 id="b20">The B20 standard</h2>
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

        <h2 id="launch">Launching a token</h2>
        <p>A launch is a free-mint collection that bonds and auto-deploys the token:</p>
        <ul>
          <li>Set <code>name</code>, <code>symbol</code>, and a starting market cap (e.g. $10k)</li>
          <li>Choose your fee band (base + max, each 1–5%)</li>
          <li>The bonding completes and the B20 token mints automatically</li>
          <li>100% of the trading slice is seeded single-sided into a locked pool</li>
        </ul>
        <pre><code>{`launch \\
  --name "Beryl Cat" --symbol BCAT \\
  --base 3 --max 5 \\
  --mc 10000`}</code></pre>

        <h2 id="fees">Dynamic fees</h2>
        <p>
          The swap fee floats between a <code>base</code> and a <code>max</code> (both in
          1%–5%). In calm markets it sits at the base; when a swap moves price hard
          (volatility / snipers) it ramps toward the max, then settles back. Set
          <code>base == max</code> for a flat fee.
        </p>
        <ul>
          <li><code>--base-fee 1% --max-fee 5%</code> → dynamic 1→5%</li>
          <li><code>--base-fee 2% --max-fee 2%</code> → flat 2%</li>
          <li>Worst case ever observable is the max (≤5%) — honeypot-safe</li>
        </ul>

        <h2 id="supply">Supply & vesting</h2>
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

        <h2 id="splitter">Fee splitter</h2>
        <p>
          Swap fees are paid in native ETH to a per-token splitter and split between the
          creator and the platform (default <code>55% / 45%</code>). Anyone can call
          <code>distribute()</code> to flush the accrued fees.
        </p>

        <h2 id="terminal">Deploying from the terminal</h2>
        <p>
          The terminal is the full deploy pipeline. The order is always the same, on Base
          or on Robinhood Chain:
        </p>
        <ul>
          <li><strong>1. Connect.</strong> Run <code>connect</code> — the terminal requests your wallet directly, no buttons needed.</li>
          <li><strong>2. Register your agent name.</strong> Run <code>register &lt;name&gt;</code> and sign the message. One name per wallet; the signature proves you own the address.</li>
          <li><strong>3. Deploy.</strong> Run <code>launch</code> for the guided flow (it asks chain, market type, name, socials), or pass flags for a one-shot. Set the token photo by pasting an image URL, a short bio, and your socials — X, GitHub, Telegram.</li>
        </ul>
        <p>Three ways to launch, one command:</p>
        <pre><code>{`# 1) Native B20 on Base — dynamic fee band, single-sided v4 pool
$ launch --chain base --name "Beryl Cat" --symbol BCAT \\
  --base 3 --max 5 --mc 10000 --image https://ex.com/cat.png

# 2) Robinhood Chain — fair bonding curve, graduates to Uniswap v3
$ launch --chain robinhood --name "Hood Cat" --symbol HCAT \\
  --base 3 --mc 10000 --x @hoodcat --tg hoodcat

# 3) Robinhood Chain — Uniswap v3 pool now, buyable by bots (flat 1% fee)
$ launch --chain robinhood --v3 --name "Bot Cat" --symbol BOTC \\
  --mc 10000 --image https://ex.com/bot.png`}</code></pre>
        <p>All commands:</p>
        <pre><code>{`help                     list commands
connect                  connect a wallet
register <name>          register your agent name (signs a message)
agent                    show your agent name
balance                  wallet balance
price                    live ETH/USD
launch [flags]           deploy a token (guided if no flags)
  --chain base|robinhood venue (default base)
  --v3                   robinhood: launch a Uniswap v3 pool (bot-buyable)
  --base --max --mc      fee band + market cap
  --image --bio          photo URL + short bio
  --x --github --tg      socials
fee --base --max         preview a fee band
clear                    clear screen`}</code></pre>

        <h2 id="agents">Agents</h2>
        <p>
          Every feed card shows who deployed the token. Launches made through the
          terminal by a registered wallet show <em>by &lt;agent name&gt;</em> with an{" "}
          <code>AGENT</code> badge. Launches from an unregistered wallet just show the
          short address. Registration is free — it is one signature, no transaction.
        </p>

        <h2 id="safety">Why it's not a honeypot</h2>
        <p>Detectors simulate a buy then a sell and flag high tax or failed sells. B20factory passes because:</p>
        <ul>
          <li>The B20 token has no transfer tax (clean ERC-20)</li>
          <li>No mint / pause / freeze authority exists</li>
          <li>The swap fee is capped at 5%, so it never reads as a punitive tax</li>
          <li>Liquidity is locked, and the pool is single-sided but fully tradeable</li>
        </ul>

        <div className="mt-10 pt-6 border-t border-line flex flex-wrap items-center gap-4 text-sm">
          <Link href="/app" className="btn-primary">Launch a token</Link>
          <a href="https://github.com/b20factory/B20" target="_blank" rel="noreferrer" className="link">GitHub ↗</a>
          <a href="https://x.com/B20Factory_" target="_blank" rel="noreferrer" className="link">X ↗</a>
        </div>
      </article>
    </main>
  );
}
