"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";
import { Suspense, useEffect, useRef, useState } from "react";
import { IS_TESTNET } from "@/lib/ui";

function short(a?: string) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; }

const LINKS: [string, string][] = [
  ["/explore", "Explore"],
  ["/swap", "Swap"],
  ["/docs", "Docs"],
  ["/app", "Launch"],
  ["/app?mode=terminal", "Terminal"],
  ["/app/tokens", "Creator"],
];

function NavInner() {
  const path = usePathname();
  const sp = useSearchParams();
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address });
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);       // connect dropdown
  const [menu, setMenu] = useState(false);       // mobile menu
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  // close the mobile menu on navigation
  useEffect(() => { setMenu(false); }, [path, sp]);

  const isActive = (href: string) => {
    const isTerminal = sp.get("mode") === "terminal";
    if (href === "/app") return path === "/app" && !isTerminal;
    if (href === "/app?mode=terminal") return path === "/app" && isTerminal;
    return path.startsWith(href) && href !== "/";
  };

  const link = (href: string, label: string, mobile = false) => (
    <Link key={href} href={href}
      className={mobile
        ? `block px-4 py-3 rounded-xl text-[15px] transition-colors ${isActive(href) ? "bg-panel2 text-text font-medium" : "text-muted"}`
        : `px-3 py-1.5 rounded-lg text-sm transition-colors ${isActive(href) ? "text-text bg-panel2 font-medium" : "text-muted hover:text-text"}`}>
      {label}
    </Link>
  );

  const balText = bal ? `${Number(bal.formatted).toFixed(3)} ${bal.symbol}` : "0.000";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="wrap flex items-center gap-2 h-16">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="B20" width={26} height={26} className="rounded-md shrink-0" />
          <span className="font-semibold tracking-tight text-text text-[17px]">
            <span className="text-brand">B20</span>factory
          </span>
        </Link>
        {IS_TESTNET && <span className="hidden sm:inline-flex chip border-warn/30 text-warn ml-1">Base testnet</span>}

        <nav className="hidden md:flex items-center gap-0.5 ml-6">
          {LINKS.map(([h, l]) => link(h, l))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isConnected && (
            <span className="hidden sm:inline-flex chip tabular font-mono" title="Wallet balance">{balText}</span>
          )}

          <div className="relative" ref={ref}>
            {isConnected ? (
              <button className="btn font-mono text-[13px]" onClick={() => disconnect()} title="Disconnect">{short(address)}</button>
            ) : (
              <>
                <button className="btn" onClick={() => setOpen((o) => !o)}>Connect</button>
                {open && (
                  <div className="absolute right-0 mt-2 w-52 term p-1.5 z-40 animate-fade-up">
                    <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted">Connect wallet</div>
                    {connectors.map((c) => (
                      <button key={c.uid}
                        className="w-full text-left px-3 py-2 text-sm text-text rounded-lg hover:bg-panel2 transition-colors"
                        onClick={() => { connect({ connector: c }); setOpen(false); }}>
                        {c.name === "Injected" ? "Browser wallet" : c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <Link href="/app" className="btn-primary hidden sm:inline-flex">Launch</Link>

          {/* mobile menu toggle */}
          <button className="md:hidden btn !px-2.5" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menu ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* mobile menu panel */}
      {menu && (
        <nav className="md:hidden border-t border-line bg-bg px-3 py-3 space-y-0.5 animate-fade-up">
          {LINKS.map(([h, l]) => link(h, l, true))}
          {link("/feedback", "Feedback", true)}
          <div className="pt-2 px-1 flex items-center gap-2">
            <Link href="/app" className="btn-primary flex-1">Launch a token</Link>
            {IS_TESTNET && <span className="chip border-warn/30 text-warn">Base testnet</span>}
          </div>
        </nav>
      )}
    </header>
  );
}

export default function Navbar() {
  return (
    <Suspense fallback={<header className="sticky top-0 z-30 border-b border-line bg-bg/90 h-16" />}>
      <NavInner />
    </Suspense>
  );
}
