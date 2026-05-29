import React from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon } from "../components/ui";
import { useIsMobile } from "../hooks";
import {
  TvlCard,
  NetWorthCard,
  SecurityPulse,
  YieldChart,
  ActivePositionsTable,
  InfoCards,
} from "../components/portfolio";

export const PortfolioPage: React.FC = () => {
  const isMobile = useIsMobile();
  return (
  <section className="blur-in" style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>

    {/* FHE banner */}
    <div
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          8,
        background:   `${colors.primary}14`,
        border:       `1px solid ${colors.primary}28`,
        borderRadius: 6,
        padding:      "6px 14px",
        marginBottom: 20,
      }}
    >
      <MaterialIcon name="lock" size={14} style={{ color: colors.primary }} />
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: colors.primary, textTransform: "uppercase" }}>
        Fully Homomorphic Encryption Active
      </span>
    </div>

    {/* Title row */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
      <div>
        <h2 style={{ fontFamily: fontFamily.headline, fontSize: isMobile ? 32 : 44, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", marginBottom: 8 }}>
          Curated Portfolio
        </h2>
        <p style={{ color: colors.onSurfaceVariant, fontSize: 15 }}>
          Total assets protected by multi-party computation protocols.
        </p>
      </div>

      {/* 24h change badge */}
      <div style={{ background: colors.surfaceContainerHigh, borderRadius: 12, padding: "14px 22px", textAlign: "right" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 6 }}>
          24H Change
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#4ade80", fontFamily: fontFamily.headline }}>
          ↑ +4.28%
        </div>
      </div>
    </div>

    {/* TVL + Net Worth */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 20, marginBottom: 20 }}>
      <TvlCard />
      <NetWorthCard />
    </div>

    {/* Security + Yield */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.5fr", gap: 20, marginBottom: 20 }}>
      <SecurityPulse />
      <YieldChart />
    </div>

    {/* Active positions table */}
    <ActivePositionsTable />

    {/* Info cards */}
    <InfoCards />
  </section>
  );
};
