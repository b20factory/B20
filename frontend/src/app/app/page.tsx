"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import LaunchForm from "@/components/LaunchForm";
import DeployTerminal from "@/components/DeployTerminal";
import { IS_TESTNET } from "@/lib/contracts";

function AppInner() {
  const sp = useSearchParams();
  const [mode, setMode] = useState<"app" | "terminal">(sp.get("mode") === "terminal" ? "terminal" : "app");

  const tab = (id: "app" | "terminal", label: string) => (
    <button
      onClick={() => setMode(id)}
      className={`px-3.5 py-1.5 rounded-md text-sm transition-colors ${mode === id ? "bg-beryl/15 text-beryl-glow" : "text-text/55 hover:text-beryl"}`}
    >
      {label}
    </button>
  );

  return (
    <main className="wrap py-10">
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <h1 className="text-2xl text-text">launch a token</h1>
          <p className="text-sm text-muted mt-1">deploy a native B20 from the form or the command line — same engine.</p>
        </div>
        <div className="ml-auto inline-flex rounded-lg border border-line p-1 bg-bg/40">
          {tab("app", "› app")}
          {tab("terminal", "› terminal")}
        </div>
      </div>

      {mode === "app" ? <LaunchForm /> : <DeployTerminal />}

      <p className="mt-6 text-xs text-muted flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-warn/70" />
        {IS_TESTNET ? "base sepolia · testnet" : "base · mainnet"} — admin-less · 80% pool / 20% vested
      </p>
    </main>
  );
}

export default function AppPage() {
  return (
    <Suspense fallback={<main className="wrap py-10 text-muted">loading…</main>}>
      <AppInner />
    </Suspense>
  );
}
