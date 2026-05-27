import axios, { AxiosInstance } from 'axios';
import {
  SDKConfig,
  StrategyDefinition,
  StrategyResult,
  CloseResult,
  FHEKeys,
  EncryptedStrategyParams,
} from './types';

export class StrategyClient {
  private http: AxiosInstance;

  constructor(private readonly config: SDKConfig) {
    this.http = axios.create({
      baseURL: `${config.apiUrl}/api/strategies`,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60_000, // Strategy execution can take longer
    });
  }

  /** List all registered yield strategies. */
  async listStrategies(): Promise<StrategyDefinition[]> {
    const res = await this.http.get<{ success: boolean; data: StrategyDefinition[] }>('/');
    return res.data.data.map(s => ({
      ...s,
      minAmount: BigInt(s.minAmount),
      maxAmount: BigInt(s.maxAmount),
    }));
  }

  /** Get a specific strategy by ID. */
  async getStrategy(id: string): Promise<StrategyDefinition> {
    const res = await this.http.get<{ success: boolean; data: StrategyDefinition }>(`/${id}`);
    const s = res.data.data;
    return { ...s, minAmount: BigInt(s.minAmount), maxAmount: BigInt(s.maxAmount) };
  }

  /**
   * Execute a yield strategy.
   *
   * @param strategyId - ID of the strategy to execute
   * @param vaultContractId - Soroban contract ID of the target vault
   * @param amount - Amount to deploy in asset base units
   * @param agentAddress - Agent's Stellar public key
   * @param agentSecretKey - Agent's Stellar secret key for signing
   * @param options - Optional FHE encryption and dWallet settings
   */
  async execute(params: {
    strategyId: string;
    vaultContractId: string;
    amount: bigint;
    agentAddress: string;
    agentSecretKey: string;
    options?: {
      encryptParams?: boolean;
      strategyParams?: {
        targetAllocation: number;
        maxSlippage: number;
        entryPriceThreshold: bigint;
        keyId: string;
      };
      useDWallet?: boolean;
      dwalletId?: string;
    };
  }): Promise<StrategyResult> {
    const body: Record<string, unknown> = {
      strategyId: params.strategyId,
      vaultContractId: params.vaultContractId,
      amount: params.amount.toString(),
      agentAddress: params.agentAddress,
      agentSecretKey: params.agentSecretKey,
    };

    if (params.options?.encryptParams) {
      body.encryptParams = true;
      if (params.options.strategyParams) {
        body.strategyParams = {
          ...params.options.strategyParams,
          entryPriceThreshold: params.options.strategyParams.entryPriceThreshold.toString(),
        };
      }
    }

    if (params.options?.useDWallet) {
      body.useDWallet = true;
      body.dwalletId = params.options.dwalletId;
    }

    const res = await this.http.post<{ success: boolean; data: Record<string, string> }>(
      '/execute',
      body,
    );

    const d = res.data.data;
    return {
      positionId: BigInt(d.positionId),
      txHash: d.txHash,
      strategyId: d.strategyId,
      amount: BigInt(d.amount),
      estimatedReturn: BigInt(d.estimatedReturn),
      openedAt: Number(d.openedAt),
    };
  }

  /**
   * Close an open position and report the actual return amount.
   */
  async closePosition(params: {
    vaultContractId: string;
    agentAddress: string;
    agentSecretKey: string;
    positionId: bigint;
    returnAmount: bigint;
  }): Promise<CloseResult> {
    const res = await this.http.post<{ success: boolean; data: { txHash: string; pnl: string } }>(
      '/close',
      {
        vaultContractId: params.vaultContractId,
        agentAddress: params.agentAddress,
        agentSecretKey: params.agentSecretKey,
        positionId: params.positionId.toString(),
        returnAmount: params.returnAmount.toString(),
      },
    );
    return {
      txHash: res.data.data.txHash,
      pnl: BigInt(res.data.data.pnl),
    };
  }

  /** Generate FHE key pair for encrypted strategy execution. */
  async generateFHEKeys(): Promise<FHEKeys> {
    const res = await this.http.post<{ success: boolean; data: FHEKeys }>('/fhe/keys');
    return res.data.data;
  }
}
