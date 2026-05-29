import React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon, GradientText } from "../ui";
import { useIsMobile } from "../../hooks";
import type { HeaderProps, ActiveTab } from "../../types";

const TABS: ActiveTab[] = ["Overview", "Yields", "History"];

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, onHome, searchQuery = "", onSearchChange }) => {
  const { connected } = useWallet();
  const isMobile = useIsMobile();

  return (
    <header
      style={{
        position:       "sticky",
        top:            0,
        zIndex:         40,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        height:         64,
        padding:        isMobile ? "0 16px" : "0 32px",
        background:     `${colors.surface}cc`,
        backdropFilter: "blur(16px)",
      }}
    >
      {isMobile ? (
        /* ── Mobile: logo left, wallet right ── */
        <>
          <button
            type="button"
            onClick={onHome}
            style={{ background: "transparent", border: "none", cursor: onHome ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", gap: 8 }}
          >
            <img src="/logo.jpg" alt="Veil Vault" style={{ height: 32, width: 32, borderRadius: 8, objectFit: "cover" }} />
            <GradientText style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", fontFamily: fontFamily.headline }}>
              Veil Vault
            </GradientText>
          </button>
          <WalletMultiButton
            style={{
              height:       36,
              fontSize:     11,
              fontWeight:   700,
              fontFamily:   fontFamily.headline,
              background:   connected
                ? `${colors.primaryContainer}22`
                : `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryContainer} 100%)`,
              border:       connected ? `1px solid ${colors.primary}44` : "none",
              borderRadius: 6,
              color:        connected ? colors.primary : colors.onPrimary,
              padding:      "0 12px",
            }}
          />
        </>
      ) : (
        /* ── Desktop: search + tabs left, notifications + wallet right ── */
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <div style={{ position: "relative" }}>
              <MaterialIcon
                name="search"
                size={18}
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#475569" }}
              />
              <input
                type="text"
                placeholder="Search strategies..."
                value={searchQuery}
                onChange={e => onSearchChange?.(e.target.value)}
                style={{
                  background:    colors.surfaceContainerLow,
                  border:        searchQuery ? `1px solid ${colors.primary}40` : "none",
                  borderRadius:  24,
                  paddingLeft:   40,
                  paddingRight:  16,
                  paddingTop:    7,
                  paddingBottom: 7,
                  fontSize:      13,
                  color:         colors.onSurface,
                  width:         240,
                  outline:       "none",
                  fontFamily:    fontFamily.body,
                }}
              />
            </div>

            <nav style={{ display: "flex", gap: 24 }}>
              {TABS.map((tab) => (
                <button
                  type="button"
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  style={{
                    background:    "transparent",
                    border:        "none",
                    borderBottom:  activeTab === tab ? `2px solid ${colors.primaryContainer}` : "2px solid transparent",
                    color:         activeTab === tab ? colors.primary : colors.outline,
                    fontWeight:    500,
                    fontSize:      14,
                    fontFamily:    fontFamily.headline,
                    paddingBottom: 4,
                    cursor:        "pointer",
                    transition:    "all 0.2s",
                  }}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              aria-label="Notifications"
              style={{ background: "transparent", border: "none", color: colors.outline, cursor: "pointer", padding: 8, borderRadius: 8, outline: "none" }}
            >
              <MaterialIcon name="notifications" size={22} />
            </button>
            <div style={{ width: 4 }} />
            <WalletMultiButton
              style={{
                height:       36,
                fontSize:     12,
                fontWeight:   700,
                fontFamily:   fontFamily.headline,
                background:   connected
                  ? `${colors.primaryContainer}22`
                  : `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryContainer} 100%)`,
                border:       connected ? `1px solid ${colors.primary}44` : "none",
                borderRadius: 6,
                color:        connected ? colors.primary : colors.onPrimary,
                padding:      "0 16px",
              }}
            />
          </div>
        </>
      )}
    </header>
  );
};
