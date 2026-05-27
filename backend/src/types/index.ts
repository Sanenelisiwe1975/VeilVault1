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

// ── Agent Registry types ──────────────────────────────────────────────────────

export enum ReputationLevel {
  Unverified = 0,
  Verified   = 1,
  Trusted    = 2,
  Elite      = 3,
}

export interface AgentProfile {
  did: string;
  stellarAddress: string;
  vcHash: string;
  vcUri: string;
  reputationScore: number;       // 0–10000 bps
  level: ReputationLevel;
  totalExecutions: bigint;
  successfulExecutions: bigint;
  totalVolume: bigint;
  winStreak: number;
  banned: boolean;
  registeredAt: number;
  updatedAt: number;
}

// ── Strategy Marketplace types ────────────────────────────────────────────────

export enum StrategyCategory {
  Lending            = 0,
  LiquidityProvision = 1,
  Staking            = 2,
  Arbitrage          = 3,
  RWA                = 4,
  Remittance         = 5,
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

// ── Stokvel types ─────────────────────────────────────────────────────────────

export enum ProposalType {
  Distribution  = 0,
  Withdrawal    = 1,
  AddMember     = 2,
  RemoveMember  = 3,
  EmergencyStop = 4,
}

export enum ProposalStatus {
  Active   = 0,
  Approved = 1,
  Rejected = 2,
  Executed = 3,
  Expired  = 4,
}

export interface StokvelConfig {
  admin: string;
  name: string;
  asset: string;
  threshold: number;
  maxMembers: number;
  contributionAmount: bigint;
  contributionIntervalSecs: bigint;
  yieldVault: string | null;
  totalContributed: bigint;
  totalDistributed: bigint;
  memberCount: number;
  proposalCount: bigint;
  paused: boolean;
}

export interface StokvelMember {
  address: string;
  shareBps: number;
  totalContributed: bigint;
  lastContribution: number;
  joinedAt: number;
}

export interface StokvelProposal {
  id: bigint;
  proposer: string;
  proposalType: ProposalType;
  status: ProposalStatus;
  approvals: string[];
  rejections: string[];
  targetAddress: string | null;
  amount: bigint | null;
  expiresAt: number;
  createdAt: number;
  executedAt: number | null;
}

// ── ZK Attestation types ──────────────────────────────────────────────────────

export interface Groth16Proof {
  a: string;  // hex, 96 bytes
  b: string;  // hex, 192 bytes
  c: string;  // hex, 96 bytes
}

export interface PerformanceAttestation {
  attestationId: string;
  circuitId: string;
  vault: string;
  prover: string;
  strategyCommitment: string;
  periodStart: number;
  periodEnd: number;
  returnBps: number;
  proof: Groth16Proof;
  publicInputsHash: string;
  verified: boolean;
  timestamp: number;
}

// ── Multi-Agent types ─────────────────────────────────────────────────────────

export enum AgentRole {
  Orchestrator = 'orchestrator',
  Executor     = 'executor',
  Analyst      = 'analyst',
  RiskManager  = 'risk_manager',
}

export enum TaskStatus {
  Pending   = 'pending',
  Running   = 'running',
  Completed = 'completed',
  Failed    = 'failed',
  Cancelled = 'cancelled',
}

export interface AgentTask {
  taskId: string;
  orchestrator: string;
  delegate: string;
  operationId: string;
  role: AgentRole;
  payload: Record<string, unknown>;
  status: TaskStatus;
  createdAt: number;
  completedAt: number | null;
  result: unknown | null;
  error: string | null;
}

export interface WorkflowConfig {
  workflowId: string;
  vaultAddress: string;
  orchestratorAddress: string;
  agents: { address: string; role: AgentRole; weight: number }[];
  consensusThreshold: number;
}

// ── RWA types ─────────────────────────────────────────────────────────────────

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
  faceValue: bigint;
  currentValue: bigint;
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
