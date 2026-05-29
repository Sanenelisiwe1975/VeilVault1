import React from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon } from "../ui";
import { useIsMobile } from "../../hooks";

interface VaultDetailHeaderProps {
  breadcrumb:  string;
  title:       string;
  description: string;
  netApy:      string;
  tvl:         string;
}

export const VaultDetailHeader: React.FC<VaultDetailHeaderProps> = ({
  breadcrumb, title, description, netApy, tvl,
}) => {
  const isMobile = useIsMobile();
  return (
  <div style={{ marginBottom: 24 }}>
    {/* Breadcrumb */}
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", cursor: "pointer" }}>
        Vaults
      </span>
      <MaterialIcon name="chevron_right" size={14} style={{ color: "#475569" }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: colors.primary, textTransform: "uppercase", letterSpacing: "0.12em" }}>
        {breadcrumb}
      </span>
    </div>

    {/* Title */}
    <h2
      style={{
        fontFamily:    fontFamily.headline,
        fontSize:      isMobile ? 28 : 44,
        fontWeight:    800,
        letterSpacing: "-0.03em",
        color:         "#fff",
        marginBottom:  12,
        lineHeight:    1.1,
      }}
    >
      {title}
    </h2>
    <p style={{ color: colors.onSurfaceVariant, fontSize: 14, marginBottom: 20 }}>
      {description}
    </p>

    {/* Stats */}
    <div style={{ display: "flex", gap: isMobile ? 24 : 32 }}>
      {[
        { label: "Net APY",            value: netApy, color: colors.tertiary },
        { label: "Total Value Locked", value: tvl,    color: "#fff"          },
      ].map(({ label, value, color }) => (
        <div key={label}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.15em", display: "block", marginBottom: 4 }}>
            {label}
          </span>
          <div style={{ fontFamily: fontFamily.headline, fontSize: isMobile ? 26 : 38, fontWeight: 900, color, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  </div>
  );
};
