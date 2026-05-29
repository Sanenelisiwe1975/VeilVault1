import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

// ─── Types (mirror backend) ───────────────────────────────────────────────────

export type RWAType = "invoice" | "carbon_credit" | "commodity" | "remittance" | "trade_finance";

export interface RWAAsset {
  assetId:      string;
  type:         RWAType;
  issuer:       string;
  faceValue:    string;      // USDC stroops as string
  currentValue: string;
  maturityDate: number | null;
  yieldBps:     number;
  currency:     string;
  region:       string;
  isVerified:   boolean;
  dataFeedUri:  string | null;
  metadata:     Record<string, unknown>;
}

export interface RemittanceRoute {
  corridorId:               string;
  sourceCurrency:           string;
  targetCurrency:           string;
  exchangeRate:             number;
  fee:                      number;   // bps
  estimatedSettlementSecs:  number;
  provider:                 string;
  isActive:                 boolean;
}

export interface AllocRec {
  assetId:                  string;
  type:                     RWAType;
  recommendedAllocationBps: number;
  expectedYieldBps:         number;
  riskScore:                number;
  rationale:                string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_ASSETS: RWAAsset[] = [
  { assetId: "sa-gov-inv-001",   type: "invoice",      issuer: "SA National Treasury",       faceValue: "50000000000", currentValue: "49800000000", maturityDate: Date.now()/1000+60*86400,  yieldBps: 850,  currency: "ZAR", region: "Southern Africa",  isVerified: true,  dataFeedUri: null, metadata: { sector: "Government" } },
  { assetId: "ke-sme-inv-023",   type: "invoice",      issuer: "Nairobi SME Finance Ltd",    faceValue: "8000000000",  currentValue: "7950000000",  maturityDate: Date.now()/1000+45*86400,  yieldBps: 1200, currency: "KES", region: "East Africa",      isVerified: true,  dataFeedUri: null, metadata: { sector: "SME" } },
  { assetId: "ng-oil-tf-007",   type: "trade_finance", issuer: "Lagos Trade Bank",            faceValue: "25000000000", currentValue: "24900000000", maturityDate: Date.now()/1000+90*86400,  yieldBps: 950,  currency: "NGN", region: "West Africa",      isVerified: true,  dataFeedUri: null, metadata: { sector: "Oil & Gas" } },
  { assetId: "sa-carbon-vcs-12", type: "carbon_credit", issuer: "Cape Town Carbon Exchange", faceValue: "10000000000", currentValue: "10200000000", maturityDate: null,                       yieldBps: 400,  currency: "ZAR", region: "Southern Africa",  isVerified: true,  dataFeedUri: null, metadata: { tonnes: 5000, standard: "VCS" } },
  { assetId: "gh-cocoa-c-034",   type: "commodity",    issuer: "Accra Commodity Exchange",   faceValue: "15000000000", currentValue: "15600000000", maturityDate: null,                       yieldBps: 650,  currency: "GHS", region: "West Africa",      isVerified: false, dataFeedUri: null, metadata: { commodity: "Cocoa", tonnes: 200 } },
  { assetId: "tz-agri-inv-088",  type: "invoice",      issuer: "Dar es Salaam AgriBank",     faceValue: "5000000000",  currentValue: "4980000000",  maturityDate: Date.now()/1000+30*86400,  yieldBps: 1400, currency: "TZS", region: "East Africa",      isVerified: false, dataFeedUri: null, metadata: { sector: "Agriculture" } },
];

const MOCK_ROUTES: RemittanceRoute[] = [
  { corridorId: "ZAR-USDC", sourceCurrency: "ZAR", targetCurrency: "USDC", exchangeRate: 18.5,  fee: 50,  estimatedSettlementSecs: 30, provider: "Stellar", isActive: true  },
  { corridorId: "NGN-USDC", sourceCurrency: "NGN", targetCurrency: "USDC", exchangeRate: 1550,  fee: 75,  estimatedSettlementSecs: 30, provider: "Stellar", isActive: true  },
  { corridorId: "KES-USDC", sourceCurrency: "KES", targetCurrency: "USDC", exchangeRate: 130,   fee: 50,  estimatedSettlementSecs: 30, provider: "Stellar", isActive: true  },
  { corridorId: "GHS-USDC", sourceCurrency: "GHS", targetCurrency: "USDC", exchangeRate: 12.8,  fee: 60,  estimatedSettlementSecs: 30, provider: "Stellar", isActive: true  },
  { corridorId: "ETB-USDC", sourceCurrency: "ETB", targetCurrency: "USDC", exchangeRate: 56.4,  fee: 80,  estimatedSettlementSecs: 45, provider: "Stellar", isActive: true  },
  { corridorId: "EGP-USDC", sourceCurrency: "EGP", targetCurrency: "USDC", exchangeRate: 30.9,  fee: 55,  estimatedSettlementSecs: 30, provider: "Stellar", isActive: true  },
];

const MOCK_RECS: AllocRec[] = [
  { assetId: "sa-gov-inv-001",  type: "invoice",      recommendedAllocationBps: 800,  expectedYieldBps: 850,  riskScore: 35, rationale: "Low-risk government invoice — strong anchor for the RWA sleeve" },
  { assetId: "ke-sme-inv-023",  type: "invoice",      recommendedAllocationBps: 500,  expectedYieldBps: 1200, riskScore: 52, rationale: "Higher yield from KES SME market — diversifies into East Africa" },
  { assetId: "sa-carbon-vcs-12",type: "carbon_credit",recommendedAllocationBps: 400,  expectedYieldBps: 400,  riskScore: 48, rationale: "ESG quota (10% cap) — adds uncorrelated return from carbon market" },
  { assetId: "ng-oil-tf-007",   type: "trade_finance",recommendedAllocationBps: 300,  expectedYieldBps: 950,  riskScore: 60, rationale: "West African trade finance — diversifies region exposure" },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRWA() {
  const [assets,    setAssets]    = useState<RWAAsset[]>([]);
  const [routes,    setRoutes]    = useState<RemittanceRoute[]>([]);
  const [recs,      setRecs]      = useState<AllocRec[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [usingMock, setUsingMock] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, rRes] = await Promise.all([
        api.get<{ success: boolean; data: RWAAsset[] }>("/rwa/assets"),
        api.get<{ success: boolean; data: RemittanceRoute[] }>("/rwa/routes"),
      ]);
      setAssets(aRes.data.length > 0 ? aRes.data : MOCK_ASSETS);
      setRoutes(rRes.data);
      setUsingMock(aRes.data.length === 0);
    } catch {
      setAssets(MOCK_ASSETS);
      setRoutes(MOCK_ROUTES);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const optimize = useCallback(async () => {
    try {
      const res = await api.post<{ success: boolean; data: AllocRec[] }>("/rwa/optimize", {
        totalAUM: "100000000000",
        maxRWAExposureBps: 3000,
        existingAllocations: {},
      });
      setRecs(res.data);
    } catch {
      setRecs(MOCK_RECS);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Helpers
  const usdc  = (stroops: string) => (Number(stroops) / 1e7).toLocaleString("en-ZA", { maximumFractionDigits: 0 });
  const yield_ = (bps: number)    => (bps / 100).toFixed(2) + "% APY";

  const TYPE_META: Record<RWAType, { icon: string; color: string; label: string }> = {
    invoice:      { icon: "receipt_long",    color: "#60a5fa", label: "Invoice"       },
    carbon_credit:{ icon: "eco",             color: "#22c55e", label: "Carbon Credit" },
    commodity:    { icon: "inventory_2",     color: "#f59e0b", label: "Commodity"     },
    remittance:   { icon: "swap_horiz",      color: "#a78bfa", label: "Remittance"    },
    trade_finance:{ icon: "local_shipping",  color: "#fb923c", label: "Trade Finance" },
  };

  return { assets, routes, recs, loading, usingMock, load, optimize, usdc, yield_, TYPE_META };
}
