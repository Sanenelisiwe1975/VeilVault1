import React from "react";
import { StatsGrid }    from "../../components/portfolio/StatsGrid";
import { InfoCards }    from "../../components/portfolio/InfoCards";
import { SecurityPulse } from "../../components/portfolio/SecurityPulse";
import { TvlCard, NetWorthCard } from "../../components/portfolio/StatsGrid";
import { colors, fontFamily } from "../../constants/theme";
import { useIsMobile } from "../../hooks";

export default function IndividualDashboard() {
  const isMobile = useIsMobile();

  return (
    <div style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Page title */}
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#fff", fontFamily: fontFamily.headline, letterSpacing: "-0.02em" }}>
          My Portfolio
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.outline }}>
          Personal assets, inheritance planning &amp; digital legacy
        </p>
      </div>

      {/* Top cards row */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <TvlCard />
        <NetWorthCard />
      </div>

      {/* Stats */}
      <StatsGrid />

      {/* Info cards */}
      <InfoCards />

      {/* Security */}
      <SecurityPulse />

    </div>
  );
}
