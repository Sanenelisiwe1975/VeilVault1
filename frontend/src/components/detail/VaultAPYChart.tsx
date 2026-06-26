import React, { useEffect, useState } from "react";
import { colors, fontFamily } from "../../constants/theme";
import { MaterialIcon } from "../ui";
import { useWalletSession } from "../../context/WalletSession";
import { api } from "../../lib/api";

type ChartTab = "APY Performance" | "TVL Growth";

const CHART_TABS: ChartTab[] = ["APY Performance", "TVL Growth"];

interface HistoryPoint {
  timestamp:   number;
  date:        string;
  totalAssets: string;
  sharePrice:  string;
  yieldEarned: string;
}

interface HistoryResponse {
  success: boolean;
  data: { series: HistoryPoint[]; days: number; address: string | null };
}

const X_START = 30;
const X_END   = 460;
const Y_TOP   = 20;
const Y_BOTTOM = 160;

function buildPaths(values: number[]): { line: string; area: string } {
  if (values.length === 0) {
    return { line: "", area: "" };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = values.length === 1 ? X_START : X_START + (i / (values.length - 1)) * (X_END - X_START);
    const y = Y_BOTTOM - ((v - min) / range) * (Y_BOTTOM - Y_TOP);
    return [x, y];
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L ${X_END} ${Y_BOTTOM} L ${X_START} ${Y_BOTTOM} Z`;
  return { line, area };
}

function pickLabels(series: HistoryPoint[], count = 6): string[] {
  if (series.length === 0) return [];
  const step = Math.max(1, Math.floor(series.length / count));
  const labels: string[] = [];
  for (let i = 0; i < series.length; i += step) {
    labels.push(series[i].date.slice(5)); // MM-DD
  }
  return labels.slice(0, count);
}

export const VaultAPYChart: React.FC = () => {
  const { address } = useWalletSession();
  const [activeTab, setActiveTab] = useState<ChartTab>("APY Performance");
  const [series, setSeries] = useState<HistoryPoint[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<HistoryResponse>(`/vault/history?days=90${address ? `&address=${address}` : ""}`)
      .then(res => { if (!cancelled) setSeries(res.data.series); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [address]);

  const values = series
    ? series.map(p => Number(activeTab === "APY Performance" ? p.sharePrice : p.totalAssets) / 1e7)
    : [];
  const { line, area } = buildPaths(values);
  const labels = series ? pickLabels(series) : [];

  return (
    <div style={{ background: colors.surfaceContainerLow, borderRadius: 16, padding: 20, marginBottom: 20 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {CHART_TABS.map((t) => (
            <button
              key={t}
              type="button"
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
          <MaterialIcon name="calendar_today" size={18} style={{ color: "#475569" }} />
          <MaterialIcon name="download"       size={18} style={{ color: "#475569" }} />
        </div>
      </div>

      {/* SVG chart */}
      {!series && !error && (
        <p style={{ textAlign: "center", color: "#64748b", fontSize: 12, padding: "60px 0" }}>Loading chart…</p>
      )}
      {error && (
        <p style={{ textAlign: "center", color: "#64748b", fontSize: 12, padding: "60px 0" }}>Couldn't load chart data.</p>
      )}
      {series && !error && (
        <>
          <svg width="100%" height="180" viewBox="0 0 490 180" preserveAspectRatio="none">
            <defs>
              <linearGradient id="detailLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor={colors.primary}  stopOpacity="0.8" />
                <stop offset="100%" stopColor={colors.tertiary} stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="detailAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={colors.primary} stopOpacity="0.12" />
                <stop offset="100%" stopColor={colors.primary} stopOpacity="0"    />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#detailAreaGrad)" />
            <path d={line} fill="none" stroke="url(#detailLineGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          {/* Date labels */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            {labels.map((d, i) => (
              <span key={`${d}-${i}`} style={{ fontSize: 9, color: "#475569", fontFamily: fontFamily.body }}>{d}</span>
            ))}
          </div>

          <p style={{ fontSize: 10, color: "#334155", textAlign: "center", marginTop: 10 }}>
            {series[series.length - 1]?.timestamp && series.length > 1
              ? "Live on-chain value, with recent history estimated until enough real data has accumulated"
              : "Live on-chain value"}
          </p>
        </>
      )}
    </div>
  );
};
