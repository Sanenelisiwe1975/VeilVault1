import React, { useState } from "react";
import { WalletContextProvider } from "./context/WalletContextProvider";
import { colors, fontFamily } from "./constants/theme";
import { useNavigation } from "./hooks/useNavigation";
import { useIsMobile } from "./hooks/useIsMobile";
import { useWalletSession } from "./context/WalletSession";

import { OnboardingFlow, isOnboarded } from "./pages/OnboardingFlow";
import { LandingPage }       from "./pages/LandingPage";
import { PortfolioPage }     from "./pages/PortfolioPage";
import { VaultsBrowserPage } from "./pages/VaultsBrowserPage";
import { VaultDetailPage }   from "./pages/VaultDetailPage";
import { StrategyPage }      from "./pages/StrategyPage";
import { SecurityPage }      from "./pages/SecurityPage";
import { SettingsPage }      from "./pages/SettingsPage";
import { StokvelPage }       from "./pages/StokvelPage";
import { IdentityPage }      from "./pages/IdentityPage";
import { PrivacyPoolPage }   from "./pages/PrivacyPoolPage";
import { PaymentsPage }      from "./pages/PaymentsPage";
import { AssetsPage }        from "./pages/AssetsPage";
import { AnalyticsPage }     from "./pages/AnalyticsPage";

import { Sidebar }       from "./components/layout/Sidebar";
import { Header }        from "./components/layout/Header";
import { MobileNav }     from "./components/layout/MobileNav";
import { ConnectModal }  from "./components/ui/ConnectModal";
import { MaterialIcon }  from "./components/ui";

import type { NavItem } from "./types";

// ─── Connect bar ──────────────────────────────────────────────────────────────
function ConnectBar() {
  const { isConnected, address, disconnect } = useWalletSession();
  const [showModal, setShowModal] = useState(false);

  if (isConnected && address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: `${colors.primary}18`, border: `1px solid ${colors.primary}30`, cursor: "pointer" }}
        onClick={disconnect}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
        <span style={{ fontSize: 12, color: colors.primary, fontFamily: fontFamily.body }}>
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <MaterialIcon name="logout" size={13} style={{ color: colors.outline }} />
      </div>
    );
  }

  return (
    <>
      {showModal && <ConnectModal onClose={() => setShowModal(false)} onConnected={() => setShowModal(false)} />}
      <button
        type="button"
        onClick={() => setShowModal(true)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 20, background: `${colors.primary}22`, border: `1px solid ${colors.primary}44`, color: colors.primary, cursor: "pointer", fontSize: 12, fontFamily: fontFamily.headline }}>
        <MaterialIcon name="key" size={14} />
        Connect Wallet
      </button>
    </>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ onHome }: { onHome: () => void }) {
  const isMobile = useIsMobile();
  const { activeNav, activeTab, setActiveTab, handleNavChange } = useNavigation();
  const [showVaultDetail, setShowVaultDetail] = useState(false);

  const handleNav = (nav: NavItem) => {
    setShowVaultDetail(false);
    handleNavChange(nav);
  };

  const renderPage = () => {
    if (showVaultDetail) return <VaultDetailPage />;
    switch (activeNav) {
      case "Portfolio":  return <PortfolioPage />;
      case "Vaults":     return <VaultsBrowserPage onOpenVault={() => setShowVaultDetail(true)} />;
      case "Stokvel":    return <StokvelPage />;
      case "Identity":   return <IdentityPage />;
      case "Strategy":   return <StrategyPage />;
      case "Pool":       return <PrivacyPoolPage />;
      case "Payments":   return <PaymentsPage />;
      case "Assets":     return <AssetsPage />;
      case "Analytics":  return <AnalyticsPage />;
      case "Security":   return <SecurityPage />;
      case "Settings":   return <SettingsPage />;
      default:           return <PortfolioPage />;
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: colors.surface }}>
      {!isMobile && (
        <Sidebar activeNav={activeNav} onNavChange={handleNav} onHome={onHome} />
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", marginLeft: !isMobile ? 272 : 0 }}>
        {/* Inject ConnectBar into header area */}
        <div style={{ position: "relative" }}>
          <Header activeTab={activeTab} onTabChange={setActiveTab} />
          <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", zIndex: 10 }}>
            <ConnectBar />
          </div>
        </div>
        <main style={{ flex: 1, overflowY: "auto", paddingBottom: isMobile ? 80 : 0 }}>
          {renderPage()}
        </main>
      </div>

      {isMobile && (
        <MobileNav activeNav={activeNav} onNavChange={handleNav} onHome={onHome} />
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
type Screen = "landing" | "onboarding" | "app";

export default function App() {
  const [screen, setScreen] = useState<Screen>(() =>
    isOnboarded() ? "app" : "landing"
  );

  return (
    <WalletContextProvider>
      {screen === "landing" && (
        <LandingPage onLaunch={() => setScreen(isOnboarded() ? "app" : "onboarding")} />
      )}
      {screen === "onboarding" && (
        <OnboardingFlow onComplete={() => setScreen("app")} />
      )}
      {screen === "app" && (
        <Dashboard onHome={() => setScreen("landing")} />
      )}
    </WalletContextProvider>
  );
}
