/**
 * @veilVault1/sdk
 *
 * TypeScript SDK for VeilVault1 — a private and programmable yield platform
 * for AI agents on Stellar.
 *
 * @example
 * ```typescript
 * import { VaultClient, StrategyClient, AgentHelper, StrategyType } from '@veilVault1/sdk';
 *
 * const config = {
 *   apiUrl: 'https://api.veilVault1.xyz',
 *   apiKey: 'your-api-key',
 *   network: 'testnet' as const,
 * };
 *
 * // Deposit into vault
 * const vault = new VaultClient(config);
 * const result = await vault.deposit(myPublicKey, 100_000_000n, mySecretKey);
 *
 * // Execute a strategy
 * const strategies = new StrategyClient(config);
 * const position = await strategies.execute({
 *   strategyId: 'stellar-usdc-lending',
 *   vaultContractId: VAULT_CONTRACT_ID,
 *   amount: 50_000_000n,
 *   agentAddress: agentPublicKey,
 *   agentSecretKey: agentSecretKey,
 * });
 *
 * // Agent utilities
 * const agent = new AgentHelper(config);
 * const wallet = await agent.createDWallet({ label: 'bot-01', stellarAddress: myPublicKey });
 * ```
 */

export { VaultClient } from './VaultClient';
export { StrategyClient } from './StrategyClient';
export { AgentHelper } from './AgentHelper';
export { StrategyType } from './types';
export type {
  SDKConfig,
  VaultState,
  UserPosition,
  DepositResult,
  WithdrawResult,
  GuardrailsConfig,
  StrategyDefinition,
  StrategyResult,
  CloseResult,
  DWalletInfo,
  X402PaymentRequest,
  X402PaymentProof,
  FHEKeys,
  EncryptedStrategyParams,
} from './types';

/** SDK version */
export const VERSION = '0.1.0';
