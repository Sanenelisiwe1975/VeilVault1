import React from "react";
import { StatsGrid }         from "../../components/portfolio/StatsGrid";
import { SecurityPulse }     from "../../components/portfolio/SecurityPulse";
import { PerformancePanel }  from "../../components/detail/Performance";
import { TvlCard }           from "../../components/portfolio/Cards";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon }      from "../../components/ui";
import { useIsMobile }       from "../../hooks";

// ─── Business-specific summary card ──────────────────────────────────────────

function BusinessSummaryCard() {
  const companySize     = localStorage.getItem("vv_business_companySize")    ?? "—";
  const employeeCount   = localStorage.getItem("vv_business_employeeCount")  ?? "—";
  const manageTreasury  = localStorage.getItem("vv_business_manageTreasury");
  const needsSuccession = localStorage.getItem("vv_business_needsSuccession");

  const rows = [
    { icon: "business",       label: "Company size",       value: companySize  },
    { icon: "badge",          label: "Employees",          value: employeeCount },
    { icon: "account_balance", label: "Treasury wallets",  value: manageTreasury  === "true" ? "Enabled" : manageTreasury  === "false" ? "Not required" : "—" },
    { icon: "history_edu",    label: "Succession planning", value: needsSuccession === "true" ? "Active"  : needsSuccession === "false" ? "Not required" : "—" },
  ];

  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#10B98114", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <MaterialIcon name="business" size={18} style={{ color: "#10B981" }} />
        </div>
        <span style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 15, color: "#fff" }}>
          Business Overview
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map(({ icon, label, value }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <MaterialIcon name={icon} size={16} style={{ color: "#10B981", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: colors.outline, flex: 1 }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BusinessDashboard() {
  const isMobile = useIsMobile();

  return (
    <div style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Page title */}
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#fff", fontFamily: fontFamily.headline, letterSpacing: "-0.02em" }}>
          Business Dashboard
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.outline }}>
          Company assets, treasury management &amp; succession planning
        </p>
      </div>

      {/* Business summary + TVL */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <BusinessSummaryCard />
        <TvlCard />
      </div>

      {/* Stats */}
      <StatsGrid />

      {/* Security + performance */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <SecurityPulse />
        <PerformancePanel />
      </div>

    </div>
  );
}
