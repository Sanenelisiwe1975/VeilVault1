import React from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon } from "../ui";
import { useIsMobile } from "../../hooks";

interface InfoCardData {
  icon:    string;
  title:   string;
  content: string;
  badge?:  string;
}

const INFO_CARDS: InfoCardData[] = [
  {
    icon:    "history",
    title:   "Recent Security Event",
    content: "FHE key shard rotation completed successfully 4 hours ago. All vault operations remained online during the process.",
  },
  {
    icon:    "auto_awesome",
    title:   "Strategy Suggestion",
    content: "Based on your risk profile, diversifying 15% of Stable Shield into the new 'Solana Sentinel' vault could increase projected monthly yield by 2.4%.",
  },
  {
    icon:    "hub",
    title:   "Network Status",
    content: "Global node latency currently at 14ms across primary regions.",
    badge:   "OPERATIONAL",
  },
];

export const InfoCards: React.FC = () => {
  const isMobile = useIsMobile();
  return (
  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? 12 : 20 }}>
    {INFO_CARDS.map((card) => (
      <div key={card.title} style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 22 }}>
        <MaterialIcon name={card.icon} size={20} style={{ color: colors.onSurfaceVariant, marginBottom: 12, display: "block" }} />

        <h4
          style={{
            fontFamily: fontFamily.headline,
            fontWeight: 700,
            fontSize:   15,
            color:      "#fff",
            marginBottom: 6,
            display:    "flex",
            alignItems: "center",
            gap:        8,
          }}
        >
          {card.title}
          {card.badge && (
            <span
              style={{
                fontSize:      9,
                fontWeight:    700,
                background:    "#4ade8020",
                color:         "#4ade80",
                padding:       "2px 8px",
                borderRadius:  2,
                textTransform: "uppercase",
                letterSpacing: "0.10em",
              }}
            >
              {card.badge}
            </span>
          )}
        </h4>

        <p style={{ color: colors.onSurfaceVariant, fontSize: 12, lineHeight: 1.65 }}>
          {card.content}
        </p>
      </div>
    ))}
  </div>
  );
};
