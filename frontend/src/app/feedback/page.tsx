"use client";
import { useState } from "react";

export default function Feedback() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [contact, setContact] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!msg.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg.trim(), contact: contact.trim() }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "failed");
      setSent(true);
    } catch (e: any) {
      setErr(e?.message === "slow down" ? "too many messages, give it a minute." : "could not send, try again or reach us on X.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap py-12 max-w-2xl">
      <h1 className="text-xl text-text mb-1">feedback</h1>
      <p className="text-sm text-muted mb-6">found a bug, want a feature, or just have thoughts? drop it here.</p>
      <div className="card">
        {sent ? (
          <div className="text-beryl-glow">✓ thanks — feedback received.</div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <textarea className="input min-h-[140px] resize-y" placeholder="> type your feedback…" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <input className="input" placeholder="x handle or email (optional, so we can reply)" value={contact} onChange={(e) => setContact(e.target.value)} />
            {err && <div className="text-bad text-sm">{err}</div>}
            <div className="flex items-center gap-3">
              <button className="btn border-beryl/60 bg-beryl/15" type="submit" disabled={!msg.trim() || busy}>{busy ? "sending…" : "send"}</button>
              <a className="btn-ghost" href="https://x.com/B20Factory_" target="_blank" rel="noreferrer">or reach us on X</a>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
