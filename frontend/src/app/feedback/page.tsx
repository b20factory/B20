"use client";
import { useState } from "react";

export default function Feedback() {
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <main className="wrap py-12 max-w-2xl">
      <h1 className="text-xl text-text mb-1">feedback</h1>
      <p className="text-sm text-muted mb-6">found a bug, want a feature, or just have thoughts? drop it here.</p>
      <div className="card">
        {sent ? (
          <div className="text-beryl-glow">✓ thanks — feedback received.</div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); if (msg.trim()) setSent(true); }}
            className="space-y-3"
          >
            <textarea className="input min-h-[140px] resize-y" placeholder="> type your feedback…" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <div className="flex items-center gap-3">
              <button className="btn border-beryl/60 bg-beryl/15" type="submit" disabled={!msg.trim()}>send</button>
              <a className="btn-ghost" href="https://x.com" target="_blank" rel="noreferrer">or reach us on X</a>
            </div>
          </form>
        )}
      </div>
      <p className="mt-4 text-[11px] text-muted">note: this is a local stub — wire it to your X / support inbox when ready.</p>
    </main>
  );
}
