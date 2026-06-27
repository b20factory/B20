"use client";
import { useEffect, useState } from "react";

// A looping, self-typing terminal session that shows how a B20 launch "feels like
// coding". Pure visual — no chain calls.
const SCRIPT: { t: "in" | "out" | "ok" | "dim"; s: string }[] = [
  { t: "in", s: "launch --name \"Beryl Cat\" --symbol BCAT" },
  { t: "dim", s: "  base 3% / max 5% dynamic · 20% vested · pool single-sided" },
  { t: "out", s: "› minting B20 ASSET via 0xB20f… precompile" },
  { t: "out", s: "› supply 1,000,000,000 · admin-less · cap locked" },
  { t: "out", s: "› seeding single-sided pool @ $10k start mc" },
  { t: "ok", s: "✓ deployed  0xb200…CAT   not mintable · no transfer tax" },
  { t: "ok", s: "✓ tradeable · boostable · not a honeypot" },
];

export default function HeroTerminal() {
  const [lines, setLines] = useState<{ t: string; s: string }[]>([]);
  const [typed, setTyped] = useState("");
  const [i, setI] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function run() {
      while (!cancelled) {
        setLines([]); setTyped(""); setI(0);
        const acc: { t: string; s: string }[] = [];
        for (let k = 0; k < SCRIPT.length; k++) {
          const line = SCRIPT[k];
          if (line.t === "in") {
            for (let c = 0; c <= line.s.length; c++) {
              if (cancelled) return;
              setTyped(line.s.slice(0, c));
              await wait(28);
            }
            await wait(350);
          } else {
            await wait(line.t === "ok" ? 260 : 160);
          }
          acc.push(line); setLines([...acc]); setTyped(line.t === "in" ? "" : typed);
          setI(k + 1);
        }
        await wait(2600);
      }
    }
    function wait(ms: number) { return new Promise<void>((r) => { timer = setTimeout(r, ms); }); }
    run();
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const color = (t: string) =>
    t === "ok" ? "text-beryl-glow" : t === "out" ? "text-text/80" : t === "dim" ? "text-muted" : "text-text";

  return (
    <div className="term overflow-hidden">
      <div className="term-bar">
        <span className="dot bg-bad/70" /><span className="dot bg-warn/70" /><span className="dot bg-beryl/70" />
        <span className="ml-2 text-xs text-muted">B20factory — ~/launch</span>
        <span className="ml-auto text-[11px] text-muted">base beryl</span>
      </div>
      <div className="p-4 text-[13px] leading-6 min-h-[230px]">
        {lines.map((l, idx) => (
          <div key={idx} className={color(l.t)}>
            {l.t === "in" ? <span className="prompt">{l.s}</span> : l.s}
          </div>
        ))}
        {i < SCRIPT.length && SCRIPT[i]?.t === "in" && (
          <div className="text-text"><span className="prompt">{typed}</span><span className="cursor" /></div>
        )}
        {i >= SCRIPT.length && <div className="text-text"><span className="prompt" /><span className="cursor" /></div>}
      </div>
    </div>
  );
}
