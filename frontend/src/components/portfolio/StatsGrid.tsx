import React from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon } from "../ui";

//TVL Card 

interface TvlCardProps {
  /** Real vault total assets in XLM stroops (string). Falls back to demo value. */
  totalAssets?: string;
}

export const TvlCard: React.FC<TvlCardProps> = ({ totalAssets }) => {
  const bars = [40, 55, 45, 60, 50, 70, 65, 75, 80, 90];
  const hasReal = !!totalAssets && totalAssets !== "0";
  const xlm     = hasReal ? (Number(totalAssets) / 1e7).toLocaleString("en-ZA", { maximumFractionDigits: 2 }) : "14,290,042";
  const unit    = hasReal ? "XLM" : "$";
  const label   = hasReal ? "Your Vault" : "Global Aggregate";

  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.15em" }}>
          Total Value Locked
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, background: `${colors.secondary}20`, color: colors.secondary, padding: "3px 8px", borderRadius: 2, textTransform: "uppercase" as const, letterSpacing: "0.10em" }}>
          {label}
        </span>
      </div>

      <div style={{ fontFamily: fontFamily.headline, fontSize: 48, fontWeight: 900, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 6 }}>
        {hasReal ? "" : "$"}{xlm}
        {hasReal && <span style={{ color: colors.onSurfaceVariant, fontSize: 22, marginLeft: 8 }}>XLM</span>}
        {!hasReal && <span style={{ color: colors.onSurfaceVariant, fontSize: 36 }}>.80</span>}
      </div>
      {hasReal && <p style={{ fontSize: 12, color: colors.outline, margin: "0 0 20px" }}>Live from Stellar testnet</p>}
      {!hasReal && <p style={{ fontSize: 12, color: colors.outline, margin: "0 0 20px" }}>Demo data — connect wallet to see real values</p>}

      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 60 }}>
        {bars.map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 3, background: i === bars.length - 1 ? `linear-gradient(180deg, ${colors.primary}, ${colors.primaryContainer})` : colors.surfaceContainerHighest, transition: "height 0.3s ease" }} />
        ))}
      </div>
    </div>
  );
};

//Net Worth Card 

interface NetWorthCardProps {
  netValueXlm?: number;
  yieldXlm?:    number;
}

export const NetWorthCard: React.FC<NetWorthCardProps> = ({ netValueXlm, yieldXlm }) => {
  const hasReal  = netValueXlm !== undefined && netValueXlm > 0;
  const display  = hasReal ? `${netValueXlm!.toFixed(2)} XLM` : "$842,104.10";
  const subtitle = hasReal ? `Yield earned: ${yieldXlm?.toFixed(4) ?? "0"} XLM` : "Available across 4 segregated vaults";

  const rows = hasReal
    ? [
        { name: "Vault balance",  value: `${netValueXlm!.toFixed(2)} XLM`, pct: 80 },
        { name: "Yield earned",   value: `${yieldXlm?.toFixed(4) ?? "0"} XLM`, pct: Math.min(100, (yieldXlm ?? 0) / Math.max(netValueXlm!, 0.0001) * 500) },
      ]
    : [
        { name: "ETH Delta Strategy", value: "$428k", pct: 65 },
        { name: "USDC Stabilizer",    value: "$312k", pct: 45 },
      ];

  return (
    <div style={{ background: `linear-gradient(145deg, ${colors.primaryContainer}aa, ${colors.secondaryContainer}88)`, borderRadius: 16, padding: 24 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: `${colors.primaryFixed}99`, textTransform: "uppercase" as const, letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>
        Net Worth
      </span>
      <div style={{ fontFamily: fontFamily.headline, fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>
        {display}
      </div>
      <p style={{ fontSize: 12, color: `${colors.primaryFixed}80`, marginBottom: 20 }}>{subtitle}</p>

      {rows.map(row => (
        <div key={row.name} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: colors.primaryFixed }}>{row.name}</span>
            <span style={{ color: "#fff", fontWeight: 600 }}>{row.value}</span>
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${row.pct}%`, borderRadius: 2, background: "rgba(255,255,255,0.6)", transition: "width 0.5s ease" }} />
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Stats Grid ──────────────────────────────────────────────────────────────
// A row of small KPI tiles below the TVL/Net Worth cards. "Active Positions"
// and "Network" stay demo data — there's no backend concept of "positions"
// yet, and "Network" is just which Stellar network the app is pointed at.
// "Yield Earned" and "Guardrails" switch to real vault data when passed in
// (same demo-fallback convention as TvlCard/NetWorthCard above).

interface StatTile {
  icon:  string;
  label: string;
  value: string;
  color: string;
}

const DEMO_STATS: StatTile[] = [
  { icon: "trending_up",     label: "30d Yield",        value: "+4.82%",  color: colors.secondary },
  { icon: "account_balance", label: "Active Positions", value: "3",       color: colors.primary },
  { icon: "verified_user",   label: "Guardrails",       value: "Healthy", color: "#10B981" },
  { icon: "hub",             label: "Network",          value: "Testnet", color: "#0EA5E9" },
];

interface StatsGridProps {
  /** Real vault yield (XLM), from useVault()'s vault.yieldEarnedSol. Falls back to a demo rate when omitted. */
  yieldXlm?:  number;
  /** Real vault pause state, from useVault()'s vault.isPaused. Falls back to demo "Healthy" when omitted. */
  isPaused?:  boolean;
}

export const StatsGrid: React.FC<StatsGridProps> = ({ yieldXlm, isPaused }) => {
  const stats: StatTile[] = DEMO_STATS.map(tile => {
    if (tile.label === "30d Yield" && yieldXlm !== undefined) {
      return { ...tile, label: "Yield Earned", value: `${yieldXlm.toFixed(4)} XLM` };
    }
    if (tile.label === "Guardrails" && isPaused !== undefined) {
      return { ...tile, value: isPaused ? "Paused" : "Healthy", color: isPaused ? "#EF4444" : tile.color };
    }
    return tile;
  });

  return (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
    {stats.map(({ icon, label, value, color }) => (
      <div key={label} style={{ background: colors.surfaceContainerLow, borderRadius: 14, padding: 18, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MaterialIcon name={icon} size={18} style={{ color }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: colors.outline, marginBottom: 2 }}>{label}</div>
          <div style={{ fontFamily: fontFamily.headline, fontSize: 17, fontWeight: 700, color: "#fff" }}>{value}</div>
        </div>
      </div>
    ))}
  </div>
  );
};
