"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LaunchForm from "@/components/LaunchForm";
import DeployTerminal from "@/components/DeployTerminal";
import { IS_TESTNET } from "@/lib/contracts";

function AppInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"app" | "terminal">(sp.get("mode") === "terminal" ? "terminal" : "app");
  // keep the mode in sync when navigating between the Launch / Terminal menus
  // (same route, only the query changes — the component does not remount)
  useEffect(() => { setMode(sp.get("mode") === "terminal" ? "terminal" : "app"); }, [sp]);

  const tab = (id: "app" | "terminal", label: string) => (
    <button
      onClick={() => { setMode(id); router.replace(id === "terminal" ? "/app?mode=terminal" : "/app", { scroll: false }); }}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === id ? "bg-panel text-text shadow-card" : "text-muted hover:text-text"}`}
    >
      {label}
    </button>
  );

  return (
    <main className="wrap py-10">
      <div className="flex flex-wrap items-end gap-3 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text">Launch a token</h1>
          <p className="text-sm text-muted mt-1.5">Deploy on B20 or Robinhood Chain, from the form or the command line. Same engine, your choice.</p>
        </div>
        <div className="ml-auto inline-flex rounded-lg bg-panel2 p-1">
          {tab("app", "Form")}
          {tab("terminal", "Terminal")}
        </div>
      </div>

      {mode === "app" ? <LaunchForm /> : <DeployTerminal />}

      <p className="mt-6 text-xs text-muted">
        B20 {IS_TESTNET ? "testnet" : "mainnet"} · Robinhood Chain live · admin-less · 80% pool / 20% vested
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
