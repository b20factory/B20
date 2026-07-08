// Client helpers + shared message format for the agent registry (/api/agents).

export function registerMessage(name: string, address: string): string {
  return `b20factory agent registration\nname: ${name}\naddress: ${address.toLowerCase()}`;
}

export async function getAgents(): Promise<Record<string, string>> {
  try {
    const r = await fetch("/api/agents", { cache: "no-store" });
    if (!r.ok) return {};
    return (await r.json()) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function registerAgent(
  address: string,
  name: string,
  sig: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, name, sig }),
    });
    return (await r.json()) as { ok: boolean; error?: string };
  } catch {
    return { ok: false, error: "network error" };
  }
}

/** Short display form for a wallet address. */
export function shortAddr(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}
