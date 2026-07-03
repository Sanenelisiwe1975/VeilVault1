import React, { useState } from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon, GradientButton, CollapsibleSection } from "../components/ui";
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

const EXPLORER = "https://stellar.expert/explorer/testnet";

const PRESETS = [
  { label: "Conservative", drawdown: 500,  rebalance: 300, stopLoss: 800  },
  { label: "Balanced",     drawdown: 1000, rebalance: 500, stopLoss: 1500 },
  { label: "Aggressive",   drawdown: 2000, rebalance: 800, stopLoss: 2500 },
];

export const StrategyPage: React.FC = () => {
  const {
    vaultExists, dwalletApproved, vault, vaultContractId,
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
            Private & protected
          </span>
        </div>
        <h2 style={{ fontFamily: fontFamily.headline, fontSize: isMobile ? 28 : 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", marginBottom: 8 }}>
          Investment Settings
        </h2>
        <p style={{ color: colors.onSurfaceVariant, fontSize: 14 }}>
          Choose how cautious or aggressive your investments should be. Your exact settings
          are encrypted — only a public fingerprint of them is stored, so no one (including us)
          can see or front-run your strategy.
        </p>
      </div>

      {/* ── Current state ── */}
      {vault && (
        <div style={{ background: colors.surfaceContainerLow, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>
            Your saved settings
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontFamily: "monospace", fontSize: 13, color: vault.strategyParamsSet ? colors.primary : "#64748b" }}>
                {vault.strategyParamsSet ? shortenHash(vault.strategyParamsHash) : "Nothing saved yet"}
              </p>
              <p style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                {vault.strategyParamsSet ? "Encrypted and verified on-chain" : "Choose a setting below to get started"}
              </p>
            </div>
            {vault.strategyParamsSet && vaultContractId && (
              <button
                type="button"
                onClick={() => window.open(`${EXPLORER}/contract/${vaultContractId}`, "_blank")}
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

          {/* Live plain-language summary of the selected limits */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
            {[
              `Never lose more than ${(drawdown / 100).toFixed(0)}%`,
              `Rebalance at ${(rebalance / 100).toFixed(0)}% drift`,
              `Stop everything at ${(stopLoss / 100).toFixed(0)}%`,
            ].map(pill => (
              <span key={pill} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: `${colors.primary}14`, borderRadius: 20,
                padding: "4px 11px", fontSize: 11, fontWeight: 600,
                color: colors.primary, fontFamily: fontFamily.body,
              }}>
                <MaterialIcon name="shield" size={11} />
                {pill}
              </span>
            ))}
          </div>

          {[
            { label: "Maximum loss you'll tolerate", value: drawdown,  setter: setDrawdown,  max: 5000 },
            { label: "Auto-adjust sensitivity",       value: rebalance, setter: setRebalance, max: 2000 },
            { label: "Stop-loss limit",               value: stopLoss,  setter: setStopLoss,  max: 5000 },
          ].map(({ label, value, setter, max }) => (
            <div key={label} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: colors.onSurfaceVariant }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>
                  {(value / 100).toFixed(1)}% <span style={{ color: "#64748b", fontWeight: 400 }}>({value} bps)</span>
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
              These settings stay encrypted and private once saved
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
            {loading ? "Saving…" : "Save Settings"}
          </GradientButton>
          {!ready && (
            <p style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 8 }}>
              Complete vault setup first
            </p>
          )}
        </div>

        {/* ── How it works info card ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: colors.surfaceContainerLow, borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14 }}>
              How this works
            </p>
            {[
              { icon: "lock",         text: "Your settings are encrypted before they're saved" },
              { icon: "fingerprint",  text: "Only a public fingerprint is stored on-chain"     },
              { icon: "shield_lock",  text: "That fingerprint is checked before anything runs" },
              { icon: "verified",     text: "Four automatic safety limits are always enforced" },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <MaterialIcon name={icon} size={14} style={{ color: colors.primary, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: colors.onSurfaceVariant }}>{text}</span>
              </div>
            ))}
          </div>

          <CollapsibleSection
            title="Advanced: manual execution"
            subtitle="Directly trigger a strategy run — most people don't need this"
            icon="terminal"
          >
            <div>
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
                Transfers XLM from vault to protocol under FHE guardrails. Proof is built from the on-chain strategy hash.
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
                aria-label="Amount of XLM to execute"
                placeholder="Amount in XLM"
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
          </CollapsibleSection>
        </div>
      </div>
    </section>
  );
};
