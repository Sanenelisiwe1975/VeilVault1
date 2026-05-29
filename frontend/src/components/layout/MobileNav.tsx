import React from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon } from "../ui";
import type { SidebarProps, NavItem } from "../../types";

const NAV_LINKS: { icon: string; label: NavItem }[] = [
  { icon: "account_balance_wallet", label: "Vaults"    },
  { icon: "dashboard",              label: "Portfolio" },
  { icon: "explore",                label: "Strategy"  },
  { icon: "verified_user",          label: "Security"  },
  { icon: "settings",               label: "Settings"  },
];

interface MobileNavProps extends SidebarProps {
  onHome?: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ activeNav, onNavChange, onHome }) => (
  <nav
    style={{
      position:       "fixed",
      bottom:         0,
      left:           0,
      right:          0,
      height:         64,
      background:     "rgba(13, 14, 19, 0.97)",
      backdropFilter: "blur(20px)",
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-around",
      zIndex:         50,
      paddingBottom:  "env(safe-area-inset-bottom)",
    }}
  >
    {/* Home button — always first, takes user back to landing page */}
    <button
      type="button"
      onClick={onHome}
      style={{
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        gap:           3,
        background:    "transparent",
        border:        "none",
        cursor:        "pointer",
        padding:       "6px 10px",
        borderRadius:  8,
        color:         "#475569",
        transition:    "color 0.2s",
      }}
    >
      <MaterialIcon name="home" size={22} style={{ color: "#475569" }} />
      <span style={{
        fontSize:      9,
        fontWeight:    700,
        fontFamily:    fontFamily.headline,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}>
        Home
      </span>
    </button>

    {NAV_LINKS.map(({ icon, label }) => {
      const isActive = activeNav === label;
      return (
        <button
          key={label}
          type="button"
          onClick={() => onNavChange(label)}
          style={{
            display:       "flex",
            flexDirection: "column",
            alignItems:    "center",
            gap:           3,
            background:    "transparent",
            border:        "none",
            cursor:        "pointer",
            padding:       "6px 10px",
            borderRadius:  8,
            color:         isActive ? colors.primary : "#475569",
            transition:    "color 0.2s",
          }}
        >
          <MaterialIcon name={icon} size={22} style={{ color: isActive ? colors.primary : "#475569" }} />
          <span style={{
            fontSize:      9,
            fontWeight:    700,
            fontFamily:    fontFamily.headline,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}>
            {label}
          </span>
        </button>
      );
    })}
  </nav>
);
