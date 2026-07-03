import React from "react";
import { StatsGrid }    from "../../components/portfolio/StatsGrid";
import { InfoCards }    from "../../components/portfolio/InfoCards";
import { SecurityPulse } from "../../components/portfolio/SecurityPulse";
import { TvlCard, NetWorthCard } from "../../components/portfolio/StatsGrid";
import { colors, fontFamily } from "../../constants/theme";
import { useIsMobile, useVault } from "../../hooks";
import { MaterialIcon } from "../../components/ui";
import type { NavItem } from "../../types";

const QUICK_ACTIONS: { icon: string; label: string; nav: NavItem }[] = [
  { icon: "add_card",    label: "Add money", nav: "Vaults"   },
  { icon: "trending_up", label: "Earn more", nav: "Strategy" },
  { icon: "groups",      label: "Stokvel",   nav: "Stokvel"  },
  { icon: "security",    label: "Safety",    nav: "Security" },
];

export default function IndividualDashboard({ onNavigate }: { onNavigate?: (nav: NavItem) => void }) {
  const isMobile = useIsMobile();
  const { vault, vaultExists } = useVault();

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
        <TvlCard totalAssets={vaultExists && vault ? String(Math.round(vault.netValueSol * 1e7)) : undefined} />
        <NetWorthCard netValueXlm={vaultExists && vault ? vault.netValueSol : undefined} yieldXlm={vaultExists && vault ? vault.yieldEarnedSol : undefined} />
      </div>

      {/* Quick actions */}
      {onNavigate && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12 }}>
          {QUICK_ACTIONS.map(({ icon, label, nav }) => (
            <button key={label} type="button" onClick={() => onNavigate(nav)}
              style={{
                background: colors.surfaceContainerLow, border: `1px solid rgba(255,255,255,0.07)`,
                borderRadius: 14, padding: "16px 12px", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              }}>
              <MaterialIcon name={icon} size={22} style={{ color: colors.primary }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: colors.onSurface, fontFamily: fontFamily.headline }}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Stats */}
      <StatsGrid yieldXlm={vaultExists && vault ? vault.yieldEarnedSol : undefined} isPaused={vaultExists && vault ? vault.isPaused : undefined} />

      {/* Info cards */}
      <InfoCards />

      {/* Security */}
      <SecurityPulse />

    </div>
  );
}
