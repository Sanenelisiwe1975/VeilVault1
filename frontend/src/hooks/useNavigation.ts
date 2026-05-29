import { useState, useCallback } from "react";
import type { NavItem, ActiveTab } from "../types";

interface UseNavigationReturn {
  activeNav:    NavItem;
  activeTab:    ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  handleNavChange: (nav: NavItem) => void;
}

/**
 * Manages top-level page navigation and the header tab state.
 * Automatically resets the active tab to a sensible default
 * whenever the user switches sections.
 */
export function useNavigation(): UseNavigationReturn {
  const [activeNav, setActiveNav] = useState<NavItem>("Vaults");
  const [activeTab, setActiveTab] = useState<ActiveTab>("Overview");

  const handleNavChange = useCallback((nav: NavItem) => {
    setActiveNav(nav);
    if (nav === "Portfolio") setActiveTab("Overview");
    if (nav === "Vaults")    setActiveTab("Yields");
  }, []);

  return { activeNav, activeTab, setActiveTab, handleNavChange };
}
