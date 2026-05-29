import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon, GradientButton } from "../ui";
import { useVault } from "../../hooks";
import type { DepositWithdraw } from "../../types";

const QUICK_PERCENTAGES = [
  { label: "25%",  pct: 25  },
  { label: "50%",  pct: 50  },
  { label: "75%",  pct: 75  },
  { label: "MAX",  pct: 100 },
];

function shortenSig(sig: string): string {
  return `${sig.slice(0, 6)}…${sig.slice(-6)}`;
}

export const DepositPanel: React.FC = () => {
  const { connected } = useWallet();
  const {
    vaultExists, dwalletApproved, vault,
    walletBalanceSol, loading, error, txSig,
    setupStep, setupVault, depositSol, withdrawSol,
  } = useVault();

  const [activeAction, setActiveAction] = useState<DepositWithdraw>("Deposit");
  const [amount, setAmount] = useState("0.00");

  const availableBalance = activeAction === "Deposit"
    ? walletBalanceSol
    : (vault?.netValueSol ?? 0);

  const applyPercent = (pct: number) => {
    const val = ((availableBalance * pct) / 100);
    setAmount(val.toFixed(4));
  };

  const handleConfirm = async () => {
    const sol = parseFloat(amount);
    if (!sol || sol <= 0) return;
    if (activeAction === "Deposit") {
      await depositSol(sol);
    } else {
      await withdrawSol(sol);
    }
    setAmount("0.00");
  };

  // ── Not connected ────────────────────────────────────────────────────────────
  if (!connected) {
    return (
      <div style={{
        background:   colors.surfaceContainerLow,
        borderRadius: 16,
        padding:      32,
        textAlign:    "center",
      }}>
        <MaterialIcon name="account_balance_wallet" size={40}
          style={{ color: colors.outline, marginBottom: 12 }} />
        <p style={{ color: colors.outline, fontSize: 14, fontFamily: fontFamily.body }}>
          Connect your wallet to deposit
        </p>
      </div>
    );
  }

  // ── Vault not set up yet ─────────────────────────────────────────────────────
  if (!vaultExists || !dwalletApproved) {
    return (
      <div style={{
        background:   colors.surfaceContainerLow,
        borderRadius: 16,
        padding:      24,
        textAlign:    "center",
      }}>
        <MaterialIcon name="shield_lock" size={40}
          style={{ color: colors.primary, marginBottom: 12, opacity: 0.7 }} />
        <p style={{
          color:      "#fff",
          fontSize:   15,
          fontWeight: 700,
          fontFamily: fontFamily.headline,
          marginBottom: 8,
        }}>
          Initialise Your Vault
        </p>
        <p style={{ color: colors.outline, fontSize: 13, marginBottom: 20 }}>
          Creates your on-chain vault, registers an Ika dWallet binding, and
          sets encrypted strategy params — 5 transactions total.
        </p>

        {setupStep && (
          <p style={{
            color: colors.primary, fontSize: 12, fontFamily: fontFamily.body,
            background: `${colors.primary}12`, borderRadius: 8,
            padding: "8px 12px", marginBottom: 12,
          }}>
            {setupStep}
          </p>
        )}

        {error && (
          <p style={{
            color: "#f87171", fontSize: 12,
            background: "#7f1d1d22", borderRadius: 8,
            padding: "8px 12px", marginBottom: 12,
          }}>
            {error}
          </p>
        )}

        <GradientButton
          fullWidth
          size="lg"
          onClick={setupVault}
          disabled={loading}
        >
          {loading ? (setupStep ?? "Setting up…") : "Setup Vault + dWallet"}
        </GradientButton>
      </div>
    );
  }

  // ── Vault ready ──────────────────────────────────────────────────────────────
  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 20 }}>

      {/* Deposit / Withdraw toggle */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr",
        background:          colors.surfaceContainerHighest,
        borderRadius:        10,
        padding:             4,
        marginBottom:        20,
      }}>
        {(["Deposit", "Withdraw"] as DepositWithdraw[]).map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => { setActiveAction(action); setAmount("0.00"); }}
            style={{
              padding:      "9px 0",
              fontSize:     13,
              fontWeight:   700,
              background:   activeAction === action ? "#fff" : "transparent",
              color:        activeAction === action ? colors.surface : "#64748b",
              border:       "none",
              borderRadius: 8,
              cursor:       "pointer",
              fontFamily:   fontFamily.headline,
              transition:   "all 0.2s",
            }}
          >
            {action}
          </button>
        ))}
      </div>

      {/* Amount input */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
          marginBottom:   8,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em",
          }}>
            Amount
          </span>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            {activeAction === "Deposit"
              ? `Wallet: ${availableBalance.toFixed(4)} SOL`
              : `Available: ${availableBalance.toFixed(4)} SOL`}
          </span>
        </div>

        <div style={{
          background:    colors.surfaceContainerHighest,
          borderRadius:  10,
          padding:       "14px 16px",
          display:       "flex",
          justifyContent:"space-between",
          alignItems:    "center",
        }}>
          <input
            type="number"
            min="0"
            step="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              background: "transparent",
              border:     "none",
              color:      "#fff",
              fontSize:   22,
              fontWeight: 300,
              fontFamily: fontFamily.headline,
              outline:    "none",
              width:      "60%",
            }}
          />
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          6,
            background:   colors.surfaceContainer,
            padding:      "6px 12px",
            borderRadius: 8,
          }}>
            {/* Solana logo colour */}
            <div style={{
              width: 16, height: 16, borderRadius: "50%",
              background: "linear-gradient(135deg,#9945FF,#14F195)",
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>SOL</span>
          </div>
        </div>
      </div>

      {/* Quick-select percentages */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap:                 8,
        marginBottom:        16,
      }}>
        {QUICK_PERCENTAGES.map(({ label, pct }) => (
          <button
            key={label}
            type="button"
            onClick={() => applyPercent(pct)}
            style={{
              padding:      "7px 0",
              fontSize:     11,
              fontWeight:   700,
              background:   label === "MAX" ? colors.surfaceContainerHighest : "transparent",
              color:        label === "MAX" ? "#fff" : "#64748b",
              border:       `1px solid ${colors.outlineVariant}40`,
              borderRadius: 6,
              cursor:       "pointer",
              fontFamily:   fontFamily.headline,
              transition:   "all 0.2s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Vault stats */}
      {vault && (
        <div style={{ marginBottom: 16 }}>
          {[
            { label: "Deposited",    value: `${vault.totalDepositedSol.toFixed(4)} SOL` },
            { label: "Net Value",    value: `${vault.netValueSol.toFixed(4)} SOL`       },
            { label: "Yield Earned", value: `${vault.yieldEarnedSol.toFixed(6)} SOL`    },
          ].map(({ label, value }) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 12, marginBottom: 6,
            }}>
              <span style={{ color: "#64748b" }}>{label}</span>
              <span style={{ color: "#fff", fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error / success feedback */}
      {error && (
        <div style={{
          color: "#f87171", fontSize: 12,
          background: "#7f1d1d22", borderRadius: 8,
          padding: "8px 12px", marginBottom: 12,
        }}>
          {error}
        </div>
      )}
      {txSig && !error && (
        <div style={{
          color: "#4ade80", fontSize: 11,
          background: "#14532d22", borderRadius: 8,
          padding: "8px 12px", marginBottom: 12,
          fontFamily: fontFamily.body,
        }}>
          ✓ Tx: {shortenSig(txSig)}
        </div>
      )}

      {/* CTA */}
      <GradientButton
        fullWidth
        size="lg"
        style={{ marginBottom: 12 }}
        onClick={handleConfirm}
        disabled={loading}
      >
        {loading ? "Confirming…" : `Confirm ${activeAction}`}
      </GradientButton>

      <div style={{
        display: "flex", alignItems: "center",
        gap: 6, justifyContent: "center",
      }}>
        <MaterialIcon name="lock" size={12} style={{ color: "#64748b" }} />
        <span style={{
          fontSize: 9, fontWeight: 700,
          color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em",
        }}>
          End-to-End Cryptographic Security
        </span>
      </div>
    </div>
  );
};
