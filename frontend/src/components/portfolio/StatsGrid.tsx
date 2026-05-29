import React from "react";
import { colors, fontFamily } from "../../constants/theme";

export const TvlCard: React.FC = () => {
  const bars = [40, 55, 45, 60, 50, 70, 65, 75, 80, 90];

  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.15em" }}>
          Total Value Locked
        </span>
        <span
          style={{
            fontSize:     9,
            fontWeight:   700,
            background:   `${colors.secondary}20`,
            color:        colors.secondary,
            padding:      "3px 8px",
            borderRadius: 2,
            textTransform:"uppercase",
            letterSpacing:"0.10em",
          }}
        >
          Global Aggregate
        </span>
      </div>

      <div
        style={{
          fontFamily:    fontFamily.headline,
          fontSize:      52,
          fontWeight:    900,
          color:         "#fff",
          letterSpacing: "-0.04em",
          lineHeight:    1,
          marginBottom:  24,
        }}
      >
        $14,290,042
        <span style={{ color: colors.onSurfaceVariant, fontSize: 36 }}>.80</span>
      </div>

      {/* Mini bar chart */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 60 }}>
        {bars.map((h, i) => (
          <div
            key={i}
            style={{
              flex:         1,
              height:       `${h}%`,
              borderRadius: 3,
              background:   i === bars.length - 1
                ? `linear-gradient(180deg, ${colors.primary}, ${colors.primaryContainer})`
                : colors.surfaceContainerHighest,
              transition:   "height 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
};

// ─── Net Worth Card ───────────────────────────────────────────────────────────

const NET_WORTH_ROWS = [
  { name: "ETH Delta Strategy", value: "$428k", pct: 65 },
  { name: "USDC Stabilizer",    value: "$312k", pct: 45 },
];

export const NetWorthCard: React.FC = () => (
  <div
    style={{
      background:   `linear-gradient(145deg, ${colors.primaryContainer}aa, ${colors.secondaryContainer}88)`,
      borderRadius: 16,
      padding:      24,
    }}
  >
    <span style={{ fontSize: 10, fontWeight: 700, color: `${colors.primaryFixed}99`, textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 8 }}>
      Net Worth
    </span>

    <div style={{ fontFamily: fontFamily.headline, fontSize: 34, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>
      $842,104.10
    </div>
    <p style={{ fontSize: 12, color: `${colors.primaryFixed}80`, marginBottom: 20 }}>
      Available across 4 segregated vaults
    </p>

    {NET_WORTH_ROWS.map((row) => (
      <div key={row.name} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: colors.primaryFixed }}>{row.name}</span>
          <span style={{ color: "#fff", fontWeight: 600 }}>{row.value}</span>
        </div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: `${row.pct}%`, borderRadius: 2, background: "rgba(255,255,255,0.6)" }} />
        </div>
      </div>
    ))}
  </div>
);
