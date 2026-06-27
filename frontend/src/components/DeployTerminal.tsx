"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useBalance } from "wagmi";
import { useLaunch, type LaunchInput } from "@/lib/useLaunch";
import { getEthUsd, ETH_USD_FALLBACK } from "@/lib/ethPrice";
import { EXPLORER } from "@/lib/contracts";

type Line = { t: "in" | "out" | "ok" | "err" | "dim" | "bot"; s: string; href?: string };

const HELP = [
  "commands:",
  "  help                                       show this",
  "  balance                                    wallet balance",
  "  price                                      live ETH/USD",
  "  fee --base 1 --max 5                       preview a fee band",
  "  launch                                     guided launch (beryl walks you through)",
  "  launch --name <n> --symbol <s>             one-shot launch",
  "         [--base 3] [--max 5] [--mc 10000]",
  "         [--receive eth|token|both]          how you receive your fee share",
  "         [--image <url>]                     token image URL",
  "  cancel                                     stop the guided launch",
  "  clear                                      clear screen",
];

// guided-launch wizard ------------------------------------------------------
type Step = "name" | "symbol" | "fee" | "receive" | "mc" | "image" | "x" | "website" | "confirm";
type Draft = { name?: string; symbol?: string; base?: number; max?: number; receive?: number; mc?: number; image?: string; x?: string; website?: string };
const ORDER: Step[] = ["name", "symbol", "fee", "receive", "mc", "image", "x", "website", "confirm"];
const RECV = ["ETH", "token", "both"];

function prompt(step: Step, d: Draft): string {
  switch (step) {
    case "name": return "let's launch a token. what should it be called?";
    case "symbol": return `nice — "${d.name}". ticker/symbol? (e.g. CAT, max 11 chars)`;
    case "fee": return "fee band? type like `3 5` for base 3% / max 5%, or hit enter for the default [3-5].";
    case "receive": return "receive your fee share in `eth`, `token`, or `both`? (platform cut is always eth) hit enter for eth.";
    case "mc": return "starting market cap in USD? hit enter for the default [10000].";
    case "image": return "token image URL? paste one or hit enter to skip.";
    case "x": return "X / twitter? paste @handle or a link (shows on the token page + ready for DexScreener), or hit enter to skip.";
    case "website": return "website? paste a URL or hit enter to skip.";
    case "confirm":
      return `review → ${d.name} ($${d.symbol})  fee ${d.base}%/${d.max}%  recv ${RECV[d.receive ?? 0]}  start mc $${d.mc}${d.image ? "  img" : ""}${d.x ? "  x" : ""}${d.website ? "  web" : ""}\n        type \`yes\` to deploy, \`back\` to fix, \`cancel\` to abort.`;
  }
}

function parseArgs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--([a-zA-Z]+)\s+("([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1]] = m[3] ?? m[4] ?? m[5] ?? "";
  return out;
}

const TOOLBAR: { label: string; fill?: string; exec?: string }[] = [
  { label: "guided launch", exec: "launch" },
  { label: "help", exec: "help" },
  { label: "balance", exec: "balance" },
  { label: "fee", fill: "fee --base 3 --max 5" },
  { label: "clear", exec: "clear" },
];

export default function DeployTerminal() {
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address });
  const { launch, busy } = useLaunch();
  const [lines, setLines] = useState<Line[]>([
    { t: "bot", s: "gm. i'm beryl. type `launch` and i'll walk you through it, or `help` for raw commands." },
  ]);
  const [val, setVal] = useState("");
  const [wiz, setWiz] = useState<{ step: Step; draft: Draft } | null>(null);
  const [ethUsd, setEthUsd] = useState(ETH_USD_FALLBACK);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const push = (ls: Line[]) => setLines((p) => [...p, ...ls]);
  const say = (s: string) => push([{ t: "bot", s }]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);
  useEffect(() => { getEthUsd().then(setEthUsd); }, []);

  function startWizard() {
    if (!isConnected) { push([{ t: "err", s: "connect a wallet first (top right), then run `launch`." }]); return; }
    const w = { step: "name" as Step, draft: {} as Draft };
    setWiz(w);
    say(prompt("name", w.draft));
  }

  async function finishWizard(d: Draft) {
    setWiz(null);
    const input: LaunchInput = {
      name: d.name!, symbol: (d.symbol || "").toUpperCase(),
      startMcUsd: d.mc ?? 10000, ethUsd,
      baseFeePct: d.base ?? 3, maxFeePct: d.max ?? d.base ?? 5,
      feeReceiveType: d.receive ?? 0,
      imageUrl: d.image ?? "", x: d.x ?? "", website: d.website ?? "",
    };
    if (input.maxFeePct < input.baseFeePct) input.maxFeePct = input.baseFeePct;
    push([{ t: "out", s: "› deploying B20 token… (confirm in your wallet)" }]);
    try {
      const tok = await launch(input);
      push([
        { t: "ok", s: `✓ deployed — CA ${tok}` },
        { t: "ok", s: "  native B20 · admin-less · not mintable · no transfer tax" },
        { t: "bot", s: "open the token page for the live chart + buy/sell:", href: `/token/${tok}` },
        { t: "dim", s: `  explorer: ${EXPLORER}/token/${tok}` },
      ]);
      say("done. it's tradable right now.");
    } catch (e: any) {
      push([{ t: "err", s: `✕ ${e?.shortMessage || e?.message || "launch failed"}` }]);
      say("no worries, nothing was spent. run `launch` to try again.");
    }
  }

  // handle one line of input while the wizard is active
  function wizardInput(raw: string) {
    const s = raw.trim();
    const w = wiz!;
    const low = s.toLowerCase();
    if (low === "cancel" || low === "quit" || low === "exit") {
      setWiz(null); say("cancelled. nothing deployed. type `launch` whenever you're ready."); return;
    }
    if (low === "back") {
      const idx = ORDER.indexOf(w.step);
      const prev = ORDER[Math.max(0, idx - 1)];
      const nw = { step: prev, draft: w.draft };
      setWiz(nw); say(prompt(prev, nw.draft)); return;
    }

    const d = { ...w.draft };
    let next: Step | null = null;

    switch (w.step) {
      case "name":
        if (!s) { say("give it a name first — anything works."); return; }
        d.name = s.slice(0, 32); next = "symbol"; break;
      case "symbol": {
        const sym = s.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 11);
        if (!sym) { say("the ticker needs at least one letter or number. try again."); return; }
        d.symbol = sym; next = "fee"; break;
      }
      case "fee": {
        if (!s) { d.base = 3; d.max = 5; }
        else {
          const nums = s.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
          let b = nums[0] ?? 3, m = nums[1] ?? nums[0] ?? 5;
          b = Math.min(5, Math.max(0, b)); m = Math.min(5, Math.max(b, m));
          d.base = b; d.max = m;
        }
        next = "receive"; break;
      }
      case "receive": {
        const t = low === "token" || low === "1" ? 1 : low === "both" || low === "2" ? 2 : 0;
        d.receive = t; next = "mc"; break;
      }
      case "mc": {
        if (!s) d.mc = 10000;
        else {
          const n = Number(s.replace(/[^0-9.]/g, ""));
          if (!n || n <= 0) { say("market cap should be a positive number, like 10000. try again."); return; }
          d.mc = Math.round(n);
        }
        next = "image"; break;
      }
      case "image":
        d.image = s ? s : "";
        next = "x"; break;
      case "x":
        d.x = s ? s : "";
        next = "website"; break;
      case "website":
        d.website = s ? s : "";
        next = "confirm"; break;
      case "confirm":
        if (low === "yes" || low === "y" || low === "deploy" || low === "ship") { finishWizard(d); return; }
        say("type `yes` to deploy, `back` to change something, or `cancel`."); return;
    }

    if (next) {
      const nw = { step: next, draft: d };
      setWiz(nw);
      say(prompt(next, d));
    }
  }

  async function run(cmdRaw: string) {
    const cmd = cmdRaw.trim();
    if (!cmd) return;
    push([{ t: "in", s: cmd }]);

    // wizard mode swallows input as answers (except clear)
    if (wiz) {
      if (cmd.toLowerCase() === "clear") { setLines([]); return; }
      wizardInput(cmd);
      return;
    }

    const [name] = cmd.split(/\s+/);
    const args = parseArgs(cmd);

    if (name === "clear") { setLines([]); return; }
    if (name === "help") { push(HELP.map((s) => ({ t: "out" as const, s }))); return; }
    if (name === "cancel") { say("nothing to cancel."); return; }
    if (name === "gm" || name === "hi" || name === "hello") { say("gm. ready when you are — type `launch`."); return; }
    if (name === "balance") {
      push([{ t: isConnected ? "ok" : "err", s: isConnected ? `${Number(bal?.formatted || 0).toFixed(5)} ${bal?.symbol || "ETH"}  (${address})` : "no wallet connected" }]);
      return;
    }
    if (name === "fee") {
      const b = Number(args.base ?? 3), m = Number(args.max ?? 5);
      push([{ t: "out", s: b === m ? `flat ${b}% fee` : `dynamic ${b}% → ${m}% (ramps with volatility, capped at ${m}%)` }]);
      return;
    }
    if (name === "price") {
      push([{ t: "out", s: `ETH $${ethUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} (live) — used to size the starting market cap` }]);
      return;
    }
    if (name === "launch") {
      // no flags → guided; flags → one-shot
      if (!args.name && !args.symbol) { startWizard(); return; }
      if (!isConnected) { push([{ t: "err", s: "connect a wallet first (top right)" }]); return; }
      if (!args.name || !args.symbol) { push([{ t: "err", s: 'usage: launch --name "My Token" --symbol MTK [--base 3] [--max 5] [--mc 10000] [--image <url>]  — or just `launch` for guided mode' }]); return; }
      const input: LaunchInput = {
        name: args.name, symbol: args.symbol.toUpperCase(),
        startMcUsd: Number(args.mc ?? 10000), ethUsd,
        baseFeePct: Number(args.base ?? 3), maxFeePct: Number(args.max ?? args.base ?? 5),
        feeReceiveType: args.receive === "token" ? 1 : args.receive === "both" ? 2 : 0,
        imageUrl: args.image ?? "",
      };
      if (input.maxFeePct < input.baseFeePct) input.maxFeePct = input.baseFeePct;
      push([
        { t: "dim", s: `  base ${input.baseFeePct}% / max ${input.maxFeePct}% · start mc $${input.startMcUsd} · 20% vested${input.imageUrl ? " · image set" : ""}` },
        { t: "out", s: "› deploying B20 token… (confirm in wallet)" },
      ]);
      try {
        const tok = await launch(input);
        push([
          { t: "ok", s: `✓ deployed — CA ${tok}` },
          { t: "ok", s: "  native B20 · admin-less · not mintable · no transfer tax" },
          { t: "bot", s: "open the token page for the live chart + buy/sell:", href: `/token/${tok}` },
          { t: "dim", s: `  explorer: ${EXPLORER}/token/${tok}` },
        ]);
      } catch (e: any) {
        push([{ t: "err", s: `✕ ${e?.shortMessage || e?.message || "launch failed"}` }]);
      }
      return;
    }
    push([{ t: "err", s: `unknown command: ${name} — try \`help\` or \`launch\`` }]);
  }

  function handleToolbar(item: typeof TOOLBAR[0]) {
    if (item.exec) run(item.exec);
    else if (item.fill) { setVal(item.fill); setTimeout(() => inputRef.current?.focus(), 0); }
  }

  const placeholder = busy ? "deploying…" : wiz ? `${wiz.step}…  (or \`cancel\`)` : 'launch  ·  or  launch --name "Beryl Cat" --symbol BCAT';

  return (
    <div className="term overflow-hidden">
      <div className="term-bar">
        <span className="dot bg-bad/70" /><span className="dot bg-warn/70" /><span className="dot bg-beryl/70" />
        <span className="ml-2 text-xs text-muted">beryl — interactive agent</span>
        <span className="ml-auto text-[11px] text-muted">{wiz ? "● guiding" : isConnected ? "● connected" : "○ offline"}</span>
      </div>

      {/* quick-action toolbar */}
      <div className="px-3 py-2 border-b border-line flex gap-1.5 flex-wrap">
        {TOOLBAR.map((item) => (
          <button
            key={item.label}
            className="chip hover:border-beryl-dim/50 hover:text-beryl transition-colors text-[11px] px-2 py-0.5"
            onClick={() => handleToolbar(item)}
            disabled={busy}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="p-4 text-[13px] leading-6 h-[380px] overflow-y-auto" onClick={() => inputRef.current?.focus()}>
        {lines.map((l, i) => (
          <div key={i} className={
            l.t === "ok" ? "text-beryl-glow" :
            l.t === "err" ? "text-bad" :
            l.t === "dim" ? "text-muted" :
            l.t === "bot" ? "text-beryl/85" :
            l.t === "out" ? "text-text/80" : "text-text"
          }>
            {l.t === "in" ? <span className="prompt">{l.s}</span>
              : l.t === "bot" ? (
                <span className="whitespace-pre-wrap">
                  <span className="text-beryl/60 mr-1.5">beryl&gt;</span>{l.s}
                  {l.href && <> <Link href={l.href} className="underline text-beryl-glow hover:text-beryl">{l.href} ↗</Link></>}
                </span>
              )
              : <span className="whitespace-pre-wrap">{l.s}</span>}
          </div>
        ))}
        <form
          onSubmit={(e) => { e.preventDefault(); const v = val; setVal(""); run(v); }}
          className="flex items-center"
        >
          <span className="text-beryl mr-2">›</span>
          <input
            ref={inputRef}
            id="term-in" autoComplete="off" spellCheck={false}
            className="flex-1 bg-transparent outline-none text-text caret-beryl"
            value={val} disabled={busy}
            placeholder={placeholder}
            onChange={(e) => setVal(e.target.value)}
          />
        </form>
        <div ref={endRef} />
      </div>
    </div>
  );
}
