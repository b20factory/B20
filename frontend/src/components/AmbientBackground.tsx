// Ambient color field behind the whole app, ported from the Webora landing
// (soft capped blobs, heavy blur, low opacity, small slow drift) and recolored
// to the B20 palette: Base blue, beryl mint, warm amber. Pure CSS, fixed and
// non-interactive; animation is disabled under prefers-reduced-motion.
export default function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="ambient-blob"
        style={{ top: "-8%", left: "-6%", background: "#8FB0FF", animation: "ambient-drift-a 22s ease-in-out infinite" }}
      />
      <div
        className="ambient-blob"
        style={{ top: "28%", right: "-10%", background: "#5FE3CC", animation: "ambient-drift-b 26s ease-in-out infinite" }}
      />
      <div
        className="ambient-blob"
        style={{ bottom: "-12%", left: "22%", background: "#FFD9A0", animation: "ambient-drift-c 24s ease-in-out infinite" }}
      />
    </div>
  );
}
