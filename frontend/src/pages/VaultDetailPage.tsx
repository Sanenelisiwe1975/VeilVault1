import React from "react";
import {
  VaultDetailHeader,
  VaultAPYChart,
  InvestmentStrategy,
  SecurityBadges,
  DepositPanel,
  RecentActivityPanel,
  PerformancePanel,
} from "../components/detail";
import { AgentPanel } from "../components/detail/AgentPanel";
import { useVault, useIsMobile } from "../hooks";

export const VaultDetailPage: React.FC = () => {
  const { vault, vaultExists } = useVault();
  const isMobile = useIsMobile();

  // Show real on-chain TVL when available; fall back to placeholder.
  const tvlDisplay = vaultExists && vault
    ? `${vault.netValueSol.toFixed(4)} XLM`
    : "â€”";

  const yieldDisplay = vaultExists && vault && vault.yieldEarnedSol > 0
    ? `+${(vault.yieldEarnedSol / Math.max(vault.totalDepositedSol, 0.0001) * 100).toFixed(2)}%`
    : "â€”";

  return (
    <section className="blur-in" style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>

      {/* â”€â”€ Mobile: action panels first, then chart/info â”€â”€ */}
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <VaultDetailHeader
            breadcrumb="VeilVault â€” Encrypted Yield"
            title="Encrypted Yield Vault"
            description="Deposit native XLM (or bridgeless BTC/ETH via Ika dWallet). Strategy params are FHE-encrypted; guardrails enforced on-chain."
            netApy={yieldDisplay}
            tvl={tvlDisplay}
          />
          <DepositPanel />
          <PerformancePanel />
          <AgentPanel />
          <VaultAPYChart />
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            <InvestmentStrategy />
            <SecurityBadges />
          </div>
          <RecentActivityPanel />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
          {/* â”€â”€ Left column â”€â”€ */}
          <div>
            <VaultDetailHeader
              breadcrumb="VeilVault â€” Encrypted Yield"
              title="Encrypted Yield Vault"
              description="Deposit native XLM (or bridgeless BTC/ETH via Ika dWallet). Strategy params are FHE-encrypted; guardrails enforced on-chain."
              netApy={yieldDisplay}
              tvl={tvlDisplay}
            />
            <VaultAPYChart />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <InvestmentStrategy />
              <SecurityBadges />
            </div>
          </div>

          {/* â”€â”€ Right column â”€â”€ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <DepositPanel />
            <PerformancePanel />
            <AgentPanel />
            <RecentActivityPanel />
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop:     40,
          textAlign:     "center",
          color:         "#334155",
          fontSize:      10,
          fontWeight:    600,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
        }}
      >
        Veil Vault â€¢ FHE by Encrypt Â· Custody by Ika Â· Program:{" "}
        G8SzxHU2uHnxNSvjXhdgfHmjGjBL4hdzm1frkHyYbusS
      </div>
    </section>
  );
};
