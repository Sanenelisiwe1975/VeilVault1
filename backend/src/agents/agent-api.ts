/**
 * Agent Interaction API
 *
 * Provides a machine-friendly interface for autonomous AI agents.
 * Agents can discover capabilities, check vault state, execute strategies,
 * and make x402 payments — all via a simple typed SDK-style interface.
 *
 * This can be used by Zerion-style agents, LLM tool-use, or any system
 * that wants to interact with VeilVault1 programmatically.
 */
import { getVaultService } from '../services/vault.service';
import { x402Service } from '../services/x402.service';
import { strategyService } from '../services/strategy.service';
import { dwalletService } from '../services/dwallet.service';
import { vaultFHEService } from '../services/fhe.service';
import { createChildLogger } from '../utils/logger';
import {
  AgentPermission,
  StrategyExecutionRequest,
  StrategyExecutionResult,
  X402PaymentProof,
} from '../types';

const log = createChildLogger('agent-api');

export interface AgentCapabilities {
  vault: {
    canDeposit: boolean;
    canWithdraw: boolean;
    canOpenPositions: boolean;
    canClosePositions: boolean;
  };
  fhe: {
    enabled: boolean;
  };
  dWallet: {
    enabled: boolean;
  };
  x402: {
    enabled: boolean;
    recipient?: string;
    defaultAsset?: string;
  };
}

export interface AgentVaultState {
  totalAssets: string;
  totalShares: string;
  sharePrice: string;
  userShares?: string;
  userAssetValue?: string;
}

export class AgentAPI {
  private agentAddress: string;
  private agentSecretKey: string;
  private permissions: AgentPermission[];

  constructor(params: {
    agentAddress: string;
    agentSecretKey: string;
    permissions?: AgentPermission[];
  }) {
    this.agentAddress = params.agentAddress;
    this.agentSecretKey = params.agentSecretKey;
    this.permissions = params.permissions ?? Object.values(AgentPermission);
  }

  /** Describe what this agent can do. */
  async getCapabilities(): Promise<AgentCapabilities> {
    const vault = getVaultService();
    const isAuthorized = await vault.isAuthorizedAgent(this.agentAddress);

    return {
      vault: {
        canDeposit: this.hasPermission(AgentPermission.READ_VAULT),
        canWithdraw: this.hasPermission(AgentPermission.READ_VAULT),
        canOpenPositions: isAuthorized && this.hasPermission(AgentPermission.OPEN_POSITION),
        canClosePositions: isAuthorized && this.hasPermission(AgentPermission.CLOSE_POSITION),
      },
      fhe: { enabled: true },
      dWallet: { enabled: true },
      x402: {
        enabled: true,
        defaultAsset: 'USDC',
      },
    };
  }

  /** Get current vault state from the agent's perspective. */
  async getVaultState(): Promise<AgentVaultState> {
    const vault = getVaultService();
    const [totalAssets, totalShares, sharePrice, userShares] = await Promise.all([
      vault.getTotalAssets(),
      vault.getTotalShares(),
      vault.getSharePrice(),
      vault.getUserBalance(this.agentAddress),
    ]);

    const userAssetValue = totalShares > 0n
      ? (userShares * totalAssets) / totalShares
      : 0n;

    return {
      totalAssets: totalAssets.toString(),
      totalShares: totalShares.toString(),
      sharePrice: sharePrice.toString(),
      userShares: userShares.toString(),
      userAssetValue: userAssetValue.toString(),
    };
  }

  /** List strategies the agent can execute. */
  listStrategies() {
    return strategyService.listStrategies();
  }

  /** Execute a strategy (agent must be authorized on-chain). */
  async executeStrategy(params: {
    strategyId: string;
    vaultContractId: string;
    amount: bigint;
    encryptParams?: boolean;
    strategyParams?: {
      targetAllocation: number;
      maxSlippage: number;
      entryPriceThreshold: bigint;
      keyId: string;
    };
    useDWallet?: boolean;
    dwalletId?: string;
  }): Promise<StrategyExecutionResult> {
    if (!this.hasPermission(AgentPermission.OPEN_POSITION)) {
      throw new Error('Agent lacks OPEN_POSITION permission');
    }

    let encryptedParams: import('../types').EncryptedStrategyParams | undefined;
    if (params.encryptParams && params.strategyParams) {
      const result = await vaultFHEService.encryptStrategy(params.strategyParams);
      encryptedParams = result.encrypted;
    }

    return strategyService.executeStrategy({
      strategyId: params.strategyId,
      vaultContractId: params.vaultContractId,
      amount: params.amount,
      agentAddress: this.agentAddress,
      agentSecretKey: this.agentSecretKey,
      encryptedParams,
      useDWallet: params.useDWallet,
      dwalletId: params.dwalletId,
    });
  }

  /** Close a position this agent opened. */
  async closePosition(params: {
    vaultContractId: string;
    positionId: bigint;
    returnAmount: bigint;
  }): Promise<{ txHash: string; pnl: bigint }> {
    if (!this.hasPermission(AgentPermission.CLOSE_POSITION)) {
      throw new Error('Agent lacks CLOSE_POSITION permission');
    }
    return strategyService.closeStrategy({
      ...params,
      agentAddress: this.agentAddress,
      agentSecretKey: this.agentSecretKey,
    });
  }

  /** Verify a Stellar payment and prepare access proof. */
  async verifyPayment(params: {
    txHash: string;
    expectedTo: string;
    expectedAmount: bigint;
    expectedAsset: string;
    expectedMemo: string;
  }): Promise<X402PaymentProof> {
    if (!this.hasPermission(AgentPermission.MAKE_PAYMENT)) {
      throw new Error('Agent lacks MAKE_PAYMENT permission');
    }
    return x402Service.processPaymentProof(params);
  }

  /** Sign a message with this agent's dWallet. */
  async signWithDWallet(dwalletId: string, message: string): Promise<string> {
    const result = await dwalletService.sign(dwalletId, message);
    return result.signature;
  }

  /** Generate FHE keys for encrypted strategy execution. */
  async generateFHEKeys(): Promise<{ keyId: string; publicKey: string }> {
    return vaultFHEService.generateKeys();
  }

  private hasPermission(permission: AgentPermission): boolean {
    return this.permissions.includes(permission);
  }
}
