import React, { useState } from "react";
import { colors, fontFamily } from "../../constants/theme";
import { GradientButton, MaterialIcon } from "../ui";
import { useVault } from "../../hooks";

function shortenSig(sig: string) {
  return `${sig.slice(0, 6)}…${sig.slice(-6)}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ color: "#fff", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export const PerformancePanel: React.FC = () => {
  const {
    vaultExists, dwalletApproved, vault,
    loading, error, txSig,
    executeStrategy, harvestYield, updatePerformance,
  } = useVault();

  const [deployAmt,  setDeployAmt]  = useState("0.05");
  const [harvestAmt, setHarvestAmt] = useState("0.06");

  const ready = vaultExists && dwalletApproved && vault?.strategyParamsSet;

  if (!ready) return null;

  const inputStyle: React.CSSProperties = {
    background:   colors.surfaceContainerHighest,
    border:       "none",
    borderRadius: 8,
    padding:      "8px 12px",
    color:        "#fff",
    fontSize:     14,
    fontFamily:   fontFamily.headline,
    outline:      "none",
    width:        "100%",
    boxSizing:    "border-box",
  };

  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 20 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <MaterialIcon name="insights" size={18} style={{ color: colors.primary }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: fontFamily.headline }}>
          Strategy Execution
        </span>
        {vault.strategyParamsSet && (
          <span style={{
            marginLeft: "auto",
            fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const,
            letterSpacing: "0.12em", padding: "3px 8px",
            borderRadius: 20, color: colors.tertiary,
            background: `${colors.tertiary}18`,
            border: `1px solid ${colors.tertiary}44`,
          }}>
            FHE Active
          </span>
        )}
      </div>

      {/* ── Vault snapshot ── */}
      <div style={{ marginBottom: 16 }}>
        <Row label="Net Value"    value={`${vault.netValueSol.toFixed(4)} SOL`} />
        <Row label="Deployed"     value={`${Math.max(0, vault.totalDepositedSol - vault.netValueSol).toFixed(4)} SOL`} />
        <Row label="Yield Earned" value={`${vault.yieldEarnedSol.toFixed(6)} SOL`} />
        <Row
          label="P&L Report"
          value={vault.perfSummaryStored ? "Encrypted on-chain ✓" : "Not stored yet"}
        />
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 16 }} />

      {/* ── Deploy Capital ── */}
      <div style={{ marginBottom: 16 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase" as const, letterSpacing: "0.12em", marginBottom: 8,
        }}>
          Deploy Capital
        </p>
        <p style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>
          Transfers SOL from vault → protocol under FHE guardrails.{" "}
          <span style={{ color: "#94a3b8" }}>(devnet: owner wallet as mock protocol)</span>
        </p>
        <input
          type="number" min="0.001" step="0.01"
          value={deployAmt}
          onChange={e => setDeployAmt(e.target.value)}
          style={{ ...inputStyle, marginBottom: 8 }}
        />
        <GradientButton
          fullWidth
          onClick={() => executeStrategy(parseFloat(deployAmt))}
          disabled={loading || parseFloat(deployAmt) <= 0}
        >
          {loading ? "Executing…" : "Execute Strategy"}
        </GradientButton>
      </div>

      {/* ── Harvest Yield ── */}
      <div style={{ marginBottom: 16 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase" as const, letterSpacing: "0.12em", marginBottom: 8,
        }}>
          Harvest Yield
        </p>
        <p style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>
          Protocol returns principal + yield. Enter total returned amount.
        </p>
        <input
          type="number" min="0.001" step="0.01"
          value={harvestAmt}
          onChange={e => setHarvestAmt(e.target.value)}
          style={{ ...inputStyle, marginBottom: 8 }}
        />
        <GradientButton
          fullWidth
          onClick={() => harvestYield(parseFloat(harvestAmt))}
          disabled={loading || parseFloat(harvestAmt) <= 0}
          style={{ background: `linear-gradient(135deg, #0f766e, #14b8a6)` }}
        >
          {loading ? "Recording…" : "Return & Record Yield"}
        </GradientButton>
      </div>

      {/* ── Encrypted P&L ── */}
      <div style={{ marginBottom: 12 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, color: "#64748b",
          textTransform: "uppercase" as const, letterSpacing: "0.12em", marginBottom: 8,
        }}>
          Encrypted P&L Report
        </p>
        <p style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>
          Snapshots vault metrics as an FHE-encrypted blob — only the owner can decrypt.
        </p>
        <GradientButton
          fullWidth
          onClick={updatePerformance}
          disabled={loading}
          style={{ background: `linear-gradient(135deg, #6d28d9, #7c3aed)` }}
        >
          {loading ? "Encrypting…" : "Generate Encrypted Report"}
        </GradientButton>
      </div>

      {/* ── Feedback ── */}
      {error && (
        <div style={{
          color: "#f87171", fontSize: 11,
          background: "#7f1d1d22", borderRadius: 8,
          padding: "8px 12px", marginTop: 8,
        }}>
          {error}
        </div>
      )}
      {txSig && !error && (
        <div style={{
          color: "#4ade80", fontSize: 11,
          background: "#14532d22", borderRadius: 8,
          padding: "8px 12px", marginTop: 8,
          fontFamily: fontFamily.body,
        }}>
          ✓ Tx: {shortenSig(txSig)}
        </div>
      )}

      {/* ── Devnet note ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, justifyContent: "center" }}>
        <MaterialIcon name="science" size={12} style={{ color: "#475569" }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase" as const, letterSpacing: "0.12em" }}>
          Devnet · FHE & Ika simulated · Real lamport transfers
        </span>
      </div>
    </div>
  );
};
