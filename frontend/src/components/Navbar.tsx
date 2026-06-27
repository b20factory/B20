"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";
import { useEffect, useRef, useState } from "react";
import { IS_TESTNET } from "@/lib/ui";
import Mascot from "@/components/Mascot";

function short(a?: string) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; }

export default function Navbar() {
  const path = usePathname();
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address });
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const link = (href: string, label: string) => {
    const active = href === "/app" ? path === "/app" : path.startsWith(href) && href !== "/";
    return (
      <Link href={href} className={`px-2.5 py-1 rounded text-sm transition-colors ${active ? "text-beryl" : "text-text/60 hover:text-beryl"}`}>
        {label}
      </Link>
    );
  };

  const balText = bal ? `${Number(bal.formatted).toFixed(3)} ${bal.symbol}` : "0.000";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="wrap flex items-center gap-2 h-14">
        <Link href="/" className="flex items-center gap-1.5 group shrink-0">
          <span className="shrink-0 -my-2"><Mascot size={24} talk={false} /></span>
          <span className="text-beryl font-bold tracking-tight glow-text">B20</span>
          <span className="text-text/85 group-hover:text-text transition-colors">factory</span>
          <span className="cursor ml-0.5" />
        </Link>
        {IS_TESTNET && <span className="hidden sm:inline-flex chip border-warn/40 text-warn ml-1">testnet</span>}

        <nav className="hidden md:flex items-center gap-0.5 ml-3">
          {link("/explore", "explore")}
          {link("/explore", "trade")}
          {link("/docs", "docs")}
          {link("/app", "launch")}
          {link("/app?mode=terminal", "terminal")}
          {link("/app/tokens", "creator")}
          {link("/feedback", "feedback")}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isConnected && (
            <span className="hidden sm:inline-flex chip border-line text-text/80" title="Wallet balance">
              <span className="w-1.5 h-1.5 rounded-full bg-beryl animate-flicker" /> {balText}
            </span>
          )}

          <div className="relative" ref={ref}>
            {isConnected ? (
              <button className="btn-ghost font-medium" onClick={() => disconnect()} title="Disconnect">{short(address)}</button>
            ) : (
              <>
                <button className="btn" onClick={() => setOpen((o) => !o)}>connect</button>
                {open && (
                  <div className="absolute right-0 mt-2 w-48 term p-1 z-40">
                    <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted">connect wallet</div>
                    {connectors.map((c) => (
                      <button key={c.uid} className="w-full text-left px-3 py-2 text-sm text-text/80 hover:text-beryl hover:bg-beryl/5 rounded transition-colors"
                        onClick={() => { connect({ connector: c }); setOpen(false); }}>
                        {c.name === "Injected" ? "Browser Wallet" : c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <Link href="/app" className="btn-primary">launch</Link>
        </div>
      </div>
    </header>
  );
}
