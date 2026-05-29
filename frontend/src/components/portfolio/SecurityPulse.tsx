import React from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon } from "../ui";
import { SECURITY_ITEMS } from "../../data";

/**
 * Shows MPC node health and key-shard status.
 * Uses left-border accent lines instead of dividers (per DESIGN.md no-line rule).
 */
export const SecurityPulse: React.FC = () => (
  <div
    style={{
      background:   colors.surfaceContainerLow,
      borderRadius: 16,
      padding:      24,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
      <div
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${colors.primary}20`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <MaterialIcon name="security" size={18} style={{ color: colors.primary }} />
      </div>
      <span style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 16, color: "#fff" }}>
        Security Pulse
      </span>
    </div>

    {SECURITY_ITEMS.map((item) => (
      <div
        key={item.label}
        style={{
          paddingLeft:  16,
          borderLeft:   `2px solid ${colors.primaryContainer}`,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 3 }}>
          {item.label}
        </span>
        <span style={{ fontSize: 13, color: colors.onSurface }}>{item.value}</span>
      </div>
    ))}
  </div>
);
