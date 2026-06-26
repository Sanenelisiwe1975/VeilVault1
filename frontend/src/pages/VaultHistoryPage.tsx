import React from "react";
import { colors, fontFamily } from "../constants/theme";
import { MaterialIcon } from "../components/ui";
import { useVault } from "../hooks";
import { useIsMobile } from "../hooks";

const EXPLORER = "https://stellar.expert/explorer/testnet";

interface TxRow {
  type:   string;
  icon:   string;
  color:  string;
  amount: string;
  note:   string;
  time:   string;
  status: "confirmed" | "pending";
}

const MOCK_HISTORY: TxRow[] = [
  { type: "Deposit",                 icon: "arrow_downward", color: "#4ade80",       amount: "+10.00 XLM", note: "Vault set up",            time: "2m ago",  status: "confirmed" },
  { type: "Strategy Run",            icon: "play_arrow",     color: colors.primary,  amount: "-1.00 XLM",  note: "Safety limits checked",    time: "5m ago",  status: "confirmed" },
  { type: "Yield Collected",         icon: "trending_up",    color: colors.tertiary, amount: "+0.10 XLM",  note: "Returned from protocol",   time: "6m ago",  status: "confirmed" },
  { type: "Report Saved",            icon: "lock",           color: colors.primary,  amount: "--",         note: "Encrypted snapshot",       time: "6m ago",  status: "confirmed" },
  { type: "Cross-Chain Deposit",     icon: "hub",             color: "#F7931A",       amount: "+5.00 XLM",  note: "From Bitcoin",             time: "12m ago", status: "confirmed" },
  { type: "Strategy Run",            icon: "play_arrow",     color: colors.primary,  amount: "-0.50 XLM",  note: "Loss-limit check passed",  time: "18m ago", status: "confirmed" },
  { type: "Deposit",                 icon: "arrow_downward", color: "#4ade80",       amount: "+2.50 XLM",  note: "Added liquidity",          time: "1h ago",  status: "confirmed" },
  { type: "Multi-Chain Approved",    icon: "verified_user",  color: "#4ade80",       amount: "--",         note: "Custody confirmed",        time: "1h ago",  status: "confirmed" },
];

export const VaultHistoryPage: React.FC = () => {
  const { vault, vaultContractId, txSig } = useVault();
  const isMobile = useIsMobile();

  return (
    <section className="blur-in" style={{ padding: isMobile ? "16px" : "32px", maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h2 style={{ fontFamily: fontFamily.headline, fontSize: isMobile ? 24 : 30, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff" }}>
              Transaction History
            </h2>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#64748b",
              background: "#64748b18", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
              Sample data
            </span>
          </div>
          <p style={{ color: colors.onSurfaceVariant, fontSize: 13 }}>
            Per-transaction history isn't wired up yet — the list below is example activity, not your
            real transactions. Your actual balances above and the chart on the vault page are real.
          </p>
        </div>
        {vaultContractId && (
          <button
            type="button"
            onClick={() => window.open(`${EXPLORER}/contract/${vaultContractId}`, "_blank", "noopener,noreferrer")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "transparent", border: `1px solid ${colors.outlineVariant}40`,
              borderRadius: 6, padding: "8px 14px",
              color: colors.onSurfaceVariant, fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: fontFamily.headline,
            }}
          >
            <MaterialIcon name="open_in_new" size={14} />
            View on Stellar Expert
          </button>
        )}
      </div>

      {/* Latest tx banner */}
      {txSig && (
        <div style={{ background: "#14532d22", borderRadius: 10, padding: "12px 16px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 10 }}>
          <MaterialIcon name="check_circle" size={16} style={{ color: "#4ade80" }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#4ade80" }}>Latest transaction confirmed</p>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b", marginTop: 2 }}>
              {txSig.slice(0, 24)}...{txSig.slice(-8)}
            </p>
          </div>
          <button type="button"
            onClick={() => window.open(`${EXPLORER}/tx/${txSig}`, "_blank", "noopener,noreferrer")}
            style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#4ade80", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700 }}>
            View <MaterialIcon name="open_in_new" size={12} />
          </button>
        </div>
      )}

      {/* Stats row */}
      {vault && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
          {[
            { label: "Deposited",    value: `${vault.totalDepositedSol.toFixed(3)} XLM`, color: "#fff"     },
            { label: "Net Value",    value: `${vault.netValueSol.toFixed(3)} XLM`,       color: "#fff"     },
            { label: "Yield Earned", value: `${vault.yieldEarnedSol.toFixed(5)} XLM`,   color: "#4ade80"  },
            { label: "P&L Report",   value: vault.perfSummaryStored ? "Saved & encrypted" : "None",
              color: vault.perfSummaryStored ? colors.primary : "#64748b" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: colors.surfaceContainerLow, borderRadius: 8, padding: "12px 14px" }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Transaction list */}
      <div style={{ background: colors.surfaceContainerLow, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12,
          padding: "10px 16px", background: colors.surfaceContainer }}>
          {["Transaction", "Amount", "Time", ""].map(h => (
            <span key={h} style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>{h}</span>
          ))}
        </div>

        {MOCK_HISTORY.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12, alignItems: "center", padding: "14px 16px", background: i % 2 !== 0 ? `${colors.surfaceContainerHighest}20` : "transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `${row.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MaterialIcon name={row.icon} size={15} style={{ color: row.color }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", fontFamily: fontFamily.headline }}>{row.type}</p>
                <p style={{ fontSize: 10, color: "#475569" }}>{row.note}</p>
              </div>
            </div>
            <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 600, color: row.amount.startsWith("+") ? "#4ade80" : row.amount.startsWith("-") ? "#f87171" : "#64748b" }}>
              {row.amount}
            </span>
            <span style={{ fontSize: 11, color: "#475569" }}>{row.time}</span>
            <span style={{ fontSize: 9, fontWeight: 700, background: "#4ade8018", color: "#4ade80", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: "0.08em", whiteSpace: "nowrap" as const }}>
              ok
            </span>
          </div>
        ))}

        <div style={{ padding: "12px 16px", background: colors.surfaceContainer, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: 11, color: "#475569" }}>
            Example rows shown above — for your real activity, use the link above to look up this
            contract on a public Stellar explorer
          </p>
        </div>
      </div>
    </section>
  );
};
