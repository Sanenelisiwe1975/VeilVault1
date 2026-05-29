import React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon, GradientText } from "../ui";
import type { SidebarProps, NavItem } from "../../types";

interface NavLink {
  icon:  string;
  label: NavItem;
}

const NAV_LINKS: NavLink[] = [
  { icon: "dashboard",             label: "Portfolio" },
  { icon: "account_balance_wallet",label: "Vaults"    },
  { icon: "explore",               label: "Strategy"  },
  { icon: "verified_user",         label: "Security"  },
  { icon: "settings",              label: "Settings"  },
];

const UTILITY_LINKS = [
  { icon: "help",        label: "Support"       },
  { icon: "description", label: "Documentation" },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeNav, onNavChange, onHome }) => {
  const { connected, publicKey } = useWallet();
  const shortKey = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : null;

  return (
  <aside
    style={{
      position:      "fixed",
      left:          16,
      top:           16,
      bottom:        16,
      width:         240,
      borderRadius:  16,
      background:    "rgba(26, 27, 32, 0.70)",
      backdropFilter:"blur(20px)",
      display:       "flex",
      flexDirection: "column",
      padding:       "24px 16px",
      zIndex:        50,
      boxShadow:     "0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
    }}
  >
    {/* ── Logo ── */}
    <div style={{ marginBottom: 36 }}>
      <button
        type="button"
        onClick={onHome}
        style={{ background: "transparent", border: "none", cursor: onHome ? "pointer" : "default", padding: 0, textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}
      >
        <img src="/logo.jpg" alt="Veil Vault" style={{ height: 40, width: 40, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
        <div>
          <GradientText style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", display: "block", fontFamily: fontFamily.headline }}>
            Veil Vault
          </GradientText>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.18em", color: `${colors.primary}60`, margin: 0 }}>
            MPC Protected
          </p>
        </div>
      </button>
    </div>

    {/* ── Nav ── */}
    <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Home — returns to the landing page */}
      <button
        type="button"
        onClick={onHome}
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          12,
          padding:      "10px 14px",
          borderRadius: 8,
          background:   "transparent",
          border:       "none",
          outline:      "none",
          color:        colors.outline,
          fontWeight:   400,
          fontSize:     14,
          fontFamily:   fontFamily.headline,
          letterSpacing:"-0.01em",
          cursor:       "pointer",
          textAlign:    "left",
          transition:   "all 0.2s ease",
          marginBottom: 4,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = `${colors.surfaceContainerHigh}`;
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = colors.outline;
        }}
      >
        <MaterialIcon name="home" size={20} />
        Home
      </button>

      {NAV_LINKS.map(({ icon, label }) => {
        const isActive = activeNav === label;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onNavChange(label)}
            style={{
              display:     "flex",
              alignItems:  "center",
              gap:         12,
              padding:     "10px 14px",
              borderRadius: 8,
              background:  isActive
                ? `linear-gradient(90deg, ${colors.primaryContainer}28 0%, transparent 100%)`
                : "transparent",
              borderRight: isActive ? `2px solid ${colors.primaryContainer}` : "2px solid transparent",
              color:       isActive ? colors.primary : colors.outline,
              fontWeight:  isActive ? 700 : 400,
              fontSize:    14,
              fontFamily:  fontFamily.headline,
              letterSpacing: "-0.01em",
              cursor:      "pointer",
              transition:  "all 0.2s ease",
              textAlign:   "left",
              border:      "none",
              outline:     "none",
            }}
          >
            <MaterialIcon name={icon} size={20} />
            {label}
          </button>
        );
      })}
    </nav>

    {/* ── Bottom: wallet status + utility links ── */}
    <div style={{ marginTop: "auto", paddingTop: 20, background: `${colors.surfaceContainerLowest}80`, borderRadius: 10, padding: 12 }}>
      {/* Wallet status pill — no duplicate connect button; header has WalletMultiButton */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          8,
        padding:      "8px 12px",
        borderRadius: 8,
        background:   connected ? `${colors.primaryContainer}18` : "transparent",
        border:       `1px solid ${connected ? colors.primaryContainer + "44" : "rgba(255,255,255,0.06)"}`,
        marginBottom: 8,
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%",
          background: connected ? colors.tertiary : "#64748b",
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 11, color: connected ? colors.primary : "#64748b", fontFamily: fontFamily.body }}>
          {connected && shortKey ? shortKey : "Not connected"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {UTILITY_LINKS.map(({ icon, label }) => (
          <button
            key={label}
            type="button"
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        10,
              padding:    "8px 14px",
              background: "transparent",
              border:     "none",
              color:      "#64748b",
              fontSize:   12,
              cursor:     "pointer",
              borderRadius: 6,
              fontFamily: fontFamily.body,
            }}
          >
            <MaterialIcon name={icon} size={16} />
            {label}
          </button>
        ))}
      </div>
    </div>
  </aside>
  );
};
