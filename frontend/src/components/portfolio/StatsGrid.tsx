import React from "react";
import { colors, fontFamily } from "../../constants/theme";

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
