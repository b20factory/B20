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
      setErr(e?.message === "slow down" ? "Too many messages — give it a minute." : "Could not send. Try again, or reach us on X.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap py-12 max-w-2xl">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text mb-1.5">Feedback</h1>
      <p className="text-sm text-muted mb-6">Found a bug, want a feature, or just have thoughts? Drop it here.</p>
      <div className="card">
        {sent ? (
          <div className="text-beryl-glow font-medium">Thanks — feedback received.</div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <textarea className="input min-h-[140px] resize-y" placeholder="Type your feedback…" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <input className="input" placeholder="X handle or email (optional, so we can reply)" value={contact} onChange={(e) => setContact(e.target.value)} />
            {err && <div className="text-bad text-sm">{err}</div>}
            <div className="flex items-center gap-3">
              <button className="btn-primary" type="submit" disabled={!msg.trim() || busy}>{busy ? "Sending…" : "Send feedback"}</button>
              <a className="btn-ghost" href="https://x.com/B20Factory_" target="_blank" rel="noreferrer">Or reach us on X</a>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
