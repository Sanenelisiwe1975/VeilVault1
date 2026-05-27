// ── Vault types ───────────────────────────────────────────────────────────────

export interface VaultInfo {
  contractId: string;
  name: string;
  admin: string;
  asset: string;
  totalShares: bigint;
  totalAssets: bigint;
  deployedAssets: bigint;
  paused: boolean;
  guardrails: GuardrailsConfig;
}

export interface GuardrailsConfig {
  maxDrawdownBps: number;       // e.g. 2000 = 20%
  dailySpendingCap: bigint;     // 0 = unlimited
  timeLockSeconds: number;
  whitelistedProtocols: string[];
  maxPositionSizeBps: number;   // 0 = unlimited
  maxLeverageBps: number;       // 0 = unlimited
  emergencyStop: boolean;
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

// ── Position types ────────────────────────────────────────────────────────────

export enum StrategyType {
  Lending           = 0,
  LiquidityProvision = 1,
  Staking           = 2,
  Arbitrage         = 3,
  Other             = 4,
}

export interface Position {
  id: bigint;
  agent: string;
  protocol: string;
  asset: string;
  amount: bigint;
  entryValue: bigint;
  openedAt: number;
  expiresAt: number;
  strategyType: StrategyType;
  metadata: string;     // hex-encoded bytes (may be FHE ciphertext)
  isOpen: boolean;
}

export interface OpenPositionParams {
  agent: string;
  protocol: string;
  amount: bigint;
  expiresAt?: number;
  strategyType: StrategyType;
  metadata?: Buffer;
  agentSecretKey: string;
}

export interface ClosePositionParams {
  agent: string;
  positionId: bigint;
  returnAmount: bigint;
  agentSecretKey: string;
}

// ── x402 Payment types ────────────────────────────────────────────────────────

export interface X402PaymentRequest {
  amount: bigint;
  asset: string;       // SAC contract address or XLM
  recipient: string;   // Stellar G... address
  memo: string;
  expiresAt: number;
  serviceUrl: string;
}

export interface X402PaymentProof {
  paymentId: string;   // Stellar tx hash
  from: string;
  to: string;
  amount: bigint;
  asset: string;
  memo: string;
  ledgerSequence: number;
  expiresAt: number;
}

export interface X402PaymentStatus {
  paymentId: string;
  verified: boolean;
  consumed: boolean;
}

// ── Ika dWallet types ─────────────────────────────────────────────────────────

export interface DWalletCreateParams {
  label: string;
  stellarAddress: string;
  network: 'testnet' | 'mainnet';
}

export interface DWalletInfo {
  dwalletId: string;
  publicKey: string;    // hex-encoded ed25519 public key
  stellarAddress: string;
  label: string;
  network: string;
  createdAt: number;
}

export interface DWalletSignRequest {
  dwalletId: string;
  message: string;      // hex-encoded message to sign
}

export interface DWalletSignResult {
  dwalletId: string;
  message: string;
  signature: string;    // hex-encoded ed25519 signature
}

// ── FHE types ─────────────────────────────────────────────────────────────────

export interface FHEKeyPair {
  publicKey: string;    // hex-encoded FHE public key
  privateKey: string;   // hex-encoded FHE private key (store securely!)
  keyId: string;
}

export interface FHEEncryptedValue {
  ciphertext: string;   // hex-encoded FHE ciphertext
  keyId: string;
  dataType: 'int32' | 'uint32' | 'int64' | 'bytes';
}

export interface EncryptedStrategyParams {
  targetAllocation: FHEEncryptedValue;
  maxSlippage: FHEEncryptedValue;
  entryPriceThreshold: FHEEncryptedValue;
  keyId: string;
}

// ── Strategy types ────────────────────────────────────────────────────────────

export interface StrategyDefinition {
  id: string;
  name: string;
  protocol: string;
  strategyType: StrategyType;
  minAmount: bigint;
  maxAmount: bigint;
  estimatedApr: number;   // basis points
  riskLevel: 'low' | 'medium' | 'high';
  description: string;
}

export interface StrategyExecutionRequest {
  strategyId: string;
  vaultContractId: string;
  amount: bigint;
  agentAddress: string;
  agentSecretKey: string;
  encryptedParams?: EncryptedStrategyParams;
  useDWallet?: boolean;
  dwalletId?: string;
}

export interface StrategyExecutionResult {
  positionId: bigint;
  txHash: string;
  strategyId: string;
  amount: bigint;
  estimatedReturn: bigint;
  openedAt: number;
}

// ── Agent types ───────────────────────────────────────────────────────────────

export interface AgentRegistration {
  agentId: string;
  stellarAddress: string;
  dwalletId?: string;
  apiKeyHash: string;
  permissions: AgentPermission[];
  registeredAt: number;
}

export enum AgentPermission {
  READ_VAULT   = 'read_vault',
  OPEN_POSITION = 'open_position',
  CLOSE_POSITION = 'close_position',
  MAKE_PAYMENT = 'make_payment',
}

// ── API types ─────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  requestId: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}
