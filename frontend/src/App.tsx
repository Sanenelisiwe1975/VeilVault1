import React, { useState } from "react";
import { WalletContextProvider } from "./context/WalletContextProvider";
import { colors } from "./constants/theme";
import { useNavigation } from "./hooks/useNavigation";
import { useIsMobile } from "./hooks/useIsMobile";

import { LandingPage }       from "./pages/LandingPage";
import { PortfolioPage }     from "./pages/PortfolioPage";
import { VaultsBrowserPage } from "./pages/VaultsBrowserPage";
import { VaultDetailPage }   from "./pages/VaultDetailPage";
import { StrategyPage }      from "./pages/StrategyPage";
import { SecurityPage }      from "./pages/SecurityPage";
import { SettingsPage }      from "./pages/SettingsPage";

import { Sidebar }   from "./components/layout/Sidebar";
import { Header }    from "./components/layout/Header";
import { MobileNav } from "./components/layout/MobileNav";

import type { NavItem } from "./types";

function Dashboard() {
  const isMobile = useIsMobile();
  const { activeNav, activeTab, setActiveTab, handleNavChange } = useNavigation();
  const [showVaultDetail, setShowVaultDetail] = useState(false);
  const [showLanding, setShowLanding] = useState(false);

  const handleNav = (nav: NavItem) => {
    setShowVaultDetail(false);
    handleNavChange(nav);
  };

  const renderPage = () => {
    if (showVaultDetail) return <VaultDetailPage />;
    switch (activeNav) {
      case "Portfolio": return <PortfolioPage />;
      case "Vaults":    return <VaultsBrowserPage onOpenVault={() => setShowVaultDetail(true)} />;
      case "Strategy":  return <StrategyPage />;
      case "Security":  return <SecurityPage />;
      case "Settings":  return <SettingsPage />;
      default:          return <PortfolioPage />;
    }
  };

  if (showLanding) {
    return <LandingPage onLaunch={() => setShowLanding(false)} />;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: colors.surface }}>
      {/* Desktop sidebar */}
      {!isMobile && (
        <Sidebar
          activeNav={activeNav}
          onNavChange={handleNav}
          onHome={() => setShowLanding(true)}
        />
      )}

      {/* Main column */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Header activeTab={activeTab} setActiveTab={setActiveTab} />
        <main style={{ flex: 1, overflowY: "auto", paddingBottom: isMobile ? 80 : 0 }}>
          {renderPage()}
        </main>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && (
        <MobileNav
          activeNav={activeNav}
          onNavChange={handleNav}
          onHome={() => setShowLanding(true)}
        />
      )}
    </div>
  );
}

export default function App() {
  const [inApp, setInApp] = useState(false);

  if (!inApp) {
    return (
      <WalletContextProvider>
        <LandingPage onLaunch={() => setInApp(true)} />
      </WalletContextProvider>
    );
  }

  return (
    <WalletContextProvider>
      <Dashboard />
    </WalletContextProvider>
  );
}
