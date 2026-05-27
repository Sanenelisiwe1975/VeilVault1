import axios, { AxiosInstance } from 'axios';

export enum StrategyCategory {
  Lending = 0,
  LiquidityProvision = 1,
  Staking = 2,
  Arbitrage = 3,
  RWA = 4,
  Remittance = 5,
}

export interface StrategyListing {
  strategyId: string;
  author: string;
  name: string;
  description: string;
  executionFee: string;
  feeAsset: string;
  isAudited: boolean;
  auditReportHash: string | null;
  category: StrategyCategory;
  minAgentLevel: number;
  totalExecutions: string;
  successfulExecutions: string;
  totalFeesCollected: string;
  isActive: boolean;
  createdAt: number;
}

export interface MarketplaceClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export class MarketplaceClient {
  private http: AxiosInstance;

  constructor(cfg: MarketplaceClientConfig) {
    this.http = axios.create({
      baseURL: `${cfg.baseUrl}/api/marketplace`,
      timeout: cfg.timeout ?? 30_000,
      headers: { 'x-api-key': cfg.apiKey, 'content-type': 'application/json' },
    });
  }

  async getListing(strategyId: string): Promise<StrategyListing> {
    const { data } = await this.http.get<StrategyListing>(`/${strategyId}`);
    return data;
  }

  async publish(params: {
    author: string;
    name: string;
    description: string;
    executionFee: string;
    feeAsset: string;
    category: StrategyCategory;
    minAgentLevel: number;
    authorSecret: string;
  }): Promise<string> {
    const { data } = await this.http.post<{ strategyId: string }>('/publish', params);
    return data.strategyId;
  }

  async execute(params: {
    strategyId: string;
    executor: string;
    vaultAddress: string;
    amount: string;
    executionParams: string;  // hex bytes
    executorSecret: string;
  }): Promise<void> {
    await this.http.post('/execute', params);
  }

  async audit(params: {
    strategyId: string;
    auditReportHash: string;
    auditorSecret: string;
  }): Promise<void> {
    await this.http.post('/audit', params);
  }

  async deactivate(params: { strategyId: string; callerSecret: string }): Promise<void> {
    await this.http.post('/deactivate', params);
  }

  async recordReturn(params: {
    strategyId: string;
    returnBps: number;
    callerSecret: string;
  }): Promise<void> {
    await this.http.post('/record-return', params);
  }
}
