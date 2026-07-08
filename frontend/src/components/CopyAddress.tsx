"use client";
import { useState } from "react";

// A contract address that is both copyable (click the address to copy the full
// value) and linked to its block explorer (the "Verified" chip opens it).
export default function CopyAddress({ addr, explorer }: { addr: string; explorer: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${addr.slice(0, 10)}…${addr.slice(-6)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(addr);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = addr; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        title={`Copy ${addr}`}
        className="font-mono text-[12px] text-muted hover:text-text transition-colors inline-flex items-center gap-1"
      >
        {short}
        {copied ? (
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-beryl"><path d="M20 6 9 17l-5-5" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        )}
      </button>
      <a href={`${explorer}${addr}`} target="_blank" rel="noreferrer" className="chip text-[11px] py-1 px-2.5 border-beryl/30 text-beryl inline-flex items-center gap-1 shrink-0">
        Verified ↗
      </a>
    </span>
  );
}
