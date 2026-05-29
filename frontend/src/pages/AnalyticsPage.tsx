import React, { useState, useMemo } from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon, GradientText } from "../components/ui";
import { useIsMobile } from "../hooks";

// ─── Mock data generation ─────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NOW_MONTH = new Date().getMonth();

function genSeries(base: number, volatility: number, n: number, trend: number): number[] {
  const out: number[] = [base];
  for (let i = 1; i < n; i++) {
    const delta = (Math.random() - 0.45) * volatility + trend;
    out.push(Math.max(0, out[i - 1] + delta));
  }
  return out;
}

const PORTFOLIO_SERIES = genSeries(1200,  120, 12, 80);
const YIELD_SERIES     = genSeries(0,     25,  12, 22);
const STOKVEL_SERIES   = genSeries(0,     5,   12, 12);

const ALLOCATION = [
  { label: "Vaults",       value: 38, color: colors.primary   },
  { label: "Stokvel",      value: 22, color: colors.tertiary  },
  { label: "RWA",          value: 18, color: "#60a5fa"        },
  { label: "Privacy Pool", value: 12, color: "#a78bfa"        },
  { label: "Cash (XLM)",   value: 10, color: colors.outline   },
];

const ACTIVITY = [
  { icon: "trending_up",    color: "#22c55e", label: "Yield harvested",          amount: "+0.32 XLM",   time: "Today"      },
  { icon: "payments",       color: colors.primary, label: "Stokvel contribution", amount: "-10 XLM",     time: "2 days ago" },
  { icon: "lock",           color: "#a78bfa",  label: "Private deposit",          amount: "-10 XLM",    time: "5 days ago" },
  { icon: "storefront",     color: "#60a5fa",  label: "RWA invested",             amount: "-$500 USDC", time: "8 days ago" },
  { icon: "bolt",           color: colors.primary, label: "Strategy executed",    amount: "3.5 XLM",    time: "10 days ago"},
  { icon: "arrow_downward", color: "#22c55e",  label: "Payment received",         amount: "+50 XLM",    time: "12 days ago"},
  { icon: "send",           color: colors.outline, label: "Remittance sent",      amount: "-25 XLM",    time: "15 days ago"},
];

// ─── SVG chart helpers ────────────────────────────────────────────────────────

function seriesPath(data: number[], w: number, h: number, pad = 12): { line: string; area: string } {
  const min  = Math.min(...data);
  const max  = Math.max(...data);
  const rng  = max - min || 1;
  const xs   = data.map((_, i) => pad + (i / (data.length - 1)) * (w - pad * 2));
  const ys   = data.map(v => pad + (1 - (v - min) / rng) * (h - pad * 2));

  const pts  = xs.map((x, i) => `${x},${ys[i]}`);
  // Build smooth bezier segments
  let line = `M ${pts[0]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1].split(",").map(Number);
    const [cx, cy] = pts[i].split(",").map(Number);
    const mx = (px + cx) / 2;
    line += ` C ${mx},${py} ${mx},${cy} ${cx},${cy}`;
  }
  const area = `${line} L ${xs[xs.length - 1]},${h - pad} L ${xs[0]},${h - pad} Z`;
  return { line, area };
}

// ─── Line chart ───────────────────────────────────────────────────────────────

function LineChart({ data, color, label, formatY = (v: number) => v.toFixed(0), h = 160 }: {
  data:    number[];
  color:   string;
  label:   string;
  formatY?: (v: number) => string;
  h?:      number;
}) {
  const W = 460;
  const { line, area } = seriesPath(data, W, h);
  const current = data[data.length - 1];
  const prev    = data[data.length - 2] ?? data[0];
  const pct     = ((current - prev) / Math.max(prev, 0.01) * 100);
  const months  = MONTHS.slice(0, data.length).map((_, i) => MONTHS[(NOW_MONTH - data.length + 1 + i + 12) % 12]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 4 }}>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{label}</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.onSurface, fontFamily: fontFamily.headline }}>
            {formatY(current)}
          </p>
        </div>
        <span style={{ alignSelf: "flex-end", fontSize: 13, fontWeight: 700, color: pct >= 0 ? "#22c55e" : "#ef4444", padding: "3px 10px", borderRadius: 20, background: pct >= 0 ? "#22c55e18" : "#ef444418" }}>
          {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${h}`} style={{ width: "100%", overflow: "visible" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${label.replace(/\s/g,"")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#grad-${label.replace(/\s/g,"")})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      </svg>
      {/* X-axis labels — show only every other month */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {months.filter((_, i) => i % 2 === 0 || i === months.length - 1).map((m, i) => (
          <span key={i} style={{ fontSize: 10, color: colors.outline }}>{m}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({ data, color, label, formatY = (v: number) => v.toFixed(1) }: {
  data:    number[];
  color:   string;
  label:   string;
  formatY?: (v: number) => string;
}) {
  const max     = Math.max(...data, 0.01);
  const months  = data.map((_, i) => MONTHS[(NOW_MONTH - data.length + 1 + i + 12) % 12]);
  const total   = data.reduce((a, b) => a + b, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{label}</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: colors.onSurface, fontFamily: fontFamily.headline }}>{formatY(total)}</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: "100%", background: `${color}22`, borderRadius: "4px 4px 0 0", position: "relative", height: `${(v / max) * 72}px`, minHeight: 4, transition: "height 0.4s ease" }}>
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${color}, ${color}88)`, borderRadius: "4px 4px 0 0" }} />
            </div>
            <span style={{ fontSize: 9, color: colors.outline }}>{months[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total  = segments.reduce((s, x) => s + x.value, 0);
  const R      = 56;
  const cx     = 80;
  const cy     = 80;
  const stroke = 18;
  let angle    = -90;

  const arcs = segments.map(seg => {
    const deg  = (seg.value / total) * 360;
    const rad1 = (angle * Math.PI) / 180;
    const rad2 = ((angle + deg - 0.5) * Math.PI) / 180;
    const x1   = cx + R * Math.cos(rad1);
    const y1   = cy + R * Math.sin(rad1);
    const x2   = cx + R * Math.cos(rad2);
    const y2   = cy + R * Math.sin(rad2);
    const large = deg > 180 ? 1 : 0;
    const path  = `M ${x1},${y1} A ${R},${R} 0 ${large} 1 ${x2},${y2}`;
    angle += deg;
    return { ...seg, path };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={160} height={160} style={{ flexShrink: 0 }}>
        {arcs.map((a, i) => (
          <path key={i} d={a.path} fill="none" stroke={a.color} strokeWidth={stroke} strokeLinecap="butt" />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fill={colors.onSurface} fontSize={13} fontWeight={800} fontFamily={fontFamily.headline}>
          {total}%
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill={colors.outline} fontSize={10}>
          allocated
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 120 }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: colors.onSurface }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Privacy gauge ────────────────────────────────────────────────────────────

function PrivacyGauge({ score }: { score: number }) {
  const R   = 48;
  const cx  = 80;
  const cy  = 80;
  const circ = Math.PI * R;              // half circumference
  const dash  = (score / 100) * circ;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width={160} height={96} viewBox="0 0 160 100">
        {/* Track */}
        <path d={`M ${cx - R},${cy} A ${R},${R} 0 0 1 ${cx + R},${cy}`}
          fill="none" stroke={colors.surfaceContainerHigh} strokeWidth={14} strokeLinecap="round" />
        {/* Fill */}
        <path d={`M ${cx - R},${cy} A ${R},${R} 0 0 1 ${cx + R},${cy}`}
          fill="none"
          stroke={score > 66 ? colors.primary : score > 33 ? "#f59e0b" : "#ef4444"}
          strokeWidth={14} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.3s" }}
        />
        <text x={cx} y={cy - 8} textAnchor="middle" fill={colors.onSurface} fontSize={22} fontWeight={800} fontFamily={fontFamily.headline}>
          {score}%
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill={colors.outline} fontSize={10}>
          private
        </text>
      </svg>
      <p style={{ margin: 0, fontSize: 12, color: colors.outline, textAlign: "center" }}>
        {score > 66 ? "Strong privacy posture" : score > 33 ? "Moderate privacy" : "Low privacy score"}
      </p>
    </div>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function Metric({ icon, label, value, sub, color = colors.primary, trend }: {
  icon: string; label: string; value: string; sub?: string; color?: string; trend?: number;
}) {
  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: "18px 20px", border: `1px solid rgba(255,255,255,0.05)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <MaterialIcon name={icon} size={16} style={{ color, opacity: 0.8 }} />
        <span style={{ fontSize: 11, color: colors.outline, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 24, fontWeight: 800, fontFamily: fontFamily.headline, color: colors.onSurface }}>{value}</p>
        {trend !== undefined && (
          <span style={{ fontSize: 12, fontWeight: 700, color: trend >= 0 ? "#22c55e" : "#ef4444" }}>
            {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
          </span>
        )}
      </div>
      {sub && <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.outline }}>{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TimeRange = "1M" | "3M" | "6M" | "1Y";

export const AnalyticsPage: React.FC = () => {
  const isMobile = useIsMobile();
  const [range,    setRange]    = useState<TimeRange>("1Y");
  const [hidden,   setHidden]   = useState(false);   // privacy — hide values

  // Slice data by range
  const n = { "1M": 4, "3M": 6, "6M": 9, "1Y": 12 }[range];
  const portfolio = useMemo(() => PORTFOLIO_SERIES.slice(-n), [n]);
  const yield_s   = useMemo(() => YIELD_SERIES.slice(-n),     [n]);
  const stokvel_s = useMemo(() => STOKVEL_SERIES.slice(-n),   [n]);

  const totalPortfolio = portfolio[portfolio.length - 1];
  const totalYield     = yield_s.reduce((a, b) => a + b, 0);
  const portfolioPct   = ((totalPortfolio - portfolio[0]) / Math.max(portfolio[0], 0.01) * 100);
  const yieldPct       = totalPortfolio > 0 ? (totalYield / totalPortfolio * 100) : 0;
  const privacyScore   = 72;

  const mask = (v: string) => hidden ? "••••" : v;

  return (
    <section className="blur-in" style={{ padding: isMobile ? 16 : 32, maxWidth: 1100, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <GradientText style={{ fontSize: isMobile ? 24 : 30, fontWeight: 900, fontFamily: fontFamily.headline, display: "block", marginBottom: 6 }}>
            Analytics
          </GradientText>
          <p style={{ color: colors.outline, fontSize: 14, margin: 0 }}>
            Private performance dashboard — only you can see this
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Hide values */}
          <button onClick={() => setHidden(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: colors.surfaceContainerHigh, border: `1px solid rgba(255,255,255,0.1)`, color: colors.outline, cursor: "pointer", fontSize: 13, fontFamily: fontFamily.headline }}>
            <MaterialIcon name={hidden ? "visibility_off" : "visibility"} size={16} />
            {hidden ? "Show" : "Hide"}
          </button>
          {/* Time range */}
          <div style={{ display: "flex", gap: 3, background: colors.surfaceContainerLow, borderRadius: 10, padding: 3 }}>
            {(["1M","3M","6M","1Y"] as TimeRange[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontFamily: fontFamily.headline, fontWeight: range === r ? 700 : 400, background: range === r ? colors.primary : "transparent", color: range === r ? "#000" : colors.outline, transition: "all 0.2s" }}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Key metrics ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <Metric icon="account_balance"  label="Portfolio"     value={mask(`${totalPortfolio.toFixed(0)} XLM`)}  trend={hidden ? undefined : portfolioPct}  color={colors.primary} />
        <Metric icon="trending_up"      label="Yield earned"  value={mask(`${totalYield.toFixed(1)} XLM`)}      sub={mask(`${yieldPct.toFixed(2)}% return`)} color="#22c55e"       />
        <Metric icon="groups"           label="Stokvel pot"   value={mask("60 XLM")}                            sub="4 members"                              color={colors.tertiary} />
        <Metric icon="privacy_tip"      label="Private txns"  value={mask("3 of 7")}                            sub={`${privacyScore}% privacy score`}       color="#a78bfa"       />
      </div>

      {/* ── Main chart ── */}
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 20, padding: 24, border: `1px solid rgba(255,255,255,0.05)`, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>Portfolio Value</p>
          <span style={{ fontSize: 11, color: colors.outline }}>All assets combined</span>
        </div>
        {hidden ? (
          <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: colors.outline, fontSize: 14 }}>Values hidden</p>
          </div>
        ) : (
          <LineChart
            data={portfolio}
            color={colors.primary}
            label="Total value"
            formatY={v => `${v.toFixed(0)} XLM`}
            h={160}
          />
        )}
      </div>

      {/* ── Two charts row ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* Yield chart */}
        <div style={{ background: colors.surfaceContainerLow, borderRadius: 18, padding: 22, border: `1px solid rgba(255,255,255,0.05)` }}>
          <p style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>Monthly Yield</p>
          {hidden ? (
            <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ color: colors.outline, fontSize: 13 }}>Hidden</p>
            </div>
          ) : (
            <BarChart data={yield_s} color="#22c55e" label="Yield earned" formatY={v => `${v.toFixed(1)} XLM`} />
          )}
        </div>

        {/* Stokvel chart */}
        <div style={{ background: colors.surfaceContainerLow, borderRadius: 18, padding: 22, border: `1px solid rgba(255,255,255,0.05)` }}>
          <p style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>Stokvel Contributions</p>
          {hidden ? (
            <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ color: colors.outline, fontSize: 13 }}>Hidden</p>
            </div>
          ) : (
            <BarChart data={stokvel_s} color={colors.tertiary} label="Contributed" formatY={v => `${v.toFixed(1)} XLM`} />
          )}
        </div>
      </div>

      {/* ── Allocation + Privacy row ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* Allocation donut */}
        <div style={{ background: colors.surfaceContainerLow, borderRadius: 18, padding: 22, border: `1px solid rgba(255,255,255,0.05)` }}>
          <p style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>Asset Allocation</p>
          {hidden ? (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ color: colors.outline, fontSize: 13 }}>Hidden</p>
            </div>
          ) : (
            <DonutChart segments={ALLOCATION} />
          )}
        </div>

        {/* Privacy gauge */}
        <div style={{ background: colors.surfaceContainerLow, borderRadius: 18, padding: 22, border: `1px solid rgba(255,255,255,0.05)` }}>
          <p style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>Privacy Score</p>
          <PrivacyGauge score={hidden ? 0 : privacyScore} />

          {!hidden && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
              {[
                { label: "Private pool deposits",    value: 1, total: 7,  color: "#a78bfa" },
                { label: "Shielded payments",        value: 2, total: 7,  color: colors.primary },
                { label: "ZK proofs issued",         value: 3, total: 3,  color: "#22c55e" },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: colors.outline }}>{r.label}</span>
                    <span style={{ fontSize: 12, color: colors.onSurface }}>{r.value}/{r.total}</span>
                  </div>
                  <div style={{ background: colors.surfaceContainerHigh, borderRadius: 4, height: 5, overflow: "hidden" }}>
                    <div style={{ width: `${(r.value / r.total) * 100}%`, height: "100%", background: r.color, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Activity feed ── */}
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 18, border: `1px solid rgba(255,255,255,0.05)`, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: colors.onSurface, fontFamily: fontFamily.headline }}>Recent Activity</p>
          <span style={{ fontSize: 12, color: colors.outline }}>{ACTIVITY.length} events</span>
        </div>
        {ACTIVITY.map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", borderBottom: i < ACTIVITY.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: `${a.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MaterialIcon name={a.icon} size={16} style={{ color: a.color }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, color: colors.onSurface }}>{a.label}</p>
              <p style={{ margin: 0, fontSize: 11, color: colors.outline }}>{a.time}</p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: hidden ? colors.outline : (a.amount.startsWith("+") ? "#22c55e" : colors.onSurface), fontFamily: fontFamily.headline }}>
              {hidden ? "••••" : a.amount}
            </span>
          </div>
        ))}
      </div>

      {/* ── Privacy note ── */}
      <div style={{ marginTop: 20, background: `${colors.primary}10`, border: `1px solid ${colors.primary}22`, borderRadius: 14, padding: "14px 18px", display: "flex", gap: 10 }}>
        <MaterialIcon name="lock" size={16} style={{ color: colors.primary, flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 12, color: colors.outline, lineHeight: 1.6 }}>
          <strong style={{ color: colors.onSurface }}>Your data stays private.</strong> Analytics are computed locally in your browser — no performance data is sent to any server. Use the "Hide" button to obscure values when sharing your screen.
        </p>
      </div>
    </section>
  );
};
