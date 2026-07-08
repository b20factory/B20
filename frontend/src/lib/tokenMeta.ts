// Client helpers for the off-chain token metadata store (/api/token-meta).
export type TokenMeta = {
  token: string;
  venue?: "base" | "robinhood";
  image?: string;
  website?: string;
  x?: string;
  github?: string;
  telegram?: string;
  description?: string;
  creator?: string;
  name?: string;
  symbol?: string;
  ts?: number;
};

export async function saveTokenMeta(m: TokenMeta): Promise<void> {
  try {
    await fetch("/api/token-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m),
    });
  } catch {
    // non-fatal: the token is already on-chain, metadata is best-effort
  }
}

export async function getTokenMeta(token: string): Promise<TokenMeta | null> {
  try {
    const r = await fetch(`/api/token-meta?token=${token}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as TokenMeta | null;
  } catch {
    return null;
  }
}

export async function getAllTokenMeta(): Promise<Record<string, TokenMeta>> {
  try {
    const r = await fetch("/api/token-meta", { cache: "no-store" });
    if (!r.ok) return {};
    return (await r.json()) as Record<string, TokenMeta>;
  } catch {
    return {};
  }
}
