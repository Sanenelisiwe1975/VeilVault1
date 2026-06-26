import React from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon } from "../components/ui";
import { useVault } from "../hooks";
import { useIsMobile } from "../hooks";

const EXPLORER = "https://stellar.expert/explorer/testnet";

const CHAINS = [
  { icon: "circle",             label: "Stellar",   note: "Native — used directly",        color: "#7DF9FF" },
  { icon: "currency_bitcoin",   label: "Bitcoin",  note: "Via secure multi-party custody",  color: "#F7931A" },
  { icon: "token",              label: "Ethereum", note: "Via secure multi-party custody",  color: "#627EEA" },
  { icon: "real_estate_agent",  label: "RWAs",     note: "Via secure multi-party custody",  color: colors.secondary },
];

export const SecurityPage: React.FC = () => {
  const { vaultExists, dwalletApproved, vault, vaultContractId } = useVault();
  const isMobile = useIsMobile();

  const drawdownUsedPct = vault
    ? Math.max(0, ((vault.totalDepositedSol - vault.netValueSol) / (vault.totalDepositedSol || 1)) * 100)
    : 0;

  const GUARDRAILS = [
    {
      icon:    "trending_down",
      label:   "Max Drawdown",
      value:   "20%",
      status:  `${drawdownUsedPct.toFixed(1)}% used`,
      color:   drawdownUsedPct > 15 ? colors.error : "#4ade80",
      desc:    "Vault auto-pauses if net value drops more than 20% below total deposits.",
    },
    {
      icon:    "payments",
      label:   "Spending Limit",
      value:   "20 XLM / tx",
      status:  "enforced",
      color:   "#4ade80",
      desc:    "No single strategy execution can transfer more than 20 XLM per transaction.",
    },
    {
      icon:    "timer",
      label:   "Time Lock",
      value:   "0 s",
      status:  "no lock",
      color:   colors.tertiary,
      desc:    "Minimum time between strategy executions. Set to 0 for testing; a live deployment would use a longer delay.",
    },
    {
      icon:    "verified_user",
      label:   "Protocol Whitelist",
      value:   "1 approved",
      status:  "owner wallet",
      color:   "#4ade80",
      desc:    "Funds can only ever move to pre-approved destinations. On testnet, that's the owner wallet acting as a stand-in.",
    },
  ];

  return (
    <section className="blur-in" style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1000, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: fontFamily.headline, fontSize: isMobile ? 28 : 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", marginBottom: 8 }}>
          Security Overview
        </h2>
        <p style={{ color: colors.onSurfaceVariant, fontSize: 14 }}>
          These limits are enforced automatically by the blockchain itself — not by us. No one,
          including the team behind VeilVault, can switch them off or bypass them.
        </p>
      </div>

      {/* ── Vault status ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)",
        gap: 12, marginBottom: 28,
      }}>
        {[
          { label: "Vault",         icon: "lock_open",       active: vaultExists,     yes: "Set up",            no: "Not set up"    },
          { label: "Multi-chain",   icon: "hub",             active: dwalletApproved, yes: "Approved",          no: "Not approved"  },
          { label: "Strategy",      icon: "visibility_off",  active: vault?.strategyParamsSet ?? false, yes: "Saved & encrypted", no: "Not set up yet" },
        ].map(({ label, icon, active, yes, no }) => (
          <div key={label} style={{
            background: colors.surfaceContainerLow, borderRadius: 10, padding: "14px 16px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: active ? "#4ade8018" : "#64748b18",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MaterialIcon name={icon} size={16} style={{ color: active ? "#4ade80" : "#64748b" }} />
            </div>
            <div>
              <p style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>{label}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: active ? "#4ade80" : "#64748b" }}>{active ? yes : no}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* ── Guardrails ── */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14 }}>
            Automatic Safety Limits
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {GUARDRAILS.map(({ icon, label, value, status, color, desc }) => (
              <div key={label} style={{ background: colors.surfaceContainerLow, borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <MaterialIcon name={icon} size={16} style={{ color }} />
                  <span style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 13, color: "#fff", flex: 1 }}>{label}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color, fontWeight: 700 }}>{value}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, background: `${color}18`, color, padding: "2px 8px",
                    borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{status}</span>
                </div>
                <p style={{ fontSize: 11, color: "#475569", lineHeight: 1.5 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Multi-chain support */}
          <div style={{ background: colors.surfaceContainerLow, borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <MaterialIcon name="hub" size={16} style={{ color: colors.primary }} />
              <p style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 13, color: "#fff" }}>
                Multi-Chain Support
              </p>
              <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, background: dwalletApproved ? "#4ade8018" : "#64748b18",
                color: dwalletApproved ? "#4ade80" : "#64748b", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" as const }}>
                {dwalletApproved ? "Active" : "Inactive"}
              </span>
            </div>
            {CHAINS.map(({ icon, label, note, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <MaterialIcon name={icon} size={14} style={{ color }} />
                <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 11, color: "#475569", marginLeft: "auto" }}>{note}</span>
              </div>
            ))}
          </div>

          {/* Contract verification */}
          <div style={{ background: colors.surfaceContainerLow, borderRadius: 10, padding: "16px 18px" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>
              Verify This Contract
            </p>
            {vaultContractId ? (
              <>
                <p style={{ fontFamily: "monospace", fontSize: 11, color: colors.primary, marginBottom: 4,
                  wordBreak: "break-all" as const }}>{vaultContractId}</p>
                <p style={{ fontSize: 10, color: "#64748b", marginBottom: 12 }}>
                  All three open the same public contract page — independently verifiable by anyone.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "Contract Overview", href: `${EXPLORER}/contract/${vaultContractId}` },
                    { label: "Recent Activity",   href: `${EXPLORER}/contract/${vaultContractId}` },
                    { label: "Verify Source",     href: `${EXPLORER}/contract/${vaultContractId}` },
                  ].map(({ label, href }) => (
                    <button key={label} type="button"
                      onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: "transparent", border: `1px solid ${colors.outlineVariant}30`,
                        borderRadius: 6, padding: "8px 12px",
                        color: colors.onSurfaceVariant, fontSize: 12, fontWeight: 600,
                        cursor: "pointer", fontFamily: fontFamily.headline,
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = colors.primary + "40"; e.currentTarget.style.color = colors.primary; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = colors.outlineVariant + "30"; e.currentTarget.style.color = colors.onSurfaceVariant; }}
                    >
                      {label}
                      <MaterialIcon name="open_in_new" size={12} />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ fontSize: 12, color: "#64748b" }}>Connect your wallet to see contract details.</p>
            )}
          </div>

          {/* Private computation info */}
          <div style={{ background: `linear-gradient(135deg, ${colors.primaryContainer}22, ${colors.secondaryContainer}18)`,
            borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <MaterialIcon name="visibility_off" size={16} style={{ color: colors.primary }} />
              <p style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 13, color: "#fff" }}>
                Private by Design
              </p>
              <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, background: `${colors.primary}18`,
                color: colors.primary, padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" as const }}>
                FHE
              </span>
            </div>
            <p style={{ fontSize: 11, color: colors.onSurfaceVariant, lineHeight: 1.6 }}>
              Your strategy settings are encrypted before they ever leave your device. Only a public
              fingerprint is stored on-chain — enough to verify nothing was tampered with, without
              revealing the settings themselves.
            </p>
            <p style={{ fontSize: 10, color: "#475569", marginTop: 8 }}>
              Technical: AES-GCM ciphertext with a SHA-256 commitment hash; testnet uses a simulated FHE backend.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
