import React from "react";
import { colors } from "../../constants/theme";
import type { BadgeProps, RiskDotProps, PrivacyBarsProps, APYBadgeProps, RiskLevel } from "../../types";

export const Badge: React.FC<BadgeProps> = ({ text }) => (
  <span
    style={{
      background:    `${colors.primary}18`,
      color:         colors.primary,
      border:        `1px solid ${colors.primary}33`,
      fontSize:      9,
      fontWeight:    900,
      letterSpacing: "0.15em",
      padding:       "3px 8px",
      borderRadius:  2,
      textTransform: "uppercase",
      backdropFilter:"blur(8px)",
    }}
  >
    {text}
  </span>
);

type RiskConfig = Record<RiskLevel, { color: string; label: string }>;

const RISK_CONFIG: RiskConfig = {
  HIGH:   { color: colors.error,         label: "High Risk"   },
  MEDIUM: { color: colors.tertiary,      label: "Medium Risk" },
  LOW:    { color: colors.primaryFixedDim, label: "Low Risk"  },
};

/** Coloured dot + label indicating a vault's risk tier. */
export const RiskDot: React.FC<RiskDotProps> = ({ risk }) => {
  const { color, label } = RISK_CONFIG[risk];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width:        7,
          height:       7,
          borderRadius: "50%",
          background:   color,
          display:      "inline-block",
          animation:    risk === "HIGH" ? "pulse 1.5s infinite" : undefined,
        }}
      />
      <span
        style={{
          fontSize:      10,
          fontWeight:    700,
          color,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
    </div>
  );
};

/** Visual bar indicator showing MPC privacy level (0–total). */
export const PrivacyBars: React.FC<PrivacyBarsProps> = ({ count, total = 4 }) => (
  <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        style={{
          width:        4,
          height:       i < count ? 16 : 8,
          borderRadius: 2,
          background:   i < count
            ? `linear-gradient(180deg, ${colors.primary}, ${colors.primaryContainer})`
            : `${colors.outlineVariant}80`,
        }}
      />
    ))}
  </div>
);

/** Pill showing an APY value, used in the portfolio positions table. */
export const APYBadge: React.FC<APYBadgeProps> = ({ value }) => (
  <div
    style={{
      background:   `${colors.primaryContainer}28`,
      border:       `1px solid ${colors.primaryContainer}40`,
      borderRadius: 6,
      padding:      "4px 10px",
      textAlign:    "center",
    }}
  >
    <div style={{ fontSize: 12, fontWeight: 700, color: colors.primary }}>{value}</div>
  </div>
  
  );
