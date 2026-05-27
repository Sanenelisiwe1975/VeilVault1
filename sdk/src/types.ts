export interface SDKConfig {
  /** VeilVault1 backend API URL */
  apiUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Stellar network */
  network?: 'testnet' | 'mainnet';
}

export interface VaultState {
  totalAssets: bigint;
  totalShares: bigint;
  sharePrice: bigint;
}

export interface UserPosition {
  shares: bigint;
  assetValue: bigint;
  sharePrice: bigint;
}

export interface DepositResult {
  txHash: string;
  sharesReceived: bigint;
  assetsDeposited: bigint;
}

export interface WithdrawResult {
  txHash: string;
  assetsReceived: bigint;
  sharesBurned: bigint;
}

export interface GuardrailsConfig {
  maxDrawdownBps: number;
  dailySpendingCap: bigint;
  timeLockSeconds: number;
  whitelistedProtocols: string[];
  maxPositionSizeBps: number;
  maxLeverageBps: number;
  emergencyStop: boolean;
}

export enum StrategyType {
  Lending            = 0,
  LiquidityProvision = 1,
  Staking            = 2,
  Arbitrage          = 3,
  Other              = 4,
}

export interface StrategyDefinition {
  id: string;
  name: string;
  protocol: string;
  strategyType: StrategyType;
  minAmount: bigint;
  maxAmount: bigint;
  estimatedApr: number;
  riskLevel: 'low' | 'medium' | 'high';
  description: string;
}

export interface StrategyResult {
  positionId: bigint;
  txHash: string;
  strategyId: string;
  amount: bigint;
  estimatedReturn: bigint;
  openedAt: number;
}

export interface CloseResult {
  txHash: string;
  pnl: bigint;
}

export interface DWalletInfo {
  dwalletId: string;
  publicKey: string;
  stellarAddress: string;
  label: string;
  network: string;
  createdAt: number;
}

export interface X402PaymentRequest {
  amount: bigint;
  asset: string;
  recipient: string;
  memo: string;
  expiresAt: number;
  serviceUrl: string;
}

export interface X402PaymentProof {
  paymentId: string;
  from: string;
  to: string;
  amount: bigint;
  asset: string;
  memo: string;
  ledgerSequence: number;
}

export interface FHEKeys {
  keyId: string;
  publicKey: string;
}

export interface EncryptedStrategyParams {
  keyId: string;
  targetAllocationCiphertext: string;
  maxSlippageCiphertext: string;
  entryPriceThresholdCiphertext: string;
}
