import React from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon, PrivacyBars, APYBadge } from "../ui";
import { PORTFOLIO_POSITIONS } from "../../data";
import { useIsMobile } from "../../hooks";

const COLUMNS = ["Vault Name", "Net Value", "All-Time Yield", "APY", "Privacy Level", ""];

export const ActivePositionsTable: React.FC = () => {
  const isMobile = useIsMobile();
  return (
  <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: isMobile ? 16 : 28, marginBottom: 20 }}>
    {/* Header row */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
      <div>
        <h3 style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 22, color: "#fff", marginBottom: 6 }}>
          Active Positions
        </h3>
        <p style={{ color: colors.onSurfaceVariant, fontSize: 13 }}>
          Manage your deployed capital across specialized cryptographic vaults.
        </p>
      </div>
      <button
        type="button"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "transparent", border: "none",
          color: colors.primary, fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: fontFamily.headline,
        }}
      >
        View Strategy Explorer
        <MaterialIcon name="arrow_forward" size={16} />
      </button>
    </div>

    {/* Table — horizontally scrollable on mobile */}
    <div style={{ overflowX: isMobile ? "auto" : "visible", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
      <div style={{ minWidth: isMobile ? 560 : "auto" }}>
        {/* Column labels */}
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 80px 40px",
            gap:                 16,
            padding:             "0 12px",
            marginBottom:        12,
          }}
        >
          {COLUMNS.map((h) => (
            <span key={h} style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        {PORTFOLIO_POSITIONS.map((pos, i) => (
          <div
            key={pos.id}
            style={{
              display:             "grid",
              gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 80px 40px",
              gap:                 16,
              alignItems:          "center",
              padding:             "14px 12px",
              borderRadius:        10,
              background:          i % 2 !== 0 ? `${colors.surfaceContainerHighest}30` : "transparent",
              marginBottom:        4,
            }}
          >
            {/* Name + icon */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `linear-gradient(135deg, ${colors.primaryContainer}50, ${colors.secondaryContainer}50)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <MaterialIcon name={pos.icon} size={18} style={{ color: colors.primary }} />
              </div>
              <div>
                <div style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 14, color: "#fff" }}>
                  {pos.name}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{pos.subtitle}</div>
              </div>
            </div>

            <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 600, color: "#fff" }}>
              {pos.netValue}
            </span>

            <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 600, color: "#4ade80" }}>
              {pos.allTimeYield}
            </span>

            <APYBadge value={pos.apy} />

            <PrivacyBars count={pos.privacyBars} />

            <button type="button" aria-label="More options" style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", padding: 4 }}>
              <MaterialIcon name="more_vert" size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  </div>
  );
};
