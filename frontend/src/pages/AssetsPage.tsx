import React, { useState, useMemo } from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon, GradientButton, GradientText } from "../components/ui";
import { useIsMobile } from "../hooks";
import { useRWA } from "../hooks/useRWA";
import type { RWAAsset, RemittanceRoute, AllocRec, RWAType } from "../hooks/useRWA";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysToMaturity(ts: number | null): string {
  if (!ts) return "No maturity";
  const d = Math.max(0, Math.floor((ts - Date.now() / 1000) / 86400));
  return d === 0 ? "Matures today" : `${d}d left`;
}
function riskColor(score: number) {
  if (score < 40) return "#22c55e";
  if (score < 65) return "#f59e0b";
  return "#ef4444";
}
function riskLabel(score: number) {
  if (score < 40) return "Low";
  if (score < 65) return "Medium";
  return "High";
}

// ─── Asset card ───────────────────────────────────────────────────────────────

function AssetCard({ asset, usdc, yield_, TYPE_META, onInvest }: {
  asset: RWAAsset;
  usdc: (s: string) => string;
  yield_: (bps: number) => string;
  TYPE_META: ReturnType<typeof useRWA>["TYPE_META"];
  onInvest: (a: RWAAsset) => void;
}) {
  const meta  = TYPE_META[asset.type];
  const risk  = asset.isVerified ? 35 : 65;
  const gain  = Number(asset.currentValue) - Number(asset.faceValue);
  const gainPct = ((gain / Number(asset.faceValue)) * 100).toFixed(2);

  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 18, padding: 20, border: `1px solid rgba(255,255,255,0.06)`, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${meta.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MaterialIcon name={meta.icon} size={20} style={{ color: meta.color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>{asset.issuer}</span>
            {asset.isVerified && <MaterialIcon name="verified" size={14} style={{ color: "#60a5fa" }} />}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: `${meta.color}22`, color: meta.color }}>{meta.label}</span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: colors.surfaceContainerHigh, color: colors.outline }}>{asset.currency} · {asset.region}</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 800, color: colors.primary, fontFamily: fontFamily.headline }}>{yield_(asset.yieldBps)}</p>
          <p style={{ margin: 0, fontSize: 11, color: Number(gainPct) >= 0 ? "#22c55e" : "#ef4444" }}>
            {Number(gainPct) >= 0 ? "+" : ""}{gainPct}% value
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { label: "Face value",  value: `$${usdc(asset.faceValue)}`   },
          { label: "Current",     value: `$${usdc(asset.currentValue)}` },
          { label: "Matures",     value: daysToMaturity(asset.maturityDate) },
        ].map(m => (
          <div key={m.label} style={{ background: colors.surfaceContainerHigh, borderRadius: 10, padding: "10px 12px" }}>
            <p style={{ margin: "0 0 3px", fontSize: 10, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Risk bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: colors.outline }}>Risk score</span>
          <span style={{ fontSize: 11, color: riskColor(risk), fontWeight: 700 }}>{riskLabel(risk)} ({risk}/100)</span>
        </div>
        <div style={{ background: colors.surfaceContainerHigh, borderRadius: 4, height: 5, overflow: "hidden" }}>
          <div style={{ width: `${risk}%`, height: "100%", background: `linear-gradient(90deg, #22c55e, ${riskColor(risk)})`, borderRadius: 4 }} />
        </div>
      </div>

      <GradientButton onClick={() => onInvest(asset)} size="sm">
        Invest in this asset →
      </GradientButton>
    </div>
  );
}

// ─── Route card ───────────────────────────────────────────────────────────────

const FLAG: Record<string, string> = { ZAR:"🇿🇦", NGN:"🇳🇬", KES:"🇰🇪", GHS:"🇬🇭", ETB:"🇪🇹", EGP:"🇪🇬", TZS:"🇹🇿", MZN:"🇲🇿", UGX:"🇺🇬" };

function RouteCard({ route }: { route: RemittanceRoute }) {
  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 14, padding: "16px 18px", border: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ fontSize: 24, flexShrink: 0 }}>{FLAG[route.sourceCurrency] ?? "🌍"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>
            {route.sourceCurrency} → {route.targetCurrency}
          </span>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: "#22c55e22", color: "#22c55e" }}>Live</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: colors.outline }}>
          1 {route.targetCurrency} = {route.exchangeRate} {route.sourceCurrency} · {route.fee / 100}% fee · ~{route.estimatedSettlementSecs}s
        </p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: colors.primary, fontFamily: fontFamily.headline }}>{route.provider}</p>
        <p style={{ margin: 0, fontSize: 11, color: colors.outline }}>on Stellar</p>
      </div>
    </div>
  );
}

// ─── Recommendation card ──────────────────────────────────────────────────────

function RecCard({ rec, asset, TYPE_META, yield_ }: {
  rec:      AllocRec;
  asset?:   RWAAsset;
  yield_:   (bps: number) => string;
  TYPE_META: ReturnType<typeof useRWA>["TYPE_META"];
}) {
  const meta = TYPE_META[rec.type];
  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 14, padding: "16px 18px", border: `1px solid ${colors.primaryContainer}28`, display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: `${meta.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <MaterialIcon name={meta.icon} size={18} style={{ color: meta.color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>{asset?.issuer ?? rec.assetId}</span>
          <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, background: `${colors.primary}22`, color: colors.primary, fontWeight: 700 }}>
            {(rec.recommendedAllocationBps / 100).toFixed(1)}% allocation
          </span>
        </div>
        <p style={{ margin: "0 0 6px", fontSize: 12, color: colors.outline, lineHeight: 1.5 }}>{rec.rationale}</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: colors.primary }}>📈 {yield_(rec.expectedYieldBps)}</span>
          <span style={{ fontSize: 12, color: riskColor(rec.riskScore) }}>⚡ Risk {riskLabel(rec.riskScore)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Invest modal ─────────────────────────────────────────────────────────────

function InvestModal({ asset, usdc, yield_, onClose }: {
  asset:  RWAAsset;
  usdc:   (s: string) => string;
  yield_: (bps: number) => string;
  onClose:() => void;
}) {
  const [amount,  setAmount]  = useState("");
  const [step,    setStep]    = useState<"form" | "done">("form");
  const [loading, setLoading] = useState(false);

  const invest = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 1100));
    setLoading(false);
    setStep("done");
  };

  const estimatedYield = amount ? ((Number(amount) * asset.yieldBps) / 10000).toFixed(2) : "—";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 24, padding: 28, maxWidth: 420, width: "100%", border: `1px solid rgba(255,255,255,0.08)`, animation: "blurIn 0.25s ease both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <GradientText style={{ fontSize: 18, fontWeight: 800, fontFamily: fontFamily.headline }}>Invest in RWA</GradientText>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: colors.outline }}><MaterialIcon name="close" size={22} /></button>
        </div>

        {step === "form" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: colors.surfaceContainerHigh, borderRadius: 14, padding: "14px 16px" }}>
              <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>{asset.issuer}</p>
              <p style={{ margin: 0, fontSize: 12, color: colors.outline }}>{asset.type.replace("_", " ")} · {asset.currency} · {yield_(asset.yieldBps)}</p>
            </div>

            <div>
              <label style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
                Amount (USDC)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100"
                  style={{ background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "12px 60px 12px 14px", color: colors.onSurface, fontSize: 15, outline: "none", fontFamily: fontFamily.body, width: "100%", boxSizing: "border-box" as const }}
                />
                <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: colors.outline, fontWeight: 700 }}>USDC</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {["100", "500", "1000"].map(v => (
                  <button key={v} onClick={() => setAmount(v)} style={{ flex: 1, padding: "6px", borderRadius: 8, border: `1px solid rgba(255,255,255,0.1)`, background: amount === v ? `${colors.primary}22` : "transparent", color: amount === v ? colors.primary : colors.outline, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.body }}>
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {amount && Number(amount) > 0 && (
              <div style={{ background: `${colors.primary}12`, borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  ["You invest",        `$${amount} USDC`],
                  ["Expected annual yield", `$${estimatedYield} USDC`],
                  ["Yield rate",        yield_(asset.yieldBps)],
                  ["Maturity",          daysToMaturity(asset.maturityDate)],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: colors.outline }}>{k}</span>
                    <span style={{ fontSize: 12, color: colors.onSurface, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: `${colors.outline}12`, borderRadius: 10, padding: "10px 14px", display: "flex", gap: 8 }}>
              <MaterialIcon name="info" size={14} style={{ color: colors.outline, flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 11, color: colors.outline, lineHeight: 1.5 }}>
                RWA investments are illiquid until maturity. Only invest what you can hold to term.
              </p>
            </div>

            <GradientButton onClick={invest} disabled={!amount || Number(amount) <= 0 || loading} size="lg">
              {loading ? "Processing…" : `Invest $${amount || "0"} USDC →`}
            </GradientButton>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "16px 0", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 52 }}>🌍</div>
            <div>
              <p style={{ color: "#22c55e", fontSize: 18, fontWeight: 800, fontFamily: fontFamily.headline, margin: "0 0 6px" }}>Investment confirmed!</p>
              <p style={{ color: colors.outline, fontSize: 13, margin: 0 }}>
                ${amount} USDC allocated to {asset.issuer}
              </p>
            </div>
            <div style={{ background: colors.surfaceContainerHigh, borderRadius: 12, padding: "14px" }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: colors.outline }}>Estimated return at maturity</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.primary, fontFamily: fontFamily.headline }}>
                ${(Number(amount) * (1 + asset.yieldBps / 10000)).toFixed(2)} USDC
              </p>
            </div>
            <GradientButton onClick={onClose} size="lg">Done</GradientButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "assets" | "corridors" | "optimize";

const TYPE_FILTERS: { value: RWAType | "all"; label: string }[] = [
  { value: "all",          label: "All"           },
  { value: "invoice",      label: "Invoices"      },
  { value: "carbon_credit",label: "Carbon"        },
  { value: "commodity",    label: "Commodities"   },
  { value: "trade_finance",label: "Trade Finance" },
];

export const AssetsPage: React.FC = () => {
  const isMobile = useIsMobile();
  const { assets, routes, recs, loading, usingMock, optimize, usdc, yield_, TYPE_META } = useRWA();

  const [tab,         setTab]         = useState<Tab>("assets");
  const [typeFilter,  setTypeFilter]  = useState<RWAType | "all">("all");
  const [investing,   setInvesting]   = useState<RWAAsset | null>(null);
  const [optimizing,  setOptimizing]  = useState(false);

  const displayed = useMemo(() =>
    typeFilter === "all" ? assets : assets.filter(a => a.type === typeFilter),
    [assets, typeFilter]
  );

  const totalTVL = assets.reduce((s, a) => s + Number(a.currentValue), 0);
  const avgYield = assets.length > 0 ? assets.reduce((s, a) => s + a.yieldBps, 0) / assets.length : 0;
  const verified = assets.filter(a => a.isVerified).length;

  const handleOptimize = async () => {
    setOptimizing(true);
    await optimize();
    setOptimizing(false);
    setTab("optimize");
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${colors.primaryContainer}`, borderTopColor: colors.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <span style={{ color: colors.outline, fontFamily: fontFamily.body }}>Loading RWA assets…</span>
        </div>
      </div>
    );
  }

  return (
    <section className="blur-in" style={{ padding: isMobile ? 16 : 32, maxWidth: 1100, margin: "0 auto" }}>
      {investing && (
        <InvestModal asset={investing} usdc={usdc} yield_={yield_} onClose={() => setInvesting(null)} />
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <GradientText style={{ fontSize: isMobile ? 24 : 30, fontWeight: 900, fontFamily: fontFamily.headline }}>
              African Assets
            </GradientText>
            {usingMock && (
              <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: `${colors.tertiary}22`, color: colors.tertiary, border: `1px solid ${colors.tertiary}44` }}>Demo</span>
            )}
          </div>
          <p style={{ color: colors.outline, fontSize: 14, margin: 0 }}>
            Tokenized real-world assets — invoices, carbon credits, commodities, trade finance
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleOptimize} disabled={optimizing}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 12, background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, color: colors.primary, cursor: "pointer", fontSize: 13, fontFamily: fontFamily.headline }}>
            <MaterialIcon name="auto_awesome" size={16} style={{ color: colors.primary }} />
            {optimizing ? "Optimizing…" : "AI Optimize"}
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { icon: "storefront",       label: "Assets listed",  value: `${assets.length}`,                     color: colors.primary  },
          { icon: "attach_money",     label: "Total TVL",      value: `$${(totalTVL / 1e7 / 1000).toFixed(0)}k USDC`, color: colors.tertiary },
          { icon: "trending_up",      label: "Avg yield",      value: yield_(Math.round(avgYield)),            color: "#22c55e"       },
          { icon: "verified",         label: "Verified",       value: `${verified} / ${assets.length}`,        color: "#60a5fa"       },
        ].map(s => (
          <div key={s.label} style={{ background: colors.surfaceContainerLow, borderRadius: 14, padding: "16px 18px", border: `1px solid rgba(255,255,255,0.05)` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <MaterialIcon name={s.icon} size={14} style={{ color: s.color }} />
              <span style={{ fontSize: 10, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{s.label}</span>
            </div>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800, fontFamily: fontFamily.headline, color: colors.onSurface }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Region chips ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: colors.outline, marginRight: 4 }}>Regions:</span>
        {["Southern Africa 🇿🇦", "East Africa 🇰🇪", "West Africa 🇳🇬", "North Africa 🇪🇬"].map(r => (
          <span key={r} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 20, background: colors.surfaceContainerHigh, color: colors.onSurface, border: `1px solid rgba(255,255,255,0.08)` }}>
            {r}
          </span>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: colors.surfaceContainerLow, borderRadius: 12, padding: 4, width: "fit-content" }}>
        {([
          { key: "assets",    icon: "storefront",   label: `Assets (${assets.length})`      },
          { key: "corridors", icon: "swap_horiz",   label: `Corridors (${routes.length})`   },
          { key: "optimize",  icon: "auto_awesome", label: `AI Picks${recs.length > 0 ? ` (${recs.length})` : ""}` },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ display: "flex", alignItems: "center", gap: isMobile ? 0 : 7, padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontFamily: fontFamily.headline, fontWeight: tab === t.key ? 700 : 400, background: tab === t.key ? colors.primary : "transparent", color: tab === t.key ? "#000" : colors.outline, transition: "all 0.2s" }}>
            <MaterialIcon name={t.icon} size={15} />
            {!isMobile && t.label}
            {isMobile && <span style={{ fontSize: 10, marginTop: 2 }}>{t.key === "assets" ? assets.length : t.key === "corridors" ? routes.length : recs.length}</span>}
          </button>
        ))}
      </div>

      {/* ── Assets tab ── */}
      {tab === "assets" && (
        <>
          {/* Type filter */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {TYPE_FILTERS.map(f => (
              <button key={f.value} onClick={() => setTypeFilter(f.value)}
                style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${typeFilter === f.value ? colors.primary : "rgba(255,255,255,0.1)"}`, background: typeFilter === f.value ? `${colors.primary}22` : "transparent", color: typeFilter === f.value ? colors.primary : colors.outline, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.headline }}>
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            {displayed.map(a => (
              <AssetCard key={a.assetId} asset={a} usdc={usdc} yield_={yield_} TYPE_META={TYPE_META} onInvest={setInvesting} />
            ))}
          </div>
        </>
      )}

      {/* ── Corridors tab ── */}
      {tab === "corridors" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: `${colors.primary}12`, border: `1px solid ${colors.primary}25`, borderRadius: 14, padding: "14px 18px", display: "flex", gap: 12 }}>
            <MaterialIcon name="info" size={16} style={{ color: colors.primary, flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 13, color: colors.outline, lineHeight: 1.5 }}>
              Rates update in real-time via Stellar's SDEX and AMM pools. Settlement under 30 seconds to any Stellar address.
            </p>
          </div>
          {routes.map(r => <RouteCard key={r.corridorId} route={r} />)}

          {/* Comparison vs SWIFT */}
          <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 20, border: `1px solid rgba(255,255,255,0.06)`, marginTop: 8 }}>
            <p style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>VeilVault vs traditional rails</p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "Settlement", veil: "< 30 seconds",  swift: "2–5 days"      },
                { label: "Fee",        veil: "0.5–0.75%",     swift: "3–7%"          },
                { label: "Hours",      veil: "24/7/365",      swift: "Business hours"},
              ].map(r => (
                <div key={r.label} style={{ background: colors.surfaceContainerHigh, borderRadius: 10, padding: "12px 14px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{r.label}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.primary, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: colors.primary, fontWeight: 700 }}>{r.veil}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.outline, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: colors.outline }}>{r.swift}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Optimize tab ── */}
      {tab === "optimize" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {recs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: `${colors.primary}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcon name="auto_awesome" size={32} style={{ color: colors.primary, opacity: 0.7 }} />
              </div>
              <div>
                <p style={{ color: colors.onSurface, fontSize: 16, fontFamily: fontFamily.headline, margin: "0 0 6px" }}>No recommendations yet</p>
                <p style={{ color: colors.outline, fontSize: 13, margin: "0 0 20px" }}>Let the AI optimizer find the best allocation for your vault</p>
              </div>
              <GradientButton onClick={handleOptimize} disabled={optimizing}>
                <MaterialIcon name="auto_awesome" size={16} /> {optimizing ? "Analyzing…" : "Run AI Optimizer"}
              </GradientButton>
            </div>
          ) : (
            <>
              {/* Allocation summary */}
              <div style={{ background: `linear-gradient(135deg, ${colors.primaryContainer}18, ${colors.tertiary}10)`, borderRadius: 18, padding: "20px", border: `1px solid ${colors.primaryContainer}28` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <MaterialIcon name="auto_awesome" size={20} style={{ color: colors.primary }} />
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: colors.onSurface, fontFamily: fontFamily.headline }}>AI Recommended Allocation</p>
                </div>
                <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", height: 12, marginBottom: 10 }}>
                  {recs.map(r => {
                    const meta = TYPE_META[r.type];
                    return (
                      <div key={r.assetId}
                        style={{ flex: r.recommendedAllocationBps, background: meta.color, transition: "flex 0.5s ease" }}
                        title={`${(r.recommendedAllocationBps / 100).toFixed(1)}% — ${r.assetId}`}
                      />
                    );
                  })}
                  <div style={{ flex: 10000 - recs.reduce((s, r) => s + r.recommendedAllocationBps, 0), background: colors.surfaceContainerHigh }} />
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {recs.map(r => {
                    const meta = TYPE_META[r.type];
                    return (
                      <div key={r.assetId} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: meta.color }} />
                        <span style={{ fontSize: 11, color: colors.outline }}>{meta.label} {(r.recommendedAllocationBps / 100).toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {recs.map(r => (
                <RecCard
                  key={r.assetId}
                  rec={r}
                  asset={assets.find(a => a.assetId === r.assetId)}
                  yield_={yield_}
                  TYPE_META={TYPE_META}
                />
              ))}

              <div style={{ display: "flex", gap: 10 }}>
                <GradientButton onClick={handleOptimize} disabled={optimizing} size="sm">
                  <MaterialIcon name="refresh" size={14} /> Re-optimize
                </GradientButton>
                <button style={{ padding: "9px 18px", borderRadius: 12, background: colors.surfaceContainerHigh, border: "none", color: colors.primary, cursor: "pointer", fontSize: 13, fontFamily: fontFamily.headline, display: "flex", alignItems: "center", gap: 8 }}>
                  <MaterialIcon name="download" size={14} /> Export report
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};
