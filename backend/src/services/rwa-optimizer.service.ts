import { StellarClient } from '../integrations/stellar/client';
import { config } from '../config';
import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

export enum RWAType {
  Invoice = 'invoice',
  CarbonCredit = 'carbon_credit',
  Commodity = 'commodity',
  Remittance = 'remittance',
  TradeFinance = 'trade_finance',
}

export interface RWAAsset {
  assetId: string;
  type: RWAType;
  issuer: string;
  faceValue: bigint;       // in USDC stroops
  currentValue: bigint;
  maturityDate: number | null;
  yieldBps: number;
  currency: string;        // originating currency (ZAR, NGN, KES, etc.)
  region: string;          // geographic region
  isVerified: boolean;
  dataFeedUri: string | null;
  metadata: Record<string, unknown>;
}

export interface RemittanceRoute {
  corridorId: string;
  sourceCurrency: string;
  targetCurrency: string;
  exchangeRate: number;   // source per USDC
  fee: number;            // bps
  estimatedSettlementSecs: number;
  provider: string;
  isActive: boolean;
}

export interface RWAAllocationRecommendation {
  assetId: string;
  type: RWAType;
  recommendedAllocationBps: number;  // % of vault in bps
  expectedYieldBps: number;
  riskScore: number;                 // 0–100
  rationale: string;
}

export class RWAOptimizerService {
  private stellar: StellarClient;
  // Registered RWA assets (production: fetch from oracle or IPFS)
  private assets = new Map<string, RWAAsset>();
  private routes = new Map<string, RemittanceRoute>();

  constructor(stellar: StellarClient) {
    this.stellar = stellar;
    this.seedAfricanRoutes();
  }

  registerAsset(asset: RWAAsset): void {
    this.assets.set(asset.assetId, asset);
    logger.info('Registered RWA asset', { assetId: asset.assetId, type: asset.type });
  }

  getAsset(assetId: string): RWAAsset | null {
    return this.assets.get(assetId) ?? null;
  }

  listAssets(type?: RWAType): RWAAsset[] {
    const all = Array.from(this.assets.values());
    if (type) return all.filter(a => a.type === type);
    return all;
  }

  getRemittanceRoute(corridorId: string): RemittanceRoute | null {
    return this.routes.get(corridorId) ?? null;
  }

  listRemittanceRoutes(sourceCurrency?: string): RemittanceRoute[] {
    const all = Array.from(this.routes.values()).filter(r => r.isActive);
    if (sourceCurrency) return all.filter(r => r.sourceCurrency === sourceCurrency);
    return all;
  }

  /**
   * Portfolio optimisation for RWA allocation.
   *
   * Rules:
   * - Max 15% in any single invoice/trade-finance asset (illiquid)
   * - Carbon credits capped at 10% (ESG quota)
   * - Remittance corridors preferred for Africa (lower fees)
   * - Sort by risk-adjusted yield (yield/risk)
   */
  optimizeAllocation(
    totalAUM: bigint,
    maxRWAExposureBps: number,
    existingAllocations: Map<string, number>  // assetId → current bps
  ): RWAAllocationRecommendation[] {
    const recommendations: RWAAllocationRecommendation[] = [];
    const remainingBps = maxRWAExposureBps - this.sumAllocations(existingAllocations);
    if (remainingBps <= 0) return [];

    // Score each asset
    const scored = Array.from(this.assets.values())
      .filter(a => a.isVerified)
      .map(a => ({
        asset: a,
        riskAdjYield: a.yieldBps / Math.max(this.estimateRisk(a), 1),
      }))
      .sort((a, b) => b.riskAdjYield - a.riskAdjYield);

    let allocated = 0;
    for (const { asset } of scored) {
      if (allocated >= remainingBps) break;

      const existing = existingAllocations.get(asset.assetId) ?? 0;
      const cap = this.assetCap(asset.type);
      const available = Math.max(0, cap - existing);
      const rec = Math.min(available, remainingBps - allocated);
      if (rec <= 0) continue;

      recommendations.push({
        assetId: asset.assetId,
        type: asset.type,
        recommendedAllocationBps: rec,
        expectedYieldBps: asset.yieldBps,
        riskScore: this.estimateRisk(asset),
        rationale: this.buildRationale(asset, rec),
      });
      allocated += rec;
    }

    return recommendations;
  }

  private assetCap(type: RWAType): number {
    switch (type) {
      case RWAType.Invoice:
      case RWAType.TradeFinance: return 1500;  // 15%
      case RWAType.CarbonCredit: return 1000;  // 10%
      case RWAType.Remittance:   return 2000;  // 20%
      case RWAType.Commodity:    return 1200;  // 12%
      default:                   return 1000;
    }
  }

  private estimateRisk(asset: RWAAsset): number {
    let score = 30;
    if (!asset.isVerified) score += 40;
    if (asset.type === RWAType.Invoice) score += 15;
    if (asset.type === RWAType.CarbonCredit) score += 20;
    if (asset.maturityDate && asset.maturityDate - Date.now() / 1000 < 30 * 86400) score += 10;
    return Math.min(score, 100);
  }

  private buildRationale(asset: RWAAsset, allocationBps: number): string {
    return (
      `${asset.type} asset in ${asset.region} — ` +
      `yield ${asset.yieldBps}bps, ${(allocationBps / 100).toFixed(1)}% allocation ` +
      `(verified: ${asset.isVerified})`
    );
  }

  private sumAllocations(m: Map<string, number>): number {
    return Array.from(m.values()).reduce((a, b) => a + b, 0);
  }

  /** Seed common African remittance corridors */
  private seedAfricanRoutes(): void {
    const corridors: RemittanceRoute[] = [
      {
        corridorId: 'ZAR-USDC',
        sourceCurrency: 'ZAR',
        targetCurrency: 'USDC',
        exchangeRate: 18.5,
        fee: 50,  // 0.5%
        estimatedSettlementSecs: 30,
        provider: 'Stellar',
        isActive: true,
      },
      {
        corridorId: 'NGN-USDC',
        sourceCurrency: 'NGN',
        targetCurrency: 'USDC',
        exchangeRate: 1550,
        fee: 75,
        estimatedSettlementSecs: 30,
        provider: 'Stellar',
        isActive: true,
      },
      {
        corridorId: 'KES-USDC',
        sourceCurrency: 'KES',
        targetCurrency: 'USDC',
        exchangeRate: 130,
        fee: 50,
        estimatedSettlementSecs: 30,
        provider: 'Stellar',
        isActive: true,
      },
      {
        corridorId: 'GHS-USDC',
        sourceCurrency: 'GHS',
        targetCurrency: 'USDC',
        exchangeRate: 12.8,
        fee: 60,
        estimatedSettlementSecs: 30,
        provider: 'Stellar',
        isActive: true,
      },
    ];
    for (const r of corridors) this.routes.set(r.corridorId, r);
  }
}

let instance: RWAOptimizerService | null = null;
export function getRWAOptimizerService(stellar: StellarClient): RWAOptimizerService {
  if (!instance) instance = new RWAOptimizerService(stellar);
  return instance;
}
