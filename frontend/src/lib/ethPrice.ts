// Client helper for live ETH/USD (via /api/eth-price). Falls back to a constant
// so a launch never blocks on the price feed.
export const ETH_USD_FALLBACK = 3500;

export async function getEthUsd(): Promise<number> {
  try {
    const r = await fetch("/api/eth-price", { cache: "no-store" });
    const d = await r.json();
    return d?.usd > 0 ? Number(d.usd) : ETH_USD_FALLBACK;
  } catch {
    return ETH_USD_FALLBACK;
  }
}
