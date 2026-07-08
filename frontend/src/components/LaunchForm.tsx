"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useLaunch, type LaunchInput } from "@/lib/useLaunch";
import { uploadImage } from "@/lib/upload";
import { getEthUsd, ETH_USD_FALLBACK } from "@/lib/ethPrice";
import { EXPLORER } from "@/lib/contracts";
import { RH, rhLive, type VenueId } from "@/lib/chains";
import { BaseLogo, RobinhoodLogo } from "@/components/ChainLogo";

export default function LaunchForm() {
  const { isConnected } = useAccount();
  const { launch, steps, busy, token } = useLaunch();
  const router = useRouter();
  const [venue, setVenue] = useState<VenueId>("base");
  const [f, setF] = useState<LaunchInput>({ name: "", symbol: "", startMcUsd: 10000, ethUsd: ETH_USD_FALLBACK, baseFeePct: 3, maxFeePct: 5, feeReceiveType: 0, imageUrl: "", website: "", x: "", github: "", telegram: "", description: "" });
  const upd = (k: keyof LaunchInput, v: any) => setF((p) => ({ ...p, [k]: v }));
  const rh = venue === "robinhood";

  // live ETH/USD so the starting-MC -> pool ETH conversion is accurate
  const [ethUsd, setEthUsd] = useState(ETH_USD_FALLBACK);
  const [priceLive, setPriceLive] = useState(false);
  useEffect(() => {
    let on = true;
    getEthUsd().then((p) => { if (on) { setEthUsd(p); setPriceLive(true); upd("ethUsd", p); } });
    return () => { on = false; };
  }, []);
  const [imgPreview, setImgPreview] = useState<string>("");
  const [imgUploading, setImgUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setImgPreview(URL.createObjectURL(file));
    setImgUploading(true);
    try {
      const url = await uploadImage(file);
      upd("imageUrl", url);
    } catch {
      upd("imageUrl", "");
    } finally {
      setImgUploading(false);
    }
  }
  const flat = f.baseFeePct === f.maxFeePct;
  const valid = f.name.trim() && f.symbol.trim() && f.maxFeePct >= f.baseFeePct;
  const pct = (v: number) => ((v - 1) / 4) * 100; // 1..5 -> 0..100
  const explorer = rh ? RH.explorer : EXPLORER;

  const chainBtn = (id: VenueId, label: string, logo: React.ReactNode, disabled?: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setVenue(id)}
      className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
        venue === id ? "border-beryl/50 bg-beryl/10 text-text" : "border-line text-muted hover:text-text"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {logo}
      {label}
      {disabled && <span className="text-[10px]">soon</span>}
    </button>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="card">
        <div className="h-sec mb-4">Choose a chain</div>
        <div className="flex gap-2 mb-6">
          {chainBtn("base", "Base", <BaseLogo size={15} />)}
          {chainBtn("robinhood", "Robinhood Chain", <RobinhoodLogo size={15} />, !rhLive)}
        </div>

        <div className="h-sec mb-5">Configure token</div>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">name</label>
              <input className="input" placeholder="Beryl Cat" value={f.name} onChange={(e) => upd("name", e.target.value)} />
            </div>
            <div>
              <label className="label">symbol</label>
              <input className="input uppercase tracking-wider" placeholder="BCAT" value={f.symbol} onChange={(e) => upd("symbol", e.target.value.toUpperCase().slice(0, 11))} />
            </div>
          </div>

          <div>
            <label className="label">token image <span className="text-muted font-normal">(optional)</span></label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
            <div
              className="input flex items-center gap-3 cursor-pointer hover:border-beryl-dim/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {imgPreview ? (
                <img src={imgPreview} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
              ) : (
                <span className="w-7 h-7 rounded border border-dashed border-line flex items-center justify-center text-muted text-lg shrink-0">+</span>
              )}
              <span className="text-text/50 text-sm truncate">
                {imgUploading ? "uploading…" : f.imageUrl ? "uploaded" : "click to upload image"}
              </span>
              {f.imageUrl && <span className="ml-auto text-[11px] text-beryl shrink-0">ready</span>}
            </div>
          </div>

          <div>
            <label className="label">bio <span className="text-muted font-normal">(optional)</span></label>
            <textarea className="input min-h-[64px] resize-y" placeholder="one or two sentences about the token" value={f.description} onChange={(e) => upd("description", e.target.value.slice(0, 280))} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">X <span className="text-muted font-normal">(opt)</span></label>
              <input className="input" placeholder="@berylcat" value={f.x} onChange={(e) => upd("x", e.target.value)} />
            </div>
            <div>
              <label className="label">GitHub <span className="text-muted font-normal">(opt)</span></label>
              <input className="input" placeholder="berylcat" value={f.github} onChange={(e) => upd("github", e.target.value)} />
            </div>
            <div>
              <label className="label">Telegram <span className="text-muted font-normal">(opt)</span></label>
              <input className="input" placeholder="berylcat" value={f.telegram} onChange={(e) => upd("telegram", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">website <span className="text-muted font-normal">(optional)</span></label>
            <input className="input" placeholder="berylcat.xyz" value={f.website} onChange={(e) => upd("website", e.target.value)} />
          </div>
          <p className="text-[11px] text-muted -mt-3">socials show on the token page and are ready to submit to DexScreener.</p>

          <div>
            <label className="label">{rh ? "graduation market cap" : "starting market cap"}</label>
            <div className="flex gap-2">
              {[5000, 10000, 25000].map((v) => (
                <button key={v} className={f.startMcUsd === v ? "chip-on" : "chip hover:border-beryl-dim/50"} onClick={() => upd("startMcUsd", v)}>${v / 1000}k</button>
              ))}
              <input className="input w-28 ml-auto" type="number" value={f.startMcUsd} onChange={(e) => upd("startMcUsd", Number(e.target.value))} />
            </div>
            <p className="text-[11px] text-muted mt-2">
              {rh ? (
                <>curve graduates to Uniswap v3 at ${f.startMcUsd.toLocaleString("en-US")}</>
              ) : (
                <>≈ {(f.startMcUsd / ethUsd).toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH pool ·
                <span className="text-text/60"> ETH ${ethUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                <span className={priceLive ? "text-beryl" : "text-warn"}> {priceLive ? "live" : "…"}</span></>
              )}
            </p>
          </div>

          {/* fee band — Base has a dynamic base/max band; Robinhood uses a single flat fee */}
          {rh ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="label !mb-0">trading fee</span>
                <span className="text-xs text-beryl">{f.baseFeePct}%</span>
              </div>
              <input type="range" min={1} max={5} step={0.5} value={f.baseFeePct} className="w-full"
                onChange={(e) => { const v = Number(e.target.value); upd("baseFeePct", v); upd("maxFeePct", v); }} />
              <p className="text-[11px] text-muted mt-2">flat fee charged on curve swaps, split creator / platform</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="label !mb-0">fee band</span>
                <span className="text-xs text-beryl">{flat ? `flat ${f.baseFeePct}%` : `${f.baseFeePct}% → ${f.maxFeePct}%`}</span>
              </div>
              <div className="relative h-1.5 rounded-full bg-line mb-4">
                <div className="absolute h-full rounded-full bg-beryl/50" style={{ left: `${pct(f.baseFeePct)}%`, right: `${100 - pct(f.maxFeePct)}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-[11px] text-muted mb-1"><span>base</span><span className="text-beryl">{f.baseFeePct}%</span></div>
                  <input type="range" min={1} max={5} step={0.5} value={f.baseFeePct} className="w-full"
                    onChange={(e) => { const v = Number(e.target.value); upd("baseFeePct", v); if (f.maxFeePct < v) upd("maxFeePct", v); }} />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-muted mb-1"><span>max</span><span className="text-beryl">{f.maxFeePct}%</span></div>
                  <input type="range" min={f.baseFeePct} max={5} step={0.5} value={f.maxFeePct} className="w-full"
                    onChange={(e) => upd("maxFeePct", Number(e.target.value))} />
                </div>
              </div>
              <p className="text-[11px] text-muted mt-2">
                {flat ? "flat fee — no dynamic ramp" : `dynamic — sits at ${f.baseFeePct}%, ramps to ${f.maxFeePct}% on volatility, then settles`}
              </p>
            </div>
          )}

          {/* how the CREATOR receives their fee share — Base only (platform is always ETH) */}
          {!rh && (
            <div>
              <label className="label">receive your fees in</label>
              <div className="flex gap-2">
                {[["ETH", 0], ["token", 1], ["both", 2]].map(([lbl, v]) => (
                  <button key={lbl as string}
                    className={`flex-1 ${f.feeReceiveType === v ? "chip-on" : "chip hover:border-beryl-dim/50"}`}
                    onClick={() => upd("feeReceiveType", v)}>{lbl as string}</button>
                ))}
              </div>
              <p className="text-[11px] text-muted mt-2">
                {f.feeReceiveType === 1 ? "your fee share is auto-bought back into the token and sent to you"
                  : f.feeReceiveType === 2 ? "half your fee share in ETH, half auto-bought back into the token"
                  : "your fee share paid in ETH"} · the platform cut is always ETH
              </p>
            </div>
          )}

          <button className="btn-primary w-full py-3 text-base" disabled={!isConnected || !valid || busy || imgUploading} onClick={async () => { try { const tok = await launch({ ...f, ethUsd, venue }); router.push(`/token/${tok}`); } catch {} }}>
            {!isConnected ? "Connect wallet to launch" : busy ? "Deploying…" : imgUploading ? "Uploading image…" : `Launch on ${rh ? "Robinhood Chain" : "Base"}`}
          </button>
          <p className="text-[11px] text-muted leading-relaxed">
            {rh
              ? "Fair bonding curve on Robinhood Chain · graduates to Uniswap v3 · 20% vested"
              : "Deploys via the 0xB20f… precompile · admin-less · 80% pool / 20% vested"}
          </p>
        </div>
      </div>

      {/* live deploy log */}
      <div className="console font-mono self-start">
        <div className="console-bar"><span className="console-dot" /><span className="console-dot" /><span className="console-dot" /><span className="ml-2 text-xs">deploy.log</span>{busy && <span className="ml-auto text-[11px] text-con-accent">running</span>}</div>
        <div className="p-4 text-[13px] leading-7 min-h-[300px]">
          {steps.length === 0 && <div className="text-con-muted">waiting for launch on {rh ? "Robinhood Chain" : "Base"}…<span className="cursor ml-2" /></div>}
          {steps.map((s) => (
            <div key={s.id} className={s.status === "ok" ? "text-con-ok" : s.status === "err" ? "text-con-err" : s.status === "run" ? "text-con-text" : "text-con-muted/70"}>
              <span className="inline-block w-4">{s.status === "ok" ? "✓" : s.status === "err" ? "✕" : s.status === "run" ? "›" : "·"}</span>
              {s.label}
              {s.note && <span className="text-con-muted"> — {s.note}</span>}
            </div>
          ))}
          {token && (
            <div className="mt-4 pt-3 border-t border-con-line space-y-2">
              <div className="text-con-ok">✓ token is live</div>
              <div className="text-[11px] text-con-muted break-all">CA {token}</div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-full border border-con-accent/40 bg-con-accent/10 px-3 py-1 text-xs text-con-accent hover:bg-con-accent/20 transition-colors" onClick={() => router.push(`/token/${token}`)}>Open token page</button>
                <a className="rounded-full border border-con-line px-3 py-1 text-xs text-con-muted hover:text-con-text transition-colors" href={`${explorer}/token/${token}`} target="_blank" rel="noreferrer">Explorer ↗</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
