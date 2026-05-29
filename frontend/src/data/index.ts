import type {
  Vault,
  PortfolioPosition,
  ActivityItem,
  SecurityItem,
} from "../types";

// ─── Vaults ───────────────────────────────────────────────────────────────────

export const VAULTS: Vault[] = [
  {
    id:          "delta-neutral",
    name:        "Delta Neutral Arbitrage",
    subtitle:    "HIGH RISK",
    risk:        "HIGH",
    apy:         24.8,
    apyLabel:    "Projected Annual Yield",
    tvl:         "$12.4M",
    assets:      [{ symbol: "ETH" }, { symbol: "USDC" }, { symbol: "WBTC" }],
    icon:        "bolt",
    iconGradient:"from-[#c6c0ff] to-[#6b5ee0]",
    badge:       "Confidential",
    badgeType:   "confidential",
  },
  {
    id:          "stable-liquidity",
    name:        "Stable Liquidity Optimizer",
    subtitle:    "MEDIUM RISK",
    risk:        "MEDIUM",
    apy:         12.4,
    apyLabel:    "Projected Annual Yield",
    tvl:         "$48.9M",
    assets:      [{ symbol: "USD" }, { symbol: "DAI" }],
    icon:        "balance",
    iconGradient:"from-[#c3c0ff] to-[#434281]",
    badge:       "Confidential",
    badgeType:   "confidential",
  },
  {
    id:          "treasury-bond",
    name:        "Treasury Bond Proxy",
    subtitle:    "LOW RISK",
    risk:        "LOW",
    apy:         5.2,
    apyLabel:    "Projected Annual Yield",
    tvl:         "$124.2M",
    assets:      [{ symbol: "USDC" }],
    icon:        "shield",
    iconGradient:"from-[#8f609d] to-[#481e57]",
    badge:       "Confidential",
    badgeType:   "confidential",
  },
  {
    id:          "ai-mev",
    name:        "AI-Driven MEV Protection",
    subtitle:    "ADVANCED STRATEGY",
    risk:        "MEDIUM",
    apy:         18.2,
    apyLabel:    "Base APY",
    tvl:         "$8.1M",
    assets:      [{ symbol: "ETH" }],
    icon:        "model_training",
    iconGradient:"from-[#6b5ee0] to-[#434281]",
    badge:       "Limited Access",
    badgeType:   "limited",
    baseApy:     18.2,
    boost:       4.5,
    description:
      "Utilizing advanced machine learning models to anticipate network congestion and front-running attempts, ensuring optimal execution price for all vault interactions.",
    riskComponents: [
      { label: "Smart Contract",   value: "Secure",   color: "primary"  },
      { label: "Market Volatility",value: "Moderate", color: "tertiary" },
      { label: "Liquidity Depth",  value: "High",     color: "primary"  },
    ],
    isWide: true,
  },
  {
    id:          "eth-staking",
    name:        "ETH Liquid Staking",
    subtitle:    "LOW RISK",
    risk:        "LOW",
    apy:         4.1,
    apyLabel:    "Fixed Annual Yield",
    tvl:         "$89.3M",
    assets:      [{ symbol: "ETH" }],
    icon:        "layers",
    iconGradient:"",
    badge:       "Confidential",
    badgeType:   "confidential",
  },
];

// ─── Portfolio ────────────────────────────────────────────────────────────────

export const PORTFOLIO_POSITIONS: PortfolioPosition[] = [
  {
    id:           "eth-alpha",
    name:         "Ethereum Alpha-X",
    subtitle:     "Delta-Neutral Arbitrage",
    netValue:     "$420,105.12",
    allTimeYield: "+$12,402.90",
    apy:          "12.4% APY",
    privacyBars:  3,
    icon:         "account_balance_wallet",
  },
  {
    id:           "stable-shield",
    name:         "Stable Shield USDC",
    subtitle:     "Low-Risk Liquidity Prov.",
    netValue:     "$312,000.00",
    allTimeYield: "+$4,812.11",
    apy:          "6.2% APY",
    privacyBars:  4,
    icon:         "savings",
  },
  {
    id:           "defi-agg",
    name:         "DeFi Aggregator v4",
    subtitle:     "Yield-Compounding Layer",
    netValue:     "$109,998.98",
    allTimeYield: "+$1,092.40",
    apy:          "18.1% APY",
    privacyBars:  2,
    icon:         "layers",
  },
];

// ─── Activity ─────────────────────────────────────────────────────────────────

export const RECENT_ACTIVITY: ActivityItem[] = [
  { type: "Deposit",     amount: "450.00 USDC",   time: "2h ago"  },
  { type: "Yield Claim", amount: "+12.42 USDC",   time: "12h ago" },
  { type: "Withdraw",    amount: "1,200.00 USDC",  time: "1d ago"  },
];

// ─── Security ─────────────────────────────────────────────────────────────────

export const SECURITY_ITEMS: SecurityItem[] = [
  { label: "MPC Health", value: "6 of 9 Nodes Synchronized"    },
  { label: "Key Shards", value: "Encrypted & Geo-distributed"  },
];
