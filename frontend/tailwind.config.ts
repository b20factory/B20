import type { Config } from "tailwindcss";

// B20factory terminal theme. Beryl is a blue-green mineral, so the accent is an
// aquamarine/beryl cyan, paired with Base blue, on a near-black IDE background.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#06090a",          // terminal black
        panel: "#0b1012",       // slightly lifted panel
        panel2: "#0f1619",      // card
        line: "#16211f",        // hairline borders
        beryl: {
          DEFAULT: "#3df0d4",   // beryl / aquamarine accent
          dim: "#1c8b7e",
          glow: "#5ffbe6",
        },
        base: "#0052ff",        // Base blue
        muted: "#5b6b6a",
        text: "#cfe9e4",
        warn: "#ffcc66",
        bad: "#ff6b6b",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(61,240,212,.18), 0 0 24px -6px rgba(61,240,212,.25)",
      },
      keyframes: {
        blink: { "0%,49%": { opacity: "1" }, "50%,100%": { opacity: "0" } },
        flicker: { "0%,100%": { opacity: "1" }, "92%": { opacity: ".85" } },
      },
      animation: {
        blink: "blink 1s steps(1) infinite",
        flicker: "flicker 6s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
