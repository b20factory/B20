"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useBalance, useConnect, useSignMessage } from "wagmi";
import { useLaunch, type LaunchInput } from "@/lib/useLaunch";
import { getEthUsd, ETH_USD_FALLBACK } from "@/lib/ethPrice";
import { EXPLORER } from "@/lib/contracts";
import { RH, rhLive, type VenueId } from "@/lib/chains";
import { getAgents, registerAgent, registerMessage } from "@/lib/agents";

type Line = { t: "in" | "out" | "ok" | "err" | "dim" | "bot"; s: string; href?: string };

const HELP = [
  "commands:",
  "  help                                       show this",
  "  connect                                    connect a wallet",
  "  register <name>                            register your agent name (signs a message)",
  "  agent                                      show your agent name",
  "  balance                                    wallet balance",
  "  price                                      live ETH/USD",
  "  fee --base 1 --max 5                       preview a fee band",
  "  launch                                     guided launch (beryl walks you through)",
  "  launch --name <n> --symbol <s>             one-shot launch",
  "         [--chain base|robinhood]            venue (default base)",
  "         [--v3]                               robinhood: launch a Uniswap v3 pool (bot-buyable)",
  "         [--base 3] [--max 5] [--mc 10000]",
  "         [--receive eth|token|both]          how you receive your fee share (base only)",
  "         [--image <url>] [--bio <text>]      token image URL + short bio",
  "         [--x @h] [--github @h] [--tg @h]    socials",
  "  cancel                                     stop the guided launch",
  "  clear                                      clear screen",
];

// guided-launch wizard ------------------------------------------------------
type Step = "chain" | "rhtype" | "name" | "symbol" | "fee" | "receive" | "mc" | "image" | "bio" | "x" | "github" | "telegram" | "confirm";
type Draft = {
  venue?: VenueId; rhVenue?: "curve" | "v3"; name?: string; symbol?: string; base?: number; max?: number;
  receive?: number; mc?: number; image?: string; bio?: string; x?: string; github?: string; telegram?: string;
};
const ORDER: Step[] = ["chain", "rhtype", "name", "symbol", "fee", "receive", "mc", "image", "bio", "x", "github", "telegram", "confirm"];
const RECV = ["ETH", "token", "both"];

function prompt(step: Step, d: Draft): string {
  const rh = d.venue === "robinhood";
  switch (step) {
    case "chain": return `where do we launch? \`b20\` (native B20 on Base) or \`robinhood\` (Robinhood Chain)${rhLive ? "" : " — robinhood coming online soon"}. hit enter for b20.`;
    case "rhtype": return "market type? `curve` (bonding curve, graduates to v3) or `v3` (Uniswap v3 pool now, buyable by bots). hit enter for curve.";
    case "name": return "what should the token be called?";
    case "symbol": return `nice — "${d.name}". ticker/symbol? (e.g. CAT, max 11 chars)`;
    case "fee": return rh
      ? "trading fee? type like `3` for 3%, or hit enter for the default [3]."
      : "fee band? type like `3 5` for base 3% / max 5%, or hit enter for the default [3-5].";
    case "receive": return "receive your fee share in `eth`, `token`, or `both`? (platform cut is always eth) hit enter for eth.";
    case "mc": return d.rhVenue === "v3"
      ? "opening market cap in USD? the v3 pool opens at this FDV. hit enter for the default [10000]."
      : rh
      ? "graduation market cap in USD? the token moves to Uniswap v3 there. hit enter for the default [10000]."
      : "starting market cap in USD? hit enter for the default [10000].";
    case "image": return "token photo? paste an image URL (this shows on the feed card + socials), or hit enter to skip.";
    case "bio": return "short bio for the token? one or two sentences, or hit enter to skip.";
    case "x": return "X / twitter? paste @handle or a link, or hit enter to skip.";
    case "github": return "GitHub? paste @handle or a link, or hit enter to skip.";
    case "telegram": return "Telegram? paste @handle or a t.me link, or hit enter to skip.";
    case "confirm": {
      const v3 = d.rhVenue === "v3";
      const venueLbl = rh ? (v3 ? "robinhood·v3" : "robinhood·curve") : "base";
      const feeLbl = v3 ? "fee 1%" : `fee ${d.base}%${rh ? "" : `/${d.max}%`}`;
      return `review → [${venueLbl}] ${d.name} ($${d.symbol})  ${feeLbl}${rh ? "" : `  recv ${RECV[d.receive ?? 0]}`}  ${v3 ? "open" : rh ? "grad" : "start"} mc $${d.mc}${d.image ? "  img" : ""}${d.bio ? "  bio" : ""}${d.x ? "  x" : ""}${d.github ? "  gh" : ""}${d.telegram ? "  tg" : ""}\n        type \`yes\` to deploy, \`back\` to fix, \`cancel\` to abort.`;
    }
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
  { label: "connect", exec: "connect" },
  { label: "register", fill: "register your-agent-name" },
  { label: "help", exec: "help" },
  { label: "balance", exec: "balance" },
  { label: "clear", exec: "clear" },
];

export default function DeployTerminal() {
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address });
  const { connectors, connectAsync } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { launch, busy } = useLaunch();
  const [lines, setLines] = useState<Line[]>([
    { t: "bot", s: "gm. i'm beryl. type `launch` and i'll walk you through it — B20 or Robinhood chain. `help` for raw commands." },
  ]);
  const [val, setVal] = useState("");
  const [wiz, setWiz] = useState<{ step: Step; draft: Draft } | null>(null);
  const [ethUsd, setEthUsd] = useState(ETH_USD_FALLBACK);
  const [agentName, setAgentName] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const push = (ls: Line[]) => setLines((p) => [...p, ...ls]);
  const say = (s: string) => push([{ t: "bot", s }]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);
  useEffect(() => { getEthUsd().then(setEthUsd); }, []);
  useEffect(() => {
    if (!address) { setAgentName(""); return; }
    getAgents().then((m) => setAgentName(m[address.toLowerCase()] || ""));
  }, [address]);

  async function doConnect() {
    if (isConnected) { push([{ t: "ok", s: `already connected — ${address}` }]); return; }
    const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
    if (!injected) { push([{ t: "err", s: "no wallet connector available" }]); return; }
    push([{ t: "out", s: "› requesting wallet connection…" }]);
    try {
      const res = await connectAsync({ connector: injected });
      const a = res.accounts[0];
      push([{ t: "ok", s: `✓ connected — ${a}` }]);
      const agents = await getAgents();
      const nm = agents[a.toLowerCase()];
      if (nm) { setAgentName(nm); say(`welcome back, agent ${nm}.`); }
      else say("next: `register <name>` to deploy as a named agent, or go straight to `launch`.");
    } catch (e: any) {
      push([{ t: "err", s: `✕ ${e?.shortMessage || e?.message || "connection rejected"}` }]);
    }
  }

  async function doRegister(name: string) {
    if (!isConnected || !address) { push([{ t: "err", s: "connect first — run `connect`." }]); return; }
    if (!name) { push([{ t: "err", s: "usage: register <name>   (3-24 chars)" }]); return; }
    push([{ t: "out", s: `› registering agent "${name}" — sign the message in your wallet…` }]);
    try {
      const sig = await signMessageAsync({ message: registerMessage(name, address) });
      const res = await registerAgent(address, name, sig);
      if (!res.ok) { push([{ t: "err", s: `✕ ${res.error || "registration failed"}` }]); return; }
      setAgentName(name);
      push([{ t: "ok", s: `✓ registered — your launches now show as "by ${name}" with the agent badge.` }]);
    } catch (e: any) {
      push([{ t: "err", s: `✕ ${e?.shortMessage || e?.message || "signature rejected"}` }]);
    }
  }

  function startWizard() {
    if (!isConnected) { push([{ t: "err", s: "connect a wallet first — run `connect`." }]); return; }
    const w = { step: "chain" as Step, draft: {} as Draft };
    setWiz(w);
    if (!agentName) say("tip: `cancel` then `register <name>` if you want this launch credited to an agent name.");
    say(prompt("chain", w.draft));
  }

  async function finishWizard(d: Draft) {
    setWiz(null);
    const rh = d.venue === "robinhood";
    const v3 = rh && d.rhVenue === "v3";
    const input: LaunchInput = {
      name: d.name!, symbol: (d.symbol || "").toUpperCase(),
      startMcUsd: d.mc ?? 10000, ethUsd,
      baseFeePct: d.base ?? 3, maxFeePct: d.max ?? d.base ?? 5,
      feeReceiveType: d.receive ?? 0,
      venue: d.venue ?? "base", rhVenue: d.rhVenue ?? "curve",
      imageUrl: d.image ?? "", description: d.bio ?? "",
      x: d.x ?? "", github: d.github ?? "", telegram: d.telegram ?? "",
    };
    if (input.maxFeePct < input.baseFeePct) input.maxFeePct = input.baseFeePct;
    push([{ t: "out", s: `› deploying on ${rh ? (v3 ? "Robinhood Chain (v3 pool)" : "Robinhood Chain (curve)") : "B20"}… (confirm in your wallet)` }]);
    try {
      const tok = await launch(input);
      push([
        { t: "ok", s: `✓ deployed — CA ${tok}` },
        v3
          ? { t: "ok", s: "  live Uniswap v3 pool · LP locked · buyable by any wallet or bot" }
          : rh
          ? { t: "ok", s: "  bonding curve live · graduates to Uniswap v3 at the cap" }
          : { t: "ok", s: "  native B20 · admin-less · not mintable · no transfer tax" },
        { t: "bot", s: "open the token page:", href: `/token/${tok}` },
        { t: "dim", s: `  explorer: ${rh ? RH.explorer : EXPLORER}/token/${tok}` },
      ]);
      say(agentName ? `done, agent ${agentName}. it's live on the feed.` : "done. it's live on the feed.");
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
      let prev = ORDER[Math.max(0, idx - 1)];
      const d0 = w.draft;
      // honor the same step-skips the forward flow uses
      if (prev === "rhtype" && d0.venue !== "robinhood") prev = "chain";
      if ((prev === "fee" || prev === "receive") && d0.rhVenue === "v3") prev = "symbol";
      if (prev === "receive" && d0.venue === "robinhood") prev = "fee";
      const nw = { step: prev, draft: w.draft };
      setWiz(nw); say(prompt(prev, nw.draft)); return;
    }

    const d = { ...w.draft };
    let next: Step | null = null;

    switch (w.step) {
      case "chain": {
        const v: VenueId = low.startsWith("rob") || low === "rh" ? "robinhood" : "base"; // b20/base/blank => base
        if (v === "robinhood" && !rhLive) { say("robinhood chain isn't live on b20factory yet — launching on `base` for now, or `cancel`."); return; }
        d.venue = v; next = v === "robinhood" ? "rhtype" : "name"; break;
      }
      case "rhtype": {
        d.rhVenue = low === "v3" || low.includes("uni") ? "v3" : "curve";
        next = "name"; break;
      }
      case "name":
        if (!s) { say("give it a name first — anything works."); return; }
        d.name = s.slice(0, 32); next = "symbol"; break;
      case "symbol": {
        const sym = s.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 11);
        if (!sym) { say("the ticker needs at least one letter or number. try again."); return; }
        // v3 pools use the fixed 1% fee tier — skip the fee question entirely
        d.symbol = sym; next = d.rhVenue === "v3" ? "mc" : "fee"; break;
      }
      case "fee": {
        if (!s) { d.base = 3; d.max = 5; }
        else {
          const nums = s.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
          let b = nums[0] ?? 3, m = nums[1] ?? nums[0] ?? 5;
          b = Math.min(5, Math.max(0, b)); m = Math.min(5, Math.max(b, m));
          d.base = b; d.max = m;
        }
        next = d.venue === "robinhood" ? "mc" : "receive"; break;
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
        next = "bio"; break;
      case "bio":
        d.bio = s ? s.slice(0, 280) : "";
        next = "x"; break;
      case "x":
        d.x = s ? s : "";
        next = "github"; break;
      case "github":
        d.github = s ? s : "";
        next = "telegram"; break;
      case "telegram":
        d.telegram = s ? s : "";
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

    const [name, ...rest] = cmd.split(/\s+/);
    const args = parseArgs(cmd);

    if (name === "clear") { setLines([]); return; }
    if (name === "help") { push(HELP.map((s) => ({ t: "out" as const, s }))); return; }
    if (name === "cancel") { say("nothing to cancel."); return; }
    if (name === "gm" || name === "hi" || name === "hello") { say(agentName ? `gm, agent ${agentName}. type \`launch\` when ready.` : "gm. ready when you are — type `connect`, then `launch`."); return; }
    if (name === "connect") { doConnect(); return; }
    if (name === "register") { doRegister(rest.join(" ").trim().slice(0, 24)); return; }
    if (name === "agent") {
      if (!isConnected) { push([{ t: "err", s: "no wallet connected — run `connect`." }]); return; }
      push([{ t: agentName ? "ok" : "out", s: agentName ? `agent ${agentName} (${address})` : "no agent name yet — run `register <name>`." }]);
      return;
    }
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
      if (!isConnected) { push([{ t: "err", s: "connect a wallet first — run `connect`" }]); return; }
      if (!args.name || !args.symbol) { push([{ t: "err", s: 'usage: launch --name "My Token" --symbol MTK [--chain base|robinhood] [--base 3] [--max 5] [--mc 10000] [--image <url>]  — or just `launch` for guided mode' }]); return; }
      const chainArg = (args.chain || "").toLowerCase();
      const venue: VenueId = chainArg.startsWith("rob") ? "robinhood" : "base";
      // --v3 flag, or --chain robinhood-v3 / robinhoodv3
      const wantV3 = "v3" in args || chainArg.includes("v3");
      const rhVenue: "curve" | "v3" = venue === "robinhood" && wantV3 ? "v3" : "curve";
      if (venue === "robinhood" && !rhLive) { push([{ t: "err", s: "robinhood chain isn't live on b20factory yet" }]); return; }
      const input: LaunchInput = {
        name: args.name, symbol: args.symbol.toUpperCase(),
        startMcUsd: Number(args.mc ?? 10000), ethUsd,
        baseFeePct: Number(args.base ?? 3), maxFeePct: Number(args.max ?? args.base ?? 5),
        feeReceiveType: args.receive === "token" ? 1 : args.receive === "both" ? 2 : 0,
        venue, rhVenue,
        imageUrl: args.image ?? "", description: args.bio ?? "",
        x: args.x ?? "", github: args.github ?? "", telegram: args.tg ?? args.telegram ?? "",
      };
      if (input.maxFeePct < input.baseFeePct) input.maxFeePct = input.baseFeePct;
      const isV3 = rhVenue === "v3";
      push([
        { t: "dim", s: `  [${venue}${isV3 ? "·v3" : ""}] ${isV3 ? "fee 1%" : `base ${input.baseFeePct}%${venue === "base" ? ` / max ${input.maxFeePct}%` : ""}`} · mc $${input.startMcUsd} · 20% vested${input.imageUrl ? " · image set" : ""}` },
        { t: "out", s: `› deploying on ${venue === "robinhood" ? (isV3 ? "Robinhood Chain (v3 pool)" : "Robinhood Chain") : "B20"}… (confirm in wallet)` },
      ]);
      try {
        const tok = await launch(input);
        push([
          { t: "ok", s: `✓ deployed — CA ${tok}` },
          isV3
            ? { t: "ok", s: "  live Uniswap v3 pool · LP locked · buyable by any wallet or bot" }
            : venue === "robinhood"
            ? { t: "ok", s: "  bonding curve live · graduates to Uniswap v3 at the cap" }
            : { t: "ok", s: "  native B20 · admin-less · not mintable · no transfer tax" },
          { t: "bot", s: "open the token page:", href: `/token/${tok}` },
          { t: "dim", s: `  explorer: ${venue === "robinhood" ? RH.explorer : EXPLORER}/token/${tok}` },
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

  const placeholder = busy ? "deploying…" : wiz ? `${wiz.step}…  (or \`cancel\`)` : 'connect  ·  register <name>  ·  launch';

  return (
    <div className="console font-mono">
      <div className="console-bar">
        <span className="console-dot" /><span className="console-dot" /><span className="console-dot" />
        <span className="ml-2 text-xs">beryl — interactive launch</span>
        <span className="ml-auto text-[11px]">
          {wiz ? "guiding" : isConnected ? (agentName ? `agent ${agentName}` : "connected") : "offline"}
        </span>
      </div>

      {/* quick-action toolbar */}
      <div className="px-3 py-2 border-b border-con-line flex gap-1.5 flex-wrap">
        {TOOLBAR.map((item) => (
          <button
            key={item.label}
            className="rounded-full border border-con-line px-2.5 py-0.5 text-[11px] text-con-muted hover:text-con-accent hover:border-con-accent/40 transition-colors"
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
            l.t === "ok" ? "text-con-ok" :
            l.t === "err" ? "text-con-err" :
            l.t === "dim" ? "text-con-muted" :
            l.t === "bot" ? "text-con-accent/90" :
            l.t === "out" ? "text-con-text/80" : "text-con-text"
          }>
            {l.t === "in" ? <span className="prompt">{l.s}</span>
              : l.t === "bot" ? (
                <span className="whitespace-pre-wrap">
                  <span className="text-con-accent/60 mr-1.5">beryl&gt;</span>{l.s}
                  {l.href && <> <Link href={l.href} className="underline text-con-ok hover:text-con-accent">{l.href} ↗</Link></>}
                </span>
              )
              : <span className="whitespace-pre-wrap">{l.s}</span>}
          </div>
        ))}
        <form
          onSubmit={(e) => { e.preventDefault(); const v = val; setVal(""); run(v); }}
          className="flex items-center"
        >
          <span className="text-con-accent mr-2">$</span>
          <input
            ref={inputRef}
            id="term-in" autoComplete="off" spellCheck={false}
            className="flex-1 bg-transparent outline-none text-con-text caret-con-accent placeholder:text-con-muted/60"
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
