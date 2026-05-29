import React, { useState } from "react";
import { colors, fontFamily } from "../../constants/theme";
import type { TimeRange } from "../../types";

const TIME_RANGES: TimeRange[] = ["1W", "1M", "1Y"];

// SVG path data keyed by time range
const CHART_PATHS: Record<TimeRange, { line: string; area: string }> = {
  "1W": {
    line: "M 0 75 L 60 68 L 120 72 L 180 50 L 240 58 L 300 38 L 360 42",
    area: "M 0 75 L 60 68 L 120 72 L 180 50 L 240 58 L 300 38 L 360 42 L 360 100 L 0 100 Z",
  },
  "1M": {
    line: "M 0 80 L 60 65 L 120 70 L 180 35 L 240 50 L 300 20 L 360 30",
    area: "M 0 80 L 60 65 L 120 70 L 180 35 L 240 50 L 300 20 L 360 30 L 360 100 L 0 100 Z",
  },
  "1Y": {
    line: "M 0 90 L 60 80 L 120 75 L 180 55 L 240 40 L 300 25 L 360 15",
    area: "M 0 90 L 60 80 L 120 75 L 180 55 L 240 40 L 300 25 L 360 15 L 360 100 L 0 100 Z",
  },
};

export const YieldChart: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>("1M");
  const { line, area } = CHART_PATHS[timeRange];

  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontFamily: fontFamily.headline, fontWeight: 700, fontSize: 16, color: "#fff" }}>
          Yield Performance
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {TIME_RANGES.map((t) => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              style={{
                padding:      "4px 10px",
                fontSize:     11,
                fontWeight:   700,
                background:   timeRange === t ? colors.surfaceContainerHighest : "transparent",
                color:        timeRange === t ? "#fff" : "#64748b",
                border:       "none",
                borderRadius: 4,
                cursor:       "pointer",
                fontFamily:   fontFamily.headline,
                transition:   "all 0.2s",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <svg width="100%" height="120" viewBox="0 0 360 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="yieldLineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={colors.primary}          stopOpacity="0.6" />
            <stop offset="100%" stopColor={colors.primaryContainer} stopOpacity="1"   />
          </linearGradient>
          <linearGradient id="yieldAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={colors.primary} stopOpacity="0.15" />
            <stop offset="100%" stopColor={colors.primary} stopOpacity="0"    />
          </linearGradient>
        </defs>

        <path d={area} fill="url(#yieldAreaGrad)" />
        <path
          d={line}
          fill="none"
          stroke="url(#yieldLineGrad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Peak label */}
        <rect x="248" y="6" width="84" height="20" rx="4" fill={`${colors.surfaceContainerHighest}cc`} />
        <text x="290" y="20" fill={colors.onSurfaceVariant} fontSize="9" textAnchor="middle" fontFamily="Inter, sans-serif">
          Peak APY: 18.4%
        </text>
      </svg>
    </div>
  );
};
