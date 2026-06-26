import React, { useState } from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon } from "../ui";

// ─── Investment Strategy Card ─────────────────────────────────────────────────

const STRATEGY_ROWS = [
  { label: "Risk level",        value: "Balanced"                 },
  { label: "Rebalancing",       value: "Automatic, kept private"  },
  { label: "Supported assets",  value: "XLM (BTC/ETH coming soon)"},
  { label: "Maximum loss limit",value: "20% — enforced automatically" },
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
      Your strategy's exact rules stay private and encrypted — even we can't see them.
      This keeps bots from front-running your trades, and a built-in loss limit protects
      your funds automatically, without anyone needing to step in.
    </p>

    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {STRATEGY_ROWS.map(({ label, value }) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "#64748b" }}>{label}</span>
          <span style={{ color: colors.primary, fontWeight: 600 }}>{value}</span>
        </div>
      ))}
    </div>

    <p style={{ color: "#475569", fontSize: 10, lineHeight: 1.6, marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      Technical: strategy parameters are stored as an FHE ciphertext on-chain; rebalancing
      decisions are evaluated homomorphically, so execution logic is never exposed.
    </p>
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
  { icon: "lock",  title: "Private by design",    subtitle: "Your strategy stays encrypted",  badge: "FHE", badgeColor: "#a78bfa" },
  { icon: "group", title: "Multi-party custody",  subtitle: "No single point of failure",     badge: "MPC", badgeColor: colors.primary },
];

interface SecurityBadgesProps {
  contractId?: string | null;
}

export const SecurityBadges: React.FC<SecurityBadgesProps> = ({ contractId }) => {
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

      {/* Opens the real deployed contract on a public Stellar explorer, so
          anyone can independently verify it — not a third-party audit. */}
      <button
        type="button"
        disabled={!contractId}
        onClick={() => contractId && window.open(
          `https://stellar.expert/explorer/testnet/contract/${contractId}`,
          "_blank",
          "noopener,noreferrer"
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          gap:            8,
          padding:        "12px 0",
          background:     hovered && contractId ? `${colors.primary}12` : "transparent",
          border:         `1px solid ${hovered && contractId ? colors.primary + "60" : colors.outlineVariant + "60"}`,
          borderRadius:   12,
          color:          !contractId ? colors.outline + "80" : hovered ? colors.primary : colors.onSurfaceVariant,
          fontSize:       11,
          fontWeight:     700,
          textTransform:  "uppercase",
          letterSpacing:  "0.12em",
          cursor:         contractId ? "pointer" : "not-allowed",
          fontFamily:     fontFamily.headline,
          transition:     "all 0.2s",
        }}
      >
        <MaterialIcon name="visibility" size={14} />
        Verify on Public Explorer
      </button>
    </div>
  );
};
