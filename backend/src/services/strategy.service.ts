import { Keypair } from '@stellar/stellar-sdk';
import { getVaultService } from './vault.service';
import { vaultFHEService } from './fhe.service';
import { dwalletService } from './dwallet.service';
import { createChildLogger } from '../utils/logger';
import {
  StrategyDefinition,
  StrategyExecutionRequest,
  StrategyExecutionResult,
  StrategyType,
} from '../types';
import { toHex, strToBytes } from '../utils/crypto';

const log = createChildLogger('strategy-service');

// In-memory registry; replace with DB in production
const STRATEGY_REGISTRY = new Map<string, StrategyDefinition>();

export class StrategyService {
  /** Register a yield strategy definition. */
  registerStrategy(strategy: StrategyDefinition): void {
    STRATEGY_REGISTRY.set(strategy.id, strategy);
    log.info({ strategyId: strategy.id, name: strategy.name }, 'Strategy registered');
  }

  getStrategy(id: string): StrategyDefinition | undefined {
    return STRATEGY_REGISTRY.get(id);
  }

  listStrategies(): StrategyDefinition[] {
    return Array.from(STRATEGY_REGISTRY.values());
  }

  /**
   * Execute a strategy:
   *   1. Optionally encrypt params with FHE.
   *   2. Optionally sign with dWallet.
   *   3. Open a position on the vault contract.
   */
  async executeStrategy(request: StrategyExecutionRequest): Promise<StrategyExecutionResult> {
    const strategy = STRATEGY_REGISTRY.get(request.strategyId);
    if (!strategy) {
      throw new Error(`Strategy not found: ${request.strategyId}`);
    }

    if (request.amount < strategy.minAmount) {
      throw new Error(
        `Amount ${request.amount} below minimum ${strategy.minAmount} for strategy ${strategy.id}`,
      );
    }
    if (strategy.maxAmount > 0n && request.amount > strategy.maxAmount) {
      throw new Error(
        `Amount ${request.amount} exceeds maximum ${strategy.maxAmount}`,
      );
    }

    log.info(
      {
        strategyId: request.strategyId,
        amount: request.amount.toString(),
        agent: request.agentAddress,
      },
      'Executing strategy',
    );

    // Prepare metadata (FHE-encrypted params or empty)
    let metadata = Buffer.alloc(0);
    if (request.encryptedParams) {
      metadata = vaultFHEService.parseOnChainMetadata(
        vaultFHEService.parseOnChainMetadata(Buffer.alloc(0)) as unknown as Buffer,
      ) as unknown as Buffer;
      metadata = fheService_encryptedToBuffer(request.encryptedParams);
    }

    // If using dWallet, sign the strategy intent
    if (request.useDWallet && request.dwalletId) {
      const intentMsg = JSON.stringify({
        strategyId: request.strategyId,
        protocol: strategy.protocol,
        amount: request.amount.toString(),
        timestamp: Date.now(),
      });
      const intentHex = toHex(strToBytes(intentMsg));
      const sig = await dwalletService.sign(request.dwalletId, intentHex);
      log.info({ signature: sig.signature.slice(0, 16) + '...' }, 'Strategy signed by dWallet');
    }

    // Open position on-chain
    const vaultService = getVaultService();
    const { txHash, positionId } = await vaultService.openPosition({
      agent: request.agentAddress,
      protocol: strategy.protocol,
      amount: request.amount,
      strategyType: strategy.strategyType,
      metadata,
      agentSecretKey: request.agentSecretKey,
    });

    const estimatedReturn = (request.amount * BigInt(strategy.estimatedApr)) / 10_000n;

    log.info({ positionId: positionId.toString(), txHash }, 'Strategy execution complete');

    return {
      positionId,
      txHash,
      strategyId: request.strategyId,
      amount: request.amount,
      estimatedReturn,
      openedAt: Math.floor(Date.now() / 1000),
    };
  }

  /** Close a strategy position and report return. */
  async closeStrategy(params: {
    vaultContractId: string;
    agentAddress: string;
    agentSecretKey: string;
    positionId: bigint;
    returnAmount: bigint;
  }): Promise<{ txHash: string; pnl: bigint }> {
    log.info(
      { positionId: params.positionId.toString(), returnAmount: params.returnAmount.toString() },
      'Closing strategy',
    );

    const vaultService = getVaultService(params.vaultContractId);
    return vaultService.closePosition({
      agent: params.agentAddress,
      positionId: params.positionId,
      returnAmount: params.returnAmount,
      agentSecretKey: params.agentSecretKey,
    });
  }

  /** Seed default strategies. */
  seedDefaultStrategies(): void {
    this.registerStrategy({
      id: 'stellar-usdc-lending',
      name: 'USDC Stellar Lending',
      protocol: '', // set after deployment
      strategyType: StrategyType.Lending,
      minAmount: 1_000_000n,    // 0.1 USDC (7 decimals)
      maxAmount: 0n,            // unlimited
      estimatedApr: 500,        // 5% APR in bps
      riskLevel: 'low',
      description: 'Lend USDC on the Stellar network for a stable yield',
    });

    this.registerStrategy({
      id: 'stellar-xlm-staking',
      name: 'XLM Staking',
      protocol: '', // set after deployment
      strategyType: StrategyType.Staking,
      minAmount: 10_000_000n,   // 1 XLM
      maxAmount: 0n,
      estimatedApr: 800,        // 8% APR
      riskLevel: 'medium',
      description: 'Stake XLM in a Soroban staking protocol',
    });
  }
}

// Helper to avoid circular import
function fheService_encryptedToBuffer(params: import('../types').EncryptedStrategyParams): Buffer {
  return Buffer.from(
    JSON.stringify({
      ta: params.targetAllocation.ciphertext,
      ms: params.maxSlippage.ciphertext,
      ep: params.entryPriceThreshold.ciphertext,
      kid: params.keyId,
    }),
    'utf-8',
  );
}

// Vault service factory (supports multiple vault contract IDs)
function getVaultServiceForContract(contractId: string) {
  const { VaultService } = require('./vault.service');
  const vs = new VaultService(contractId);
  return vs;
}

export const strategyService = new StrategyService();
strategyService.seedDefaultStrategies();
