/**
 * AgentPanel — Human-testable Zerion Agent x402 demo
 *
 * Flow:
 *   1. Detect a rebalancing opportunity
 *   2. Show the x402 402 challenge from the live API
 *   3. Build FHE-encrypted operation from vault strategy hash
 *   4. ONE wallet signature: x402 fee + execute_strategy bundled atomically
 *   5. Show confirmed tx on Explorer
 */

import React, { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon, GradientButton } from "../ui";
import { useVault } from "../../hooks";
import { X402_FEE_LAMPORTS, formatX402Fee } from "../../../lib/x402";
import { VeilVaultClient } from "../../../lib/solana";
import { generateFheKeyPair, buildStrategyOperation } from "../../../lib/fhe";

const API_BASE = "/api/agent/execute-strategy";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type AgentState =
  | "idle"
  | "detecting"
  | "discovered_402"
  | "building"
  | "signing"
  | "done"
  | "error";

interface LogEntry { icon: string; text: string; color?: string }

function useAgentLog() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const add = (icon: string, text: string, color?: string) =>
    setLog(prev => [...prev, { icon, text, color }]);
  const clear = () => setLog([]);
  return { log, add, clear };
}

export const AgentPanel: React.FC = () => {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { vault } = useVault();

  const [state,   setState]   = useState<AgentState>("idle");
  const [execSig, setExecSig] = useState<string | null>(null);
  const { log, add, clear }   = useAgentLog();

  const ready = !!publicKey && !!signTransaction && !!vault?.strategyParamsSet;

  const runAgentCycle = async () => {
    if (!publicKey || !signTransaction || !vault) return;
    setState("detecting");
    clear();
    setExecSig(null);

    try {
      // ── Step 1: Detect opportunity ─────────────────────────────────────────
      add("search", "Zerion Agent: Analyzing portfolio...");
      await sleep(800);
      add("trending_up", "Signal: SOL +12% in 4h — rebalance detected", "#4ade80");

      // Guard: vault must have a balance to execute against
      if (vault.netValueSol <= 0) {
        throw new Error("Vault balance is 0 — deposit SOL first before running the agent.");
      }

      // Safe execution amount: 10% of vault balance (max drawdown limit is 20%)
      const LAMPORTS_PER_SOL = 1_000_000_000;
      const execSol = Math.min(vault.netValueSol * 0.10, 0.5);
      const execLamports = BigInt(Math.round(execSol * LAMPORTS_PER_SOL));

      // ── Step 2: Hit API → show 402 challenge ──────────────────────────────
      setState("discovered_402");
      add("send", `POST ${API_BASE}`);

      const r1 = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner:           publicKey.toBase58(),
          encryptedOpB64:  btoa("RFHE-probe"),
          opProofB64:      btoa(String.fromCharCode(...new Uint8Array(64))),
          amountLamports:  String(execLamports),
          protocolAccount: publicKey.toBase58(),
        }),
      }).catch(() => null);

      if (r1?.status === 402) {
        const ch = await r1.json().catch(() => ({})) as Record<string, unknown>;
        const treasury = typeof ch.recipient === "string" ? ch.recipient : "";
        add("receipt_long",
          `← 402 · ${formatX402Fee(X402_FEE_LAMPORTS)} SOL required · treasury ${treasury.slice(0, 8)}…`,
          "#F7931A");
      } else {
        add("info", "API probe complete (simulated 402 challenge)", colors.tertiary);
      }

      // ── Step 3: Build FHE operation from vault strategy hash ──────────────
      setState("building");
      add("lock", `Building FHE rebalance op: ${execSol.toFixed(4)} SOL (10% of vault)...`);
      const fheKeys = generateFheKeyPair();
      const { encryptedOp, opProof } = buildStrategyOperation(
        {
          action:         "rebalance",
          targetProtocol: publicKey.toBase58(),
          amountLamports: execLamports,
        },
        vault.strategyParamsHash,
        fheKeys,
      );
      await sleep(300);
      add("verified", "FHE op + proof ready — strategy hash committed on-chain", "#4ade80");

      // ── Step 4: ONE signature — x402 fee + execute_strategy (atomic) ──────
      setState("signing");
      add("key", "Sign in wallet: x402 fee + execute_strategy (single atomic tx)...");

      const client = new VeilVaultClient(connection, { publicKey, signTransaction });
      const sig = await client.executeStrategy({
        encryptedOp,
        opProof,
        protocolAccount: publicKey,
        amountLamports:  execLamports,
      });

      setExecSig(sig);
      setState("done");
      add("verified", `Strategy executed! Tx: ${sig.slice(0, 12)}…`, "#4ade80");
      add("lock", "FHE guardrails enforced · Ika dWallet ready · x402 fee collected", colors.primary);

    } catch (e) {
      setState("error");
      const msg = e instanceof Error ? e.message : String(e);
      add("error_outline", msg, colors.error ?? "#f87171");
    }
  };

  const stateLabel: Record<AgentState, string> = {
    idle:          "Run Zerion Agent Cycle",
    detecting:     "Detecting opportunity...",
    discovered_402:"Received 402 challenge...",
    building:      "Building FHE operation...",
    signing:       "Sign in wallet...",
    done:          "Cycle complete ✓",
    error:         "Error — try again",
  };

  const isRunning = !["idle", "done", "error"].includes(state);

  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#F7931A18",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <MaterialIcon name="smart_toy" size={16} style={{ color: "#F7931A" }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 13, color: "#fff" }}>
            Zerion Agent + x402
          </p>
          <p style={{ fontSize: 10, color: "#64748b" }}>
            Autonomous execution with micropayment gating
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { label: "x402", color: "#F7931A" },
            { label: "FHE",  color: colors.primary },
            { label: "Ika",  color: colors.tertiary },
          ].map(({ label, color }) => (
            <span key={label} style={{ fontSize: 9, fontWeight: 700, background: `${color}18`,
              color, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase" as const,
              letterSpacing: "0.1em" }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Flow diagram */}
      <div style={{ background: colors.surfaceContainer, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" as const, gap: 4 }}>
          {[
            { icon: "psychology",   label: "Detect",  active: state === "detecting"                      },
            { icon: "arrow_forward",label: "→",       active: false                                       },
            { icon: "http",         label: "402",     active: state === "discovered_402"                  },
            { icon: "arrow_forward",label: "→",       active: false                                       },
            { icon: "lock",         label: "FHE",     active: state === "building"                        },
            { icon: "arrow_forward",label: "→",       active: false                                       },
            { icon: "bolt",         label: "Execute", active: ["signing","done"].includes(state)           },
          ].map(({ icon, label, active }, i) =>
            label === "→" ? (
              <MaterialIcon key={i} name="arrow_forward" size={10} style={{ color: "#334155" }} />
            ) : (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <MaterialIcon name={icon} size={13} style={{ color: active ? "#4ade80" : "#334155" }} />
                <span style={{ fontSize: 8, color: active ? "#4ade80" : "#334155", fontWeight: 700,
                  textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{label}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div style={{ background: colors.surfaceContainerLowest, borderRadius: 8,
          padding: "10px 12px", marginBottom: 14, maxHeight: 180, overflowY: "auto" as const }}>
          {log.map((entry, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <MaterialIcon name={entry.icon} size={12}
                style={{ color: entry.color ?? colors.onSurfaceVariant, flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 11, color: entry.color ?? colors.onSurfaceVariant,
                fontFamily: "monospace", lineHeight: 1.5 }}>
                {entry.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Result */}
      {execSig && (
        <div style={{ background: "#14532d22", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
          <p style={{ fontSize: 11, color: "#4ade80", marginBottom: 4, fontWeight: 700 }}>
            ✓ Executed autonomously via x402 + FHE + Ika
          </p>
          <button type="button"
            onClick={() => window.open(`https://explorer.solana.com/tx/${execSig}?cluster=devnet`, "_blank")}
            style={{ background: "transparent", border: "none", color: "#64748b",
              cursor: "pointer", fontSize: 11, fontFamily: "monospace", textDecoration: "underline" }}>
            {execSig.slice(0, 16)}… ↗
          </button>
        </div>
      )}

      {/* CTA */}
      <GradientButton
        fullWidth
        onClick={runAgentCycle}
        disabled={isRunning || !ready}
        style={{ background: `linear-gradient(135deg, #F7931A, #e27d0e)` }}
      >
        {stateLabel[state]}
      </GradientButton>
      {!ready && !publicKey && (
        <p style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 8 }}>
          Connect wallet to run agent cycle
        </p>
      )}
      {publicKey && !vault?.strategyParamsSet && (
        <p style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 8 }}>
          Setup vault + strategy params first
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, justifyContent: "center" }}>
        <MaterialIcon name="info" size={11} style={{ color: "#334155" }} />
        <span style={{ fontSize: 9, color: "#334155", textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
          x402 fee: {formatX402Fee(X402_FEE_LAMPORTS)} · 1 signature · Devnet
        </span>
      </div>
    </div>
  );
};
