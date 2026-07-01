import type { Config } from "tailwindcss";

// B20factory — professional Base-ecosystem theme.
// Light "paper" surfaces + Base blue actions + beryl (the mineral) as the brand
// accent. The only dark surface is the console (a real product feature), which
// gets its own `con` palette so text stays readable there.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#FBFBF9",          // warm paper page background
        panel: "#FFFFFF",       // cards
        panel2: "#F4F6F5",      // subtle inset surfaces
        line: "#E6EAE8",        // hairline borders
        beryl: {
          DEFAULT: "#0D9488",   // beryl teal, readable on white
          dim: "#8BBBB4",       // soft borders / secondary accents
          glow: "#0A7C71",      // hover / emphasis (darker, no glow)
        },
        brand: "#0052FF",       // Base blue — primary actions, matches the B20 icon
        brandDark: "#0040CC",
        muted: "#667572",
        text: "#171E20",
        warn: "#B45309",
        bad: "#D92D20",
        // console (dark code/terminal panels only)
        con: {
          bg: "#0E1413",
          bar: "#121A19",
          line: "#20302D",
          text: "#D7E2DE",
          muted: "#748582",
          accent: "#2FD4BC",
          ok: "#4ADE80",
          err: "#F87171",
          warn: "#FBBF24",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        lift: "0 2px 4px rgba(16,24,40,0.05), 0 12px 24px -8px rgba(16,24,40,0.12)",
        console: "0 4px 8px rgba(6,12,10,0.24), 0 24px 48px -16px rgba(6,12,10,0.36)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        caret: { "0%,60%": { opacity: "1" }, "61%,100%": { opacity: "0.15" } },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        caret: "caret 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
