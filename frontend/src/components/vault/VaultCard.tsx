import React from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon, Badge, RiskDot, GradientButton } from "../ui";
import { useHover, useIsMobile } from "../../hooks";
import type { VaultCardProps } from "../../types";

// ─── Wide Card (AI-MEV style) ─────────────────────────────────────────────────

const WideVaultCard: React.FC<VaultCardProps> = ({ vault, onOpen }) => {
  const { hovered, onMouseEnter, onMouseLeave } = useHover();
  const isMobile = useIsMobile();

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        gridColumn:    isMobile ? "span 1" : "span 2",
        background:    hovered ? colors.surfaceContainer : colors.surfaceContainerLow,
        borderRadius:  16,
        padding:       isMobile ? 16 : 24,
        transition:    "all 0.5s ease",
        overflow:      "hidden",
        position:      "relative",
        display:       "flex",
        flexDirection: isMobile ? "column" : "row",
        gap:           isMobile ? 16 : 32,
      }}
    >
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <Badge text={vault.badge} type={vault.badgeType} />
      </div>

      {/* Description column */}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 12,
              background: `linear-gradient(135deg, ${colors.primaryContainer}, ${colors.secondaryContainer})`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <MaterialIcon name={vault.icon} size={24} filled style={{ color: "#fff" }} />
          </div>
          <div>
            <h3 style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 18, color: "#fff", marginBottom: 2 }}>
              {vault.name}
            </h3>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {vault.subtitle}
            </span>
          </div>
        </div>

        <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7, marginBottom: 20, maxWidth: 400 }}>
          {vault.description}
        </p>

        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "Base APY", value: `${vault.baseApy}%`, color: "#fff"         },
            { label: "Boost",    value: `+${vault.boost}%`,  color: colors.primary },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                background:   colors.surfaceContainerHighest,
                border:       "1px solid rgba(255,255,255,0.05)",
                borderRadius: 12,
                padding:      "10px 16px",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 900, color, fontFamily: fontFamily.headline }}>{value}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.15em" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk components column */}
      <div
        style={{
          width:         isMobile ? "100%" : 220,
          background:    "rgba(13, 14, 19, 0.50)",
          borderRadius:  12,
          padding:       16,
          border:        "1px solid rgba(255,255,255,0.05)",
          display:       "flex",
          flexDirection: "column",
          justifyContent:"space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16 }}>
            Risk Components
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {vault.riskComponents?.map((rc) => (
              <div key={rc.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: colors.onSurfaceVariant }}>{rc.label}</span>
                <span style={{ fontWeight: 700, color: rc.color === "primary" ? colors.primary : rc.color === "tertiary" ? colors.tertiary : colors.error }}>
                  {rc.value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <GradientButton fullWidth style={{ marginTop: 16 }} onClick={onOpen}>Join Beta</GradientButton>
      </div>
    </div>
  );
};



const StandardVaultCard: React.FC<VaultCardProps> = ({ vault, onOpen }) => {
  const { hovered, onMouseEnter, onMouseLeave } = useHover();

  const apyAccent =
    vault.risk === "HIGH"   ? colors.primary   :
    vault.risk === "MEDIUM" ? colors.secondary :
    colors.tertiary;

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        background:   hovered ? colors.surfaceContainer : colors.surfaceContainerLow,
        borderRadius: 16,
        padding:      24,
        transition:   "all 0.5s ease",
        overflow:     "hidden",
        position:     "relative",
        display:      "flex",
        flexDirection:"column",
      }}
    >
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <Badge text={vault.badge} type={vault.badgeType} />
      </div>

      {/* Icon + Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: 12,
            background: `linear-gradient(135deg, ${colors.primaryContainer}80, ${colors.secondaryContainer}80)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 24px rgba(107, 94, 224, 0.25)",
          }}
        >
          <MaterialIcon name={vault.icon} size={24} filled style={{ color: "#fff" }} />
        </div>
        <div>
          <h3 style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 16, color: "#fff", marginBottom: 4 }}>
            {vault.name}
          </h3>
          <RiskDot risk={vault.risk} />
        </div>
      </div>

      {/* APY */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: fontFamily.headline, fontWeight: 900, fontSize: 44, color: "#fff", lineHeight: 1, letterSpacing: "-0.03em" }}>
          {vault.apy}<span style={{ fontSize: 22, color: apyAccent }}>%</span>
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.15em", marginTop: 4 }}>
          {vault.apyLabel}
        </p>
      </div>

      {/* Metadata */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
          <span style={{ color: "#64748b" }}>Supported Assets</span>
          <div style={{ display: "flex" }}>
            {vault.assets.map((a, i) => (
              <div
                key={i}
                style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: colors.surfaceContainerHighest,
                  border: "1px solid rgba(255,255,255,0.10)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, fontWeight: 700, color: colors.onSurface,
                  marginLeft: i > 0 ? -4 : 0,
                }}
              >
                {a.symbol.slice(0, 4)}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
          <span style={{ color: "#64748b" }}>TVL</span>
          <span style={{ color: "#fff", fontFamily: "monospace", fontWeight: 600 }}>{vault.tvl}</span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onOpen}
        style={{
          width:        "100%",
          marginTop:    24,
          padding:      "11px 0",
          background:   hovered
            ? `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryContainer} 100%)`
            : "rgba(255,255,255,0.05)",
          color:        hovered ? colors.onPrimary : "#fff",
          fontWeight:   700,
          fontSize:     13,
          border:       hovered ? "none" : "1px solid rgba(255,255,255,0.10)",
          borderRadius: 8,
          cursor:       "pointer",
          fontFamily:   fontFamily.headline,
          transition:   "all 0.3s ease",
        }}
      >
        Open Vault
      </button>
    </div>
  );
};


export const VaultCard: React.FC<VaultCardProps> = ({ vault, onOpen }) =>
  vault.isWide
    ? <WideVaultCard  vault={vault} onOpen={onOpen} />
    : <StandardVaultCard vault={vault} onOpen={onOpen} />;
