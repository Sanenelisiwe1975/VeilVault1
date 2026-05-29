import React, { useState } from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon } from "../ui";

type ChartTab = "APY Performance" | "TVL Growth";

const CHART_TABS: ChartTab[] = ["APY Performance", "TVL Growth"];

const CHART_DATES = ["JAN 01", "FEB 15", "MAR 30", "MAY 15", "JUN 30", "AUG 15"];

// Separate path data per tab so the chart feels dynamic
const PATHS: Record<ChartTab, { line: string; area: string }> = {
  "APY Performance": {
    line: "M 30 140 C 80 130 130 100 180 60 C 230 20 280 30 330 50 C 380 65 420 80 460 70",
    area: "M 30 140 C 80 130 130 100 180 60 C 230 20 280 30 330 50 C 380 65 420 80 460 70 L 460 160 L 30 160 Z",
  },
  "TVL Growth": {
    line: "M 30 155 C 80 150 130 140 180 120 C 230 100 280 80 330 55 C 380 35 420 30 460 28",
    area: "M 30 155 C 80 150 130 140 180 120 C 230 100 280 80 330 55 C 380 35 420 30 460 28 L 460 160 L 30 160 Z",
  },
};

export const VaultAPYChart: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ChartTab>("APY Performance");
  const { line, area } = PATHS[activeTab];

  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 20, marginBottom: 20 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {CHART_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                padding:      "7px 14px",
                fontSize:     12,
                fontWeight:   700,
                background:   activeTab === t
                  ? `linear-gradient(135deg, ${colors.primary}40, ${colors.primaryContainer}40)`
                  : "transparent",
                color:        activeTab === t ? colors.primary : "#64748b",
                border:       activeTab === t ? `1px solid ${colors.primary}30` : "1px solid transparent",
                borderRadius: 8,
                cursor:       "pointer",
                fontFamily:   fontFamily.headline,
                transition:   "all 0.2s",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <MaterialIcon name="calendar_today" size={18} style={{ color: "#475569", cursor: "pointer" }} />
          <MaterialIcon name="download"       size={18} style={{ color: "#475569", cursor: "pointer" }} />
        </div>
      </div>

      {/* SVG chart */}
      <svg width="100%" height="180" viewBox="0 30 490 160" preserveAspectRatio="none">
        <defs>
          <linearGradient id="detailLineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={colors.primary}          stopOpacity="0.8" />
            <stop offset="100%" stopColor={colors.tertiary}         stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="detailAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={colors.primary} stopOpacity="0.12" />
            <stop offset="100%" stopColor={colors.primary} stopOpacity="0"    />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#detailAreaGrad)" />
        <path d={line} fill="none" stroke="url(#detailLineGrad)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      {/* Date labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        {CHART_DATES.map((d) => (
          <span key={d} style={{ fontSize: 9, color: "#475569", fontFamily: fontFamily.body }}>{d}</span>
        ))}
      </div>
    </div>
  );
};
