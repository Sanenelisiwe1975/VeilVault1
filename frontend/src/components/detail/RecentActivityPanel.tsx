import React from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon } from "../ui";
import { RECENT_ACTIVITY } from "../../data";

export const RecentActivityPanel: React.FC = () => (
  <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 20 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <MaterialIcon name="history" size={18} style={{ color: colors.onSurfaceVariant }} />
      <span style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 15, color: "#fff" }}>
        Recent Activity
      </span>
      <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, color: "#64748b",
        background: "#64748b18", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
        Sample data
      </span>
    </div>
    <p style={{ fontSize: 11, color: "#475569", marginBottom: 16 }}>
      Per-transaction history isn't wired up yet — this is example activity, not your real transactions.
    </p>

    {RECENT_ACTIVITY.map((item, i) => (
      <div
        key={i}
        style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap:                 8,
          alignItems:          "center",
          padding:             "12px 0",
          background:          i % 2 !== 0 ? `${colors.surfaceContainerHighest}18` : "transparent",
          borderRadius:        6,
        }}
      >
        <span style={{ fontSize: 13, color: colors.onSurfaceVariant }}>{item.type}</span>
        <span
          style={{
            fontSize:   13,
            fontWeight: 600,
            color:      item.type === "Yield Claim" ? "#4ade80" : "#fff",
            fontFamily: "monospace",
          }}
        >
          {item.amount}
        </span>
        <span style={{ fontSize: 11, color: "#475569" }}>{item.time}</span>
      </div>
    ))}
  </div>
);
