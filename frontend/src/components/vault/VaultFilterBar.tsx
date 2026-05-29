import React from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon } from "../ui";
import type { RiskFilter, AssetFilter, SortOption, ViewMode } from "../../types";

interface VaultFilterBarProps {
  riskFilter:    RiskFilter;
  assetFilter:   AssetFilter;
  sortBy:        SortOption;
  viewMode:      ViewMode;
  onRiskChange:  (v: RiskFilter)  => void;
  onAssetChange: (v: AssetFilter) => void;
  onSortChange:  (v: SortOption)  => void;
  onViewChange:  (v: ViewMode)    => void;
}

const RISK_OPTIONS:  RiskFilter[]  = ["All Levels", "High Risk", "Medium Risk", "Low Risk"];
const ASSET_OPTIONS: AssetFilter[] = ["All Assets", "ETH", "USDC", "WBTC", "DAI"];
const SORT_OPTIONS:  SortOption[]  = ["Highest APY", "Lowest APY", "Highest TVL", "Newest"];

export const VaultFilterBar: React.FC<VaultFilterBarProps> = ({
  riskFilter, assetFilter, sortBy, viewMode,
  onRiskChange, onAssetChange, onSortChange, onViewChange,
}) => (
  <div
    style={{
      display:        "flex",
      flexWrap:       "wrap",
      alignItems:     "center",
      justifyContent: "space-between",
      gap:            16,
      marginBottom:   28,
      padding:        "14px 18px",
      background:     colors.surfaceContainerLow,
      borderRadius:   12,
    }}
  >
    {/* Filters */}
    <div style={{ display: "flex", gap: 12 }}>
      {/* Risk filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: colors.surfaceContainerHigh, padding: "8px 14px", borderRadius: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>Risk:</span>
        <select
          value={riskFilter}
          onChange={(e) => onRiskChange(e.target.value as RiskFilter)}
          style={{ background: "transparent", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", outline: "none", fontFamily: fontFamily.headline, appearance: "none", paddingRight: 4 }}
        >
          {RISK_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <MaterialIcon name="expand_more" size={16} style={{ color: "#64748b" }} />
      </div>

      {/* Asset filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: colors.surfaceContainerHigh, padding: "8px 14px", borderRadius: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>Asset:</span>
        <select
          value={assetFilter}
          onChange={(e) => onAssetChange(e.target.value as AssetFilter)}
          style={{ background: "transparent", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", outline: "none", fontFamily: fontFamily.headline, appearance: "none", paddingRight: 4 }}
        >
          {ASSET_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <MaterialIcon name="expand_more" size={16} style={{ color: "#64748b" }} />
      </div>
    </div>

    {/* View + Sort */}
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      {/* View toggle */}
      <div style={{ display: "flex", background: colors.surfaceContainerLowest, padding: 4, borderRadius: 8 }}>
        {(["Grid", "List"] as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onViewChange(m)}
            style={{
              padding:      "6px 14px",
              fontSize:     11,
              fontWeight:   700,
              background:   viewMode === m ? colors.surfaceContainerHighest : "transparent",
              color:        viewMode === m ? "#fff" : "#64748b",
              border:       "none",
              borderRadius: 6,
              cursor:       "pointer",
              fontFamily:   fontFamily.headline,
              transition:   "all 0.2s",
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>Sort by:</span>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          style={{ background: "transparent", border: "none", color: colors.primary, fontSize: 13, fontWeight: 600, cursor: "pointer", outline: "none", fontFamily: fontFamily.headline, appearance: "none" }}
        >
          {SORT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <MaterialIcon name="arrow_downward" size={14} style={{ color: colors.primary }} />
      </div>
    </div>
  </div>
);
