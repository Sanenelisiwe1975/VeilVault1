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

// Planned features (see README "Planned Features") — shown honestly as coming
// soon, never as clickable mock flows.
const COMING_SOON: { icon: string; title: string; desc: string }[] = [
  { icon: "credit_card", title: "Top up with card, EFT or M-Pesa", desc: "Add Rand directly through Stellar anchors — no crypto needed" },
  { icon: "smart_toy",   title: "AI savings assistant",            desc: "Ask questions and move money by chat — within your safety limits" },
];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function IndividualDashboard({ onNavigate }: { onNavigate?: (nav: NavItem) => void }) {
  const isMobile = useIsMobile();
  const { vault, vaultExists } = useVault();
  const name = typeof window !== "undefined" ? localStorage.getItem("vv_name") : null;

  return (
    <div style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Greeting */}
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#fff", fontFamily: fontFamily.headline, letterSpacing: "-0.02em" }}>
          {greeting()}{name ? `, ${name.split(" ")[0]}` : ""} 👋
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.outline }}>
          Here's how your money is doing
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

      {/* Privacy notice */}
      <div style={{ background: `${colors.primaryContainer}15`, border: `1px solid ${colors.primaryContainer}30`, borderRadius: 14, padding: "13px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <MaterialIcon name="shield" size={17} style={{ color: colors.primary, flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 1.55 }}>
          Your transactions are private by default. Nobody can see your balances except you.
        </span>
      </div>

      {/* Safety controls shortcut */}
      {onNavigate && (
        <button type="button" onClick={() => onNavigate("Security")}
          style={{ background: colors.surfaceContainerLow, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 14, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: "#10B98118", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <MaterialIcon name="verified_user" size={20} style={{ color: "#10B981" }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: colors.onSurface, fontFamily: fontFamily.headline }}>Safety controls active</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.outline }}>Max drop 50% · Position cap 70% · Enforced on-chain, 24/7</p>
          </div>
          <MaterialIcon name="chevron_right" size={18} style={{ color: colors.outline }} />
        </button>
      )}

      {/* Coming soon */}
      <div>
        <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: colors.outline, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Coming soon
        </p>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          {COMING_SOON.map(({ icon, title, desc }) => (
            <div key={title} style={{ background: colors.surfaceContainerLow, border: `1px dashed rgba(255,255,255,0.12)`, borderRadius: 14, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start", opacity: 0.85 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `${colors.tertiary}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MaterialIcon name={icon} size={19} style={{ color: colors.tertiary }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.onSurface, fontFamily: fontFamily.headline }}>{title}</p>
                  <span style={{ fontSize: 9, fontWeight: 700, background: `${colors.tertiary}20`, color: colors.tertiary, padding: "2px 7px", borderRadius: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Coming soon
                  </span>
                </div>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: colors.outline, lineHeight: 1.45 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <StatsGrid yieldXlm={vaultExists && vault ? vault.yieldEarnedSol : undefined} isPaused={vaultExists && vault ? vault.isPaused : undefined} />

      {/* Info cards */}
      <InfoCards />

      {/* Security */}
      <SecurityPulse />

    </div>
  );
}
