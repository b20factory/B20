"use client";
import { useEffect, useRef, useState } from "react";

// Beryl, the B20factory terminal agent. Brand illustration kept alive with a
// gentle float + an "explaining" gesture sway, a speech bubble, and a live
// terminal typing on its CRT face so it reads as if it's always coding.
const LINES = [
  "gm. ready to launch a B20?",
  "one transaction. no admin keys.",
  "supply is capped at birth. no rug.",
  "the swap fee never goes past 5%.",
  "psst, try the terminal: launch --name ...",
  "single-sided pool, locked forever.",
];

// short tokens that "type" on the tiny CRT screen
const CMDS = ["b20", "deploy", "audit", "mint", "ship", "lock"];

function useTyper(active: boolean) {
  const [text, setText] = useState("");
  const ref = useRef({ ci: 0, ch: 0, dir: 1 as 1 | -1 });
  useEffect(() => {
    if (!active) return;
    let timer: any;
    const tick = () => {
      const s = ref.current;
      const word = CMDS[s.ci];
      s.ch += s.dir;
      if (s.ch > word.length) { s.dir = -1; s.ch = word.length; timer = setTimeout(tick, 900); setText(word); return; }
      if (s.ch < 0) { s.dir = 1; s.ch = 0; s.ci = (s.ci + 1) % CMDS.length; }
      setText(CMDS[s.ci].slice(0, Math.max(0, s.ch)));
      timer = setTimeout(tick, s.dir === 1 ? 150 : 80);
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [active]);
  return text;
}

export default function Mascot({ size = 240, talk = true }: { size?: number; talk?: boolean }) {
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);
  const bigScreen = size >= 120;
  const typed = useTyper(bigScreen);

  useEffect(() => {
    if (!talk) return;
    const cycle = setInterval(() => {
      setShow(false);
      const t = setTimeout(() => {
        setI((p) => (p + 1) % LINES.length);
        setShow(true);
      }, 450);
      return () => clearTimeout(t);
    }, 4200);
    return () => clearInterval(cycle);
  }, [talk]);

  return (
    <div className="mwrap" style={{ width: size }}>
      {talk && (
        <div className={`bubble ${show ? "in" : "out"}`}>
          <span className="bubble-dot" />{LINES[i]}
          <span className="tail" />
        </div>
      )}

      <div className="gesture">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascot.webp" alt="Beryl, the B20factory terminal agent" width={size} height={size} className="shot base" draggable={false} />
        {bigScreen ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascot_up.webp" alt="" width={size} height={size} className="shot up" draggable={false} aria-hidden />
            <div className="screen" aria-hidden>
              <span className="prompt">&gt;</span>
              <span className="typed">{typed}</span>
              <span className="curs">█</span>
            </div>
          </>
        ) : null}
      </div>

      <style jsx>{`
        .mwrap { position: relative; display: inline-block; }
        .gesture { animation: floaty 3.6s ease-in-out infinite; transform-origin: center bottom; position: relative; }
        .shot { display: block; width: 100%; height: auto; filter: drop-shadow(0 14px 24px rgba(16, 24, 40, 0.14)); }
        /* two-frame arm gesture: base = arms down, up = right arm raised (explaining) */
        .base { position: relative; }
        ${bigScreen ? `
        .up { position: absolute; inset: 0; opacity: 0; animation: armswap 5.6s ease-in-out infinite; }
        /* base fades out exactly while the raised-arm frame fades in, so only ONE
           frame is ever visible (was: base stayed at full opacity under .up = double image) */
        .base { animation: baseswap 5.6s ease-in-out infinite; }
        ` : ``}

        /* live terminal sitting on the CRT face */
        .screen {
          position: absolute; left: 30.4%; top: 33.4%; width: 21.6%; height: 15.6%;
          background: linear-gradient(#14323a, #0e2a31);
          border-radius: 13% / 18%; transform: rotate(-1.2deg); overflow: hidden;
          display: flex; align-items: center; gap: 0.12em;
          padding: 0 7%; font-family: var(--font-mono, monospace);
          font-size: ${Math.max(7, Math.round(size * 0.05))}px; line-height: 1;
          color: #5af0c0; letter-spacing: -0.02em; white-space: nowrap;
          animation: screenfade 5.6s ease-in-out infinite;
        }
        .screen .prompt { opacity: 0.9; }
        .screen .typed { color: #aef7df; }
        .screen .curs { animation: blinkc 1s steps(1) infinite; margin-left: 0.05em; }

        @keyframes blinkc { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
        @keyframes floaty { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        /* arm raised (explaining) holds mid-cycle, soft crossfades in/out */
        @keyframes armswap {
          0%,40% { opacity: 0; }
          49%,70% { opacity: 1; }
          79%,100% { opacity: 0; }
        }
        /* inverse of armswap: base shown when arm is down, hidden while arm is raised */
        @keyframes baseswap {
          0%,40% { opacity: 1; }
          49%,70% { opacity: 0; }
          79%,100% { opacity: 1; }
        }
        /* terminal text lives on the base frame, so hide it while the arm is up */
        @keyframes screenfade {
          0%,42% { opacity: 1; }
          50%,69% { opacity: 0; }
          80%,100% { opacity: 1; }
        }

        .bubble {
          position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
          margin-bottom: 14px; white-space: nowrap; max-width: 90vw;
          background: #ffffff; border: 1px solid #E6EAE8; color: #171E20;
          font-size: 12px; padding: 8px 12px; border-radius: 10px;
          box-shadow: 0 4px 16px rgba(16,24,40,0.10); font-family: var(--font-sans, sans-serif);
          transition: opacity 0.35s ease, transform 0.35s ease; z-index: 5;
        }
        .bubble.in { opacity: 1; transform: translateX(-50%) translateY(0); }
        .bubble.out { opacity: 0; transform: translateX(-50%) translateY(4px); }
        .bubble-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #0D9488; margin-right: 7px; vertical-align: middle; }
        .tail { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); width: 0; height: 0;
          border-left: 7px solid transparent; border-right: 7px solid transparent; border-top: 7px solid #E6EAE8; }
        .tail::after { content: ""; position: absolute; top: -8px; left: -6px; width: 0; height: 0;
          border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #ffffff; }

        @media (prefers-reduced-motion: reduce) {
          .gesture, .curs, .up, .base, .screen { animation: none; }
          .up { opacity: 0; }
          .base { opacity: 1; }
          .screen { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
