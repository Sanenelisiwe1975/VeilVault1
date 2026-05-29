
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";
export type NavItem = "Portfolio" | "Vaults" | "Strategy" | "Security" | "Settings";
export type ActiveTab = "Overview" | "Yields" | "History";
export type ViewMode = "Grid" | "List";
export type SortOption = "Highest APY" | "Lowest APY" | "Highest TVL" | "Newest";
export type RiskFilter = "All Levels" | "High Risk" | "Medium Risk" | "Low Risk";
export type AssetFilter = "All Assets" | "ETH" | "USDC" | "WBTC" | "DAI";
export type TimeRange = "1W" | "1M" | "1Y";
export type DepositWithdraw = "Deposit" | "Withdraw";
export type AccentColor = "primary" | "tertiary" | "error";
export type BadgeType = "confidential" | "limited";


export interface Asset {
  symbol: string;
}

export interface RiskComponent {
  label: string;
  value: string;
  color: AccentColor;
}

export interface Vault {
  id: string;
  name: string;
  subtitle: string;
  risk: RiskLevel;
  apy: number;
  apyLabel: string;
  tvl: string;
  assets: Asset[];
  icon: string;
  iconGradient: string;
  badge: string;
  badgeType: BadgeType;
  baseApy?: number;
  boost?: number;
  description?: string;
  riskComponents?: RiskComponent[];
  isWide?: boolean;
}

export interface PortfolioPosition {
  id: string;
  name: string;
  subtitle: string;
  netValue: string;
  allTimeYield: string;
  apy: string;
  privacyBars: number;
  icon: string;
}

export interface ActivityItem {
  type: string;
  amount: string;
  time: string;
}

export interface SecurityItem {
  label: string;
  value: string;
}

export interface MaterialIconProps {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number;
  style?: React.CSSProperties;
}

export interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export interface BadgeProps {
  text: string;
  type: BadgeType;
}

export interface RiskDotProps {
  risk: RiskLevel;
}

export interface PrivacyBarsProps {
  count: number;
  total?: number;
}

export interface APYBadgeProps {
  value: string;
}

export interface VaultCardProps {
  vault: Vault;
  onOpen?: () => void;
}

export interface SidebarProps {
  activeNav: NavItem;
  onNavChange: (nav: NavItem) => void;
  onHome?: () => void;
}

export interface HeaderProps {
  activeTab:      ActiveTab;
  onTabChange:    (tab: ActiveTab) => void;
  onHome?:        () => void;
  searchQuery?:   string;
  onSearchChange?:(q: string) => void;
}
