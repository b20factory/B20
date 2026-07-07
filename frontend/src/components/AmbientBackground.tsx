// Slow-drifting ambient color field behind the whole app. Pure CSS (no JS work
// per frame), fixed and non-interactive, so it costs nothing on scroll. Colors
// stay in the site palette (beryl teal + Base blue + a warm paper tint) and are
// soft enough to keep text contrast on the light theme. Disabled entirely for
// prefers-reduced-motion users via globals.css.
export default function AmbientBackground() {
  return (
    <div aria-hidden className="ambient" >
      <div className="ambient-blob ambient-a" />
      <div className="ambient-blob ambient-b" />
      <div className="ambient-blob ambient-c" />
      <div className="ambient-grain" />
    </div>
  );
}
