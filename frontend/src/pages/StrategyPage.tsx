import React, { useState } from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon, GradientButton } from "../components/ui";
import { useVault } from "../hooks";
import { useIsMobile } from "../hooks";
import { X402_FEE_LAMPORTS, formatX402Fee } from "../../lib/x402";

function shortenHash(h: Uint8Array): string {
  const hex = Array.from(h).map(x => x.toString(16).padStart(2, "0")).join("");
  return `0x${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

function shortenSig(sig: string) {
  return `${sig.slice(0, 6)}…${sig.slice(-6)}`;
}

const EXPLORER = "https://explorer.solana.com";
const PROGRAM  = "G8SzxHU2uHnxNSvjXhdgfHmjGjBL4hdzm1frkHyYbusS";

const PRESETS = [
  { label: "Conservative", drawdown: 500,  rebalance: 300, stopLoss: 800  },
  { label: "Balanced",     drawdown: 1000, rebalance: 500, stopLoss: 1500 },
  { label: "Aggressive",   drawdown: 2000, rebalance: 800, stopLoss: 2500 },
];

export const StrategyPage: React.FC = () => {
  const {
    vaultExists, dwalletApproved, vault,
    loading, error, txSig,
    updateStrategyParams, executeStrategy,
  } = useVault();
  const isMobile = useIsMobile();

  const [drawdown,  setDrawdown]  = useState(1000);
  const [rebalance, setRebalance] = useState(500);
  const [stopLoss,  setStopLoss]  = useState(1500);
  const [execAmt,   setExecAmt]   = useState("0.05");

  const ready = vaultExists && dwalletApproved;

  return (
    <section className="blur-in" style={{ padding: isMobile ? "16px" : "32px", maxWidth: 900, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8,
          background: `${colors.primary}14`, border: `1px solid ${colors.primary}28`,
          borderRadius: 6, padding: "5px 14px", marginBottom: 16 }}>
          <MaterialIcon name="visibility_off" size={13} style={{ color: colors.primary }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: colors.primary, textTransform: "uppercase" }}>
            Encrypt REFHE — FHE Active
          </span>
        </div>
        <h2 style={{ fontFamily: fontFamily.headline, fontSize: isMobile ? 28 : 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", marginBottom: 8 }}>
          Strategy Parameters
        </h2>
        <p style={{ color: colors.onSurfaceVariant, fontSize: 14 }}>
          Parameters are AES-GCM encrypted via Encrypt REFHE before being stored on-chain.
          Only the SHA-256 hash commitment is public — execution logic stays hidden.
        </p>
      </div>

      {/* ── Current state ── */}
      {vault && (
        <div style={{ background: colors.surfaceContainerLow, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>
            On-chain commitment
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontFamily: "monospace", fontSize: 13, color: vault.strategyParamsSet ? colors.primary : "#64748b" }}>
                {vault.strategyParamsSet ? shortenHash(vault.strategyParamsHash) : "No params stored yet"}
              </p>
              <p style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                {vault.strategyParamsSet ? "SHA-256 ciphertext commitment" : "Set params below to store on-chain"}
              </p>
            </div>
            {vault.strategyParamsSet && (
              <button
                type="button"
                onClick={() => window.open(`${EXPLORER}/address/${PROGRAM}?cluster=devnet`, "_blank")}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "transparent", border: `1px solid ${colors.outlineVariant}40`,
                  borderRadius: 6, padding: "6px 12px",
                  color: colors.onSurfaceVariant, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", fontFamily: fontFamily.headline,
                }}
              >
                <MaterialIcon name="open_in_new" size={13} />
                View on Explorer
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>

        {/* ── Strategy editor ── */}
        <div style={{ background: colors.surfaceContainerLow, borderRadius: 12, padding: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>
            Risk Parameters
          </p>

          {/* Presets */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {PRESETS.map(p => (
              <button key={p.label} type="button"
                onClick={() => { setDrawdown(p.drawdown); setRebalance(p.rebalance); setStopLoss(p.stopLoss); }}
                style={{
                  flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 700,
                  background: drawdown === p.drawdown ? `${colors.primary}18` : "transparent",
                  color: drawdown === p.drawdown ? colors.primary : "#64748b",
                  border: `1px solid ${drawdown === p.drawdown ? colors.primary + "40" : colors.outlineVariant + "30"}`,
                  borderRadius: 6, cursor: "pointer", fontFamily: fontFamily.headline,
                }}>
                {p.label}
              </button>
            ))}
          </div>

          {[
            { label: "Max Drawdown",       value: drawdown,  setter: setDrawdown,  max: 5000, unit: "bps" },
            { label: "Rebalance Trigger",  value: rebalance, setter: setRebalance, max: 2000, unit: "bps" },
            { label: "Stop Loss",          value: stopLoss,  setter: setStopLoss,  max: 5000, unit: "bps" },
          ].map(({ label, value, setter, max, unit }) => (
            <div key={label} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: colors.onSurfaceVariant }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>
                  {value} {unit} ({(value / 100).toFixed(1)}%)
                </span>
              </div>
              <input
                type="range" min={100} max={max} step={50} value={value}
                onChange={e => setter(Number(e.target.value))}
                style={{ width: "100%", accentColor: colors.primary }}
              />
            </div>
          ))}

          <div style={{ height: 1, background: `${colors.outlineVariant}20`, margin: "16px 0" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 12px",
            background: `${colors.primary}08`, borderRadius: 8 }}>
            <MaterialIcon name="lock" size={14} style={{ color: colors.primary }} />
            <span style={{ fontSize: 11, color: colors.onSurfaceVariant }}>
              Will be AES-GCM encrypted via Encrypt REFHE before storing
            </span>
          </div>

          {error && (
            <div style={{ color: "#f87171", fontSize: 11, background: "#7f1d1d22", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
              {error}
            </div>
          )}
          {txSig && !error && (
            <div style={{ color: "#4ade80", fontSize: 11, background: "#14532d22", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontFamily: "monospace" }}>
              ✓ Tx: {shortenSig(txSig)}
            </div>
          )}

          <GradientButton
            fullWidth
            onClick={() => updateStrategyParams(drawdown, rebalance, stopLoss)}
            disabled={loading || !ready}
          >
            {loading ? "Encrypting & Storing…" : "Encrypt & Store On-Chain"}
          </GradientButton>
          {!ready && (
            <p style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 8 }}>
              Complete vault setup first
            </p>
          )}
        </div>

        {/* ── Execution panel ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Execute strategy */}
          <div style={{ background: colors.surfaceContainerLow, borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <MaterialIcon name="play_circle" size={16} style={{ color: colors.tertiary }} />
              <p style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 13, color: "#fff" }}>
                Execute Strategy
              </p>
              {vault?.strategyParamsSet && (
                <span style={{
                  marginLeft: "auto", fontSize: 9, fontWeight: 700,
                  background: `${colors.tertiary}18`, color: colors.tertiary,
                  padding: "3px 8px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: "0.1em",
                }}>FHE Active</span>
              )}
            </div>
            <p style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>
              Transfers SOL from vault to protocol under FHE guardrails. Proof is built from the on-chain strategy hash.
            </p>

            {/* x402 fee banner */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#F7931A18", borderRadius: 8, padding: "8px 12px", marginBottom: 12,
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#F7931A", letterSpacing: "0.05em" }}>402</span>
              <span style={{ fontSize: 11, color: "#94a3b8", flex: 1 }}>
                Payment required · {formatX402Fee(X402_FEE_LAMPORTS)} micropayment bundled atomically with execution
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#F7931A", background: "#F7931A18",
                padding: "2px 7px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
                x402
              </span>
            </div>

            <input
              type="number" min="0.001" step="0.01" value={execAmt}
              onChange={e => setExecAmt(e.target.value)}
              style={{
                width: "100%", background: colors.surfaceContainerHighest,
                border: "none", borderRadius: 8, padding: "10px 12px",
                color: "#fff", fontSize: 14, outline: "none",
                fontFamily: fontFamily.headline, marginBottom: 10,
              }}
            />
            <GradientButton
              fullWidth
              onClick={() => executeStrategy(parseFloat(execAmt))}
              disabled={loading || !vault?.strategyParamsSet}
              style={{ background: `linear-gradient(135deg, ${colors.tertiaryContainer}, ${colors.tertiary})` }}
            >
              {loading ? "Executing…" : "Execute Under FHE Guardrails"}
            </GradientButton>
          </div>

          {/* How it works info card */}
          <div style={{ background: colors.surfaceContainerLow, borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14 }}>
              How FHE Strategy Works
            </p>
            {[
              { icon: "lock",         text: "Strategy params encrypted via Encrypt REFHE" },
              { icon: "fingerprint",  text: "SHA-256 hash stored as on-chain commitment"  },
              { icon: "shield_lock",  text: "Proof verified against hash before execution" },
              { icon: "verified",     text: "4 guardrails enforced by Solana program"      },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <MaterialIcon name={icon} size={14} style={{ color: colors.primary, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: colors.onSurfaceVariant }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
