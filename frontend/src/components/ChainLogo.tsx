// Chain badges for the token feed: every card carries the logo of the chain it
// launched on, the Base/B20 mark for native B20 tokens, the Robinhood feather
// for Robinhood Chain launches. Pure inline SVG, crisp at any size.

export function BaseLogo({ size = 14 }: { size?: number }) {
  // Official Base mark: solid blue circle with the flat left notch.
  return (
    <svg width={size} height={size} viewBox="0 0 111 111" fill="none" aria-label="Base">
      <path
        d="M54.921 110.034c30.438 0 55.113-24.6258 55.113-55.0017C110.034 24.6258 85.359 0 54.921 0 26.0432 0 2.35281 22.1714 0 50.3923h72.8467v9.2187H0C2.35281 87.8625 26.0432 110.034 54.921 110.034Z"
        fill="#0052FF"
      />
    </svg>
  );
}

export function RobinhoodLogo({ size = 14 }: { size?: number }) {
  // Simplified Robinhood feather mark in the brand green.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Robinhood Chain">
      <path
        d="M18.9 2.2c-2.6-.6-5.3-.1-7.6 1.3-2.1 1.3-3.8 3.3-5 5.6-1.4 2.7-2.2 5.8-2.6 8.9-.1.6-.1 1.2-.2 1.8 0 .3.2.5.5.4.5-.1.9-.3 1.3-.5 1.2-.6 2.2-1.5 3.1-2.5.2.9.6 1.8 1.2 2.5.2.2.5.2.7 0 .8-1 1.4-2.2 1.9-3.4.3-.8.6-1.7.8-2.5.9-.3 1.8-.7 2.6-1.2 1.9-1.2 3.5-2.9 4.6-4.9.8-1.4 1.4-3 1.7-4.6.1-.4-.2-.8-.6-.9h-2.4Zm-3.4 6.4c-.7 1.1-1.7 2-2.8 2.7.1-1 .1-2 .1-3 0-.3-.3-.6-.6-.5-1.1.1-2.1.5-3 1 .7-1.4 1.7-2.7 2.9-3.6 1.5-1.1 3.3-1.6 5.1-1.5-.4 1.8-1 3.5-1.7 4.9Z"
        fill="#00C805"
      />
    </svg>
  );
}

export function ChainBadge({ venue }: { venue: "base" | "robinhood" }) {
  if (venue === "robinhood") {
    return (
      <span className="chip text-[10px] px-1.5 py-0 gap-1 border-[#00C805]/30 text-[#00C805] shrink-0 inline-flex items-center">
        <RobinhoodLogo size={10} />
        Robinhood
      </span>
    );
  }
  return (
    <span className="chip text-[10px] px-1.5 py-0 gap-1 border-beryl/25 text-beryl/80 shrink-0 inline-flex items-center">
      <BaseLogo size={10} />
      B20
    </span>
  );
}
