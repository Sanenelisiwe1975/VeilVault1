import React from "react";
import { StatsGrid }         from "../../components/portfolio/StatsGrid";
import { PerformancePanel }  from "../../components/detail/Performance";
import { InvestmentStrategy } from "../../components/detail/InvestmentStrategy";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon }      from "../../components/ui";
import { useIsMobile, useStokvel } from "../../hooks";

// ─── Stokvel-specific summary card ───────────────────────────────────────────

function StokvelSummaryCard() {
  const { config } = useStokvel();

  // Real on-chain config once loaded; falls back to the user's own onboarding
  // answers (localStorage) until then. "Administrators"/"Crypto managed" have
  // no on-chain equivalent, so they stay onboarding-preference fields.
  const memberCount   = config ? String(config.memberCount) : localStorage.getItem("vv_stokvel_memberCount") ?? "—";
  const monthlyAmount = config ? `${(Number(config.contributionAmount) / 1e7).toLocaleString("en-ZA", { maximumFractionDigits: 2 })} XLM` : localStorage.getItem("vv_stokvel_monthlyAmount") ?? "—";
  const admins         = localStorage.getItem("vv_stokvel_admins")        ?? "—";
  const managesCrypto  = localStorage.getItem("vv_stokvel_managesCrypto");

  const rows = [
    { icon: "groups",   label: "Members",             value: memberCount               },
    { icon: "payments", label: "Monthly contribution", value: monthlyAmount             },
    { icon: "manage_accounts", label: "Administrators", value: admins                  },
    { icon: "currency_bitcoin", label: "Crypto managed", value: managesCrypto === "true" ? "Yes" : managesCrypto === "false" ? "No" : "—" },
  ];

  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#0EA5E914", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <MaterialIcon name="groups" size={18} style={{ color: "#0EA5E9" }} />
        </div>
        <span style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 15, color: "#fff" }}>
          Stokvel Overview
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map(({ icon, label, value }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <MaterialIcon name={icon} size={16} style={{ color: "#0EA5E9", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: colors.outline, flex: 1 }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StokvelDashboard() {
  const isMobile = useIsMobile();

  return (
    <div style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Page title */}
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#fff", fontFamily: fontFamily.headline, letterSpacing: "-0.02em" }}>
          Stokvel Dashboard
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.outline }}>
          Collective savings, governance &amp; contribution cycles
        </p>
      </div>

      {/* Stokvel summary + stats side by side on desktop */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <StokvelSummaryCard />
        <StatsGrid />
      </div>

      {/* Strategy + performance */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <InvestmentStrategy />
        <PerformancePanel />
      </div>

    </div>
  );
}
