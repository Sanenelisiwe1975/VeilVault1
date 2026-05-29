import React, { useState } from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon } from "../ui";

// ─── Investment Strategy Card ─────────────────────────────────────────────────

const STRATEGY_ROWS = [
  { label: "Risk Profile",       value: "Configurable"          },
  { label: "Rebalance Trigger",  value: "FHE-encrypted rule"    },
  { label: "Asset Exposure",     value: "SOL + multi-chain Ika" },
  { label: "Max Drawdown",       value: "20% (on-chain guard)"  },
];

export const InvestmentStrategy: React.FC = () => (
  <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 22 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${colors.primary}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <MaterialIcon name="my_location" size={16} style={{ color: colors.primary }} />
      </div>
      <span style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 15, color: "#fff" }}>
        Investment Strategy
      </span>
    </div>

    <p style={{ color: colors.onSurfaceVariant, fontSize: 12, lineHeight: 1.7, marginBottom: 16 }}>
      Strategy parameters are stored as an Encrypt REFHE ciphertext on-chain. Rebalancing
      decisions are evaluated homomorphically — execution logic stays hidden from searchers
      and front-running bots throughout the entire lifecycle.
    </p>

    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {STRATEGY_ROWS.map(({ label, value }) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "#64748b" }}>{label}</span>
          <span style={{ color: colors.primary, fontWeight: 600 }}>{value}</span>
        </div>
      ))}
    </div>
  </div>
);

// ─── Security Badge Pair ──────────────────────────────────────────────────────

interface SecurityBadgeItem {
  icon:       string;
  title:      string;
  subtitle:   string;
  badge:      string;
  badgeColor: string;
}

const BADGE_ITEMS: SecurityBadgeItem[] = [
  { icon: "lock",  title: "Encrypt REFHE",  subtitle: "FHE · Devnet sim",   badge: "FHE",   badgeColor: "#a78bfa" },
  { icon: "group", title: "Ika dWallet",    subtitle: "2PC-MPC · Devnet",   badge: "MPC",   badgeColor: colors.primary  },
];

const PROGRAM_ID = "G8SzxHU2uHnxNSvjXhdgfHmjGjBL4hdzm1frkHyYbusS";

export const SecurityBadges: React.FC = () => {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {BADGE_ITEMS.map((item) => (
        <div
          key={item.title}
          style={{
            background:   colors.surfaceContainerLow,
            borderRadius: 16,
            padding:      "16px 20px",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "space-between",
            flex:         1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${colors.primaryContainer}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MaterialIcon name={item.icon} size={18} style={{ color: colors.primary }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#fff", fontFamily: fontFamily.headline }}>
                {item.title}
              </div>
              <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.10em" }}>
                {item.subtitle}
              </div>
            </div>
          </div>
          <span
            style={{
              fontSize:      9,
              fontWeight:    700,
              background:    `${item.badgeColor}20`,
              color:         item.badgeColor,
              padding:       "4px 10px",
              borderRadius:  4,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
            }}
          >
            {item.badge}
          </span>
        </div>
      ))}

      {/* Audit reports — opens devnet program on Solana Explorer */}
      <button
        onClick={() =>
          window.open(
            `https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`,
            "_blank",
            "noopener,noreferrer"
          )
        }
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          gap:            8,
          padding:        "12px 0",
          background:     hovered ? `${colors.primary}12` : "transparent",
          border:         `1px solid ${hovered ? colors.primary + "60" : colors.outlineVariant + "60"}`,
          borderRadius:   12,
          color:          hovered ? colors.primary : colors.onSurfaceVariant,
          fontSize:       11,
          fontWeight:     700,
          textTransform:  "uppercase",
          letterSpacing:  "0.12em",
          cursor:         "pointer",
          fontFamily:     fontFamily.headline,
          transition:     "all 0.2s",
        }}
      >
        <MaterialIcon name="security" size={14} />
        View Audit Reports
      </button>
    </div>
  );
};
