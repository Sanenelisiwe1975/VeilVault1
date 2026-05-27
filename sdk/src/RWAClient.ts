import axios, { AxiosInstance } from 'axios';

export enum RWAType {
  Invoice      = 'invoice',
  CarbonCredit = 'carbon_credit',
  Commodity    = 'commodity',
  Remittance   = 'remittance',
  TradeFinance = 'trade_finance',
}

export interface RWAAsset {
  assetId: string;
  type: RWAType;
  issuer: string;
  faceValue: string;    // bigint serialised as string
  currentValue: string;
  maturityDate: number | null;
  yieldBps: number;
  currency: string;
  region: string;
  isVerified: boolean;
  dataFeedUri: string | null;
  metadata: Record<string, unknown>;
}

export interface RemittanceRoute {
  corridorId: string;
  sourceCurrency: string;
  targetCurrency: string;
  exchangeRate: number;
  fee: number;
  estimatedSettlementSecs: number;
  provider: string;
  isActive: boolean;
}

export interface RWAAllocationRecommendation {
  assetId: string;
  type: RWAType;
  recommendedAllocationBps: number;
  expectedYieldBps: number;
  riskScore: number;
  rationale: string;
}

export interface RWAClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export class RWAClient {
  private http: AxiosInstance;

  constructor(cfg: RWAClientConfig) {
    this.http = axios.create({
      baseURL: `${cfg.baseUrl}/api/rwa`,
      timeout: cfg.timeout ?? 30_000,
      headers: { 'x-api-key': cfg.apiKey, 'content-type': 'application/json' },
    });
  }

  async listAssets(type?: RWAType): Promise<RWAAsset[]> {
    const params = type ? { type } : {};
    const { data } = await this.http.get<{ success: true; data: RWAAsset[] }>('/assets', { params });
    return data.data;
  }

  async getAsset(assetId: string): Promise<RWAAsset> {
    const { data } = await this.http.get<{ success: true; data: RWAAsset }>(`/assets/${assetId}`);
    return data.data;
  }

  async registerAsset(asset: Omit<RWAAsset, 'faceValue' | 'currentValue'> & {
    faceValue: bigint;
    currentValue: bigint;
  }): Promise<string> {
    const body = { ...asset, faceValue: asset.faceValue.toString(), currentValue: asset.currentValue.toString() };
    const { data } = await this.http.post<{ success: true; data: { assetId: string } }>('/assets', body);
    return data.data.assetId;
  }

  async listRoutes(sourceCurrency?: string): Promise<RemittanceRoute[]> {
    const params = sourceCurrency ? { sourceCurrency } : {};
    const { data } = await this.http.get<{ success: true; data: RemittanceRoute[] }>('/routes', { params });
    return data.data;
  }

  async getRoute(corridorId: string): Promise<RemittanceRoute> {
    const { data } = await this.http.get<{ success: true; data: RemittanceRoute }>(`/routes/${corridorId}`);
    return data.data;
  }

  async optimizeAllocation(params: {
    totalAUM: bigint;
    maxRWAExposureBps: number;
    existingAllocations?: Record<string, number>;
  }): Promise<RWAAllocationRecommendation[]> {
    const body = {
      totalAUM: params.totalAUM.toString(),
      maxRWAExposureBps: params.maxRWAExposureBps,
      existingAllocations: params.existingAllocations ?? {},
    };
    const { data } = await this.http.post<{ success: true; data: RWAAllocationRecommendation[] }>('/optimize', body);
    return data.data;
  }
}
