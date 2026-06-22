import { StellarClient } from '../integrations/stellar/client';
import { config } from '../config';
import { Address, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

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
  executionFee: bigint;
  feeAsset: string;
  isAudited: boolean;
  auditReportHash: string | null;
  category: StrategyCategory;
  minAgentLevel: number;
  totalExecutions: bigint;
  successfulExecutions: bigint;
  totalFeesCollected: bigint;
  isActive: boolean;
  createdAt: number;
}

export interface ExecuteStrategyParams {
  strategyId: string;
  executor: string;
  vaultAddress: string;
  amount: bigint;
  executionParams: Buffer;
  executorSecret: string;
}

export class StrategyMarketplaceService {
  private contractId: string;
  private stellar: StellarClient;

  constructor(stellar: StellarClient) {
    this.stellar = stellar;
    if (!config.STRATEGY_MARKETPLACE_CONTRACT_ID) throw new Error('STRATEGY_MARKETPLACE_CONTRACT_ID not set');
    this.contractId = config.STRATEGY_MARKETPLACE_CONTRACT_ID;
  }

  async publishStrategy(params: {
    author: string;
    name: string;
    description: string;
    executionFee: bigint;
    feeAsset: string;
    category: StrategyCategory;
    minAgentLevel: number;
    authorSecret: string;
  }): Promise<string> {
    logger.info('Publishing strategy', { name: params.name, author: params.author });

    const { result } = await this.stellar.invokeContract(
      this.contractId,
      'publish_strategy',
      [
        new Address(params.author).toScVal(),
        nativeToScVal(params.name, { type: 'string' }),
        nativeToScVal(params.description, { type: 'string' }),
        nativeToScVal(params.executionFee, { type: 'i128' }),
        new Address(params.feeAsset).toScVal(),
        nativeToScVal(params.category, { type: 'u32' }),
        nativeToScVal(params.minAgentLevel, { type: 'u32' }),
      ],
      params.authorSecret
    );

    if (!result) throw new Error('No return value from publish_strategy call');
    const strategyId = scValToNative(result) as Uint8Array;
    return Buffer.from(strategyId).toString('hex');
  }

  async executeStrategy(params: ExecuteStrategyParams): Promise<void> {
    logger.info('Executing strategy', {
      strategyId: params.strategyId,
      executor: params.executor,
      amount: params.amount.toString(),
    });

    const strategyIdBytes = Buffer.from(params.strategyId, 'hex');

    await this.stellar.invokeContract(
      this.contractId,
      'execute_strategy',
      [
        nativeToScVal(strategyIdBytes, { type: 'bytes' }),
        new Address(params.executor).toScVal(),
        new Address(params.vaultAddress).toScVal(),
        nativeToScVal(params.amount, { type: 'i128' }),
        nativeToScVal(params.executionParams, { type: 'bytes' }),
      ],
      params.executorSecret
    );
  }

  async getListing(strategyId: string): Promise<StrategyListing | null> {
    try {
      const strategyIdBytes = Buffer.from(strategyId, 'hex');
      const result = await this.stellar.callView(
        this.contractId,
        'get_listing',
        [nativeToScVal(strategyIdBytes, { type: 'bytes' })]
      );
      if (!result) return null;
      return this.parseListing(scValToNative(result) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  async deactivateStrategy(params: {
    strategyId: string;
    callerSecret: string;
  }): Promise<void> {
    const strategyIdBytes = Buffer.from(params.strategyId, 'hex');
    await this.stellar.invokeContract(
      this.contractId,
      'deactivate_strategy',
      [nativeToScVal(strategyIdBytes, { type: 'bytes' })],
      params.callerSecret
    );
  }

  async auditStrategy(params: {
    strategyId: string;
    auditReportHash: string;
    auditorSecret: string;
  }): Promise<void> {
    const strategyIdBytes = Buffer.from(params.strategyId, 'hex');
    const hashBytes = Buffer.from(params.auditReportHash, 'hex');
    await this.stellar.invokeContract(
      this.contractId,
      'audit_strategy',
      [
        nativeToScVal(strategyIdBytes, { type: 'bytes' }),
        nativeToScVal(hashBytes, { type: 'bytes' }),
      ],
      params.auditorSecret
    );
  }

  async recordReturn(params: {
    strategyId: string;
    returnBps: number;
    callerSecret: string;
  }): Promise<void> {
    const strategyIdBytes = Buffer.from(params.strategyId, 'hex');
    await this.stellar.invokeContract(
      this.contractId,
      'record_return',
      [
        nativeToScVal(strategyIdBytes, { type: 'bytes' }),
        nativeToScVal(params.returnBps, { type: 'i64' }),
      ],
      params.callerSecret
    );
  }

  private parseListing(raw: Record<string, unknown>): StrategyListing {
    return {
      strategyId: Buffer.from(raw.strategy_id as Uint8Array).toString('hex'),
      author: raw.author as string,
      name: raw.name as string,
      description: raw.description as string,
      executionFee: BigInt(raw.execution_fee as string),
      feeAsset: raw.fee_asset as string,
      isAudited: raw.is_audited as boolean,
      auditReportHash: raw.audit_report_hash
        ? Buffer.from(raw.audit_report_hash as Uint8Array).toString('hex')
        : null,
      category: Number(raw.category) as StrategyCategory,
      minAgentLevel: Number(raw.min_agent_level),
      totalExecutions: BigInt(raw.total_executions as string),
      successfulExecutions: BigInt(raw.successful_executions as string),
      totalFeesCollected: BigInt(raw.total_fees_collected as string),
      isActive: raw.is_active as boolean,
      createdAt: Number(raw.created_at),
    };
  }
}

let instance: StrategyMarketplaceService | null = null;
export function getStrategyMarketplaceService(stellar: StellarClient): StrategyMarketplaceService {
  if (!instance) instance = new StrategyMarketplaceService(stellar);
  return instance;
}
