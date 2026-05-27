import { Keypair } from '@stellar/stellar-sdk';
import { stellarClient } from '../integrations/stellar/client';
import { VaultContractClient } from '../integrations/stellar/contracts';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import {
  VaultInfo,
  GuardrailsConfig,
  DepositResult,
  WithdrawResult,
  Position,
  OpenPositionParams,
  ClosePositionParams,
  StrategyType,
} from '../types';

const log = createChildLogger('vault-service');

export class VaultService {
  private contractClient: VaultContractClient;
  private adminPublicKey: string;

  constructor(contractId: string) {
    const adminKeypair = Keypair.fromSecret(config.ADMIN_SECRET_KEY);
    this.adminPublicKey = adminKeypair.publicKey();
    this.contractClient = new VaultContractClient(
      stellarClient,
      contractId,
      this.adminPublicKey,
    );
  }

  /** Deploy a new vault (called once during setup). */
  async initializeVault(params: {
    name: string;
    asset: string;
    guardrails: GuardrailsConfig;
  }): Promise<string> {
    log.info({ name: params.name, asset: params.asset }, 'Initializing vault');
    return this.contractClient.initialize({
      admin: this.adminPublicKey,
      name: params.name,
      asset: params.asset,
      guardrails: params.guardrails,
      signerSecretKey: config.ADMIN_SECRET_KEY,
    });
  }

  /** Deposit assets into the vault. Returns shares minted. */
  async deposit(
    fromPublicKey: string,
    amount: bigint,
    signerSecretKey: string,
  ): Promise<DepositResult> {
    log.info({ from: fromPublicKey, amount: amount.toString() }, 'Depositing');
    const result = await this.contractClient.deposit({
      from: fromPublicKey,
      amount,
      signerSecretKey,
    });
    return {
      txHash: result.txHash,
      sharesReceived: result.shares,
      assetsDeposited: amount,
    };
  }

  /** Withdraw assets from the vault by burning shares. */
  async withdraw(
    fromPublicKey: string,
    shares: bigint,
    signerSecretKey: string,
  ): Promise<WithdrawResult> {
    log.info({ from: fromPublicKey, shares: shares.toString() }, 'Withdrawing');
    const result = await this.contractClient.withdraw({
      from: fromPublicKey,
      shares,
      signerSecretKey,
    });
    return {
      txHash: result.txHash,
      assetsReceived: result.assets,
      sharesBurned: shares,
    };
  }

  /** Add an authorized agent. Admin only. */
  async addAgent(agentAddress: string): Promise<string> {
    log.info({ agent: agentAddress }, 'Adding agent');
    return this.contractClient.addAgent({
      agent: agentAddress,
      signerSecretKey: config.ADMIN_SECRET_KEY,
    });
  }

  /** Remove an authorized agent. Admin only. */
  async removeAgent(agentAddress: string): Promise<string> {
    log.warn({ agent: agentAddress }, 'Removing agent');
    return this.contractClient.removeAgent({
      agent: agentAddress,
      signerSecretKey: config.ADMIN_SECRET_KEY,
    });
  }

  /** Open a position. Agent must already be authorized on-chain. */
  async openPosition(params: OpenPositionParams): Promise<{
    txHash: string;
    positionId: bigint;
  }> {
    log.info(
      { agent: params.agent, protocol: params.protocol, amount: params.amount.toString() },
      'Opening position',
    );
    const result = await this.contractClient.openPosition({
      agent: params.agent,
      protocol: params.protocol,
      amount: params.amount,
      expiresAt: params.expiresAt ?? 0,
      strategyType: params.strategyType,
      metadata: params.metadata ?? Buffer.alloc(0),
      signerSecretKey: params.agentSecretKey,
    });
    return { txHash: result.txHash, positionId: result.positionId };
  }

  /** Close a position and return PnL. */
  async closePosition(params: ClosePositionParams): Promise<{
    txHash: string;
    pnl: bigint;
  }> {
    log.info(
      { agent: params.agent, positionId: params.positionId.toString() },
      'Closing position',
    );
    const result = await this.contractClient.closePosition({
      agent: params.agent,
      positionId: params.positionId,
      returnAmount: params.returnAmount,
      signerSecretKey: params.agentSecretKey,
    });
    return { txHash: result.txHash, pnl: result.pnl };
  }

  /** Trigger emergency stop. Admin only. */
  async emergencyStop(): Promise<string> {
    log.error('EMERGENCY STOP triggered');
    return this.contractClient.emergencyStop({
      signerSecretKey: config.ADMIN_SECRET_KEY,
    });
  }

  // ── View helpers ────────────────────────────────────────────────────────────

  async getTotalAssets(): Promise<bigint> {
    return this.contractClient.getTotalAssets();
  }

  async getTotalShares(): Promise<bigint> {
    return this.contractClient.getTotalShares();
  }

  async getUserBalance(address: string): Promise<bigint> {
    return this.contractClient.getBalance(address);
  }

  async isAuthorizedAgent(agent: string): Promise<boolean> {
    return this.contractClient.isAuthorizedAgent(agent);
  }

  /** Share price in asset units (scaled by 1e7). */
  async getSharePrice(): Promise<bigint> {
    const [assets, shares] = await Promise.all([
      this.getTotalAssets(),
      this.getTotalShares(),
    ]);
    if (shares === 0n) return 10_000_000n; // 1.0 initial price
    return (assets * 10_000_000n) / shares;
  }
}

// Singleton — created once VAULT_CONTRACT_ID is set in config.
let _vaultService: VaultService | null = null;

export function getVaultService(): VaultService {
  if (!_vaultService) {
    if (!config.VAULT_CONTRACT_ID) {
      throw new Error('VAULT_CONTRACT_ID not configured');
    }
    _vaultService = new VaultService(config.VAULT_CONTRACT_ID);
  }
  return _vaultService;
}
