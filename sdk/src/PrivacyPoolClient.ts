import axios, { AxiosInstance } from 'axios';

export interface PoolState {
  denomination: string;
  asset: string;
  totalDeposits: number;
  totalWithdrawals: number;
  isPaused: boolean;
  zkVerifier: string | null;
}

export interface PoolTreeState {
  nextIndex: number;
  depth: number;
  currentRoot: string;
}

export interface PoolDepositResult {
  leafIndex: number;
  commitment: string;
  txHash: string;
}

export interface PoolWithdrawResult {
  txHash: string;
  recipient: string;
}

export interface CommitmentResult {
  commitment: string;
  nullifierHash: string;
}

export interface PrivacyPoolClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export class PrivacyPoolClient {
  private http: AxiosInstance;

  constructor(cfg: PrivacyPoolClientConfig) {
    this.http = axios.create({
      baseURL: `${cfg.baseUrl}/api/privacy-pool`,
      timeout: cfg.timeout ?? 60_000,
      headers: { 'x-api-key': cfg.apiKey, 'content-type': 'application/json' },
    });
  }

  /** Pool config and aggregate stats. */
  async getState(): Promise<PoolState> {
    const { data } = await this.http.get<{ success: true; data: PoolState }>('/state');
    return data.data;
  }

  /** Merkle tree metadata (depth, next leaf index, current root). */
  async getTreeState(): Promise<PoolTreeState> {
    const { data } = await this.http.get<{ success: true; data: PoolTreeState }>('/tree');
    return data.data;
  }

  /** Current Merkle root as 64-char hex. */
  async getCurrentRoot(): Promise<string> {
    const { data } = await this.http.get<{ success: true; data: { root: string } }>('/root');
    return data.data.root;
  }

  /** Whether a nullifier hash has already been spent. */
  async isNullifierSpent(nullifierHash: string): Promise<boolean> {
    const { data } = await this.http.get<{ success: true; data: { nullifierHash: string; spent: boolean } }>(
      `/nullifier/${nullifierHash}`,
    );
    return data.data.spent;
  }

  /** Whether a Merkle root is within the recent history window (valid for proof submission). */
  async isKnownRoot(root: string): Promise<boolean> {
    const { data } = await this.http.get<{ success: true; data: { root: string; known: boolean } }>(
      `/root/${root}/known`,
    );
    return data.data.known;
  }

  /**
   * Local helper — derives commitment and nullifierHash from secret and nullifier.
   * The computation runs server-side but the secret/nullifier are NEVER stored.
   * For maximum privacy, use `computeCommitmentLocally` instead.
   */
  async computeCommitment(secret: string, nullifier: string): Promise<CommitmentResult> {
    const { data } = await this.http.post<{ success: true; data: CommitmentResult }>('/commitment', {
      secret,
      nullifier,
    });
    return data.data;
  }

  /**
   * Deposit one denomination unit.
   *
   * Steps:
   *   1. Generate 32-byte secret and nullifier (keep private forever).
   *   2. Call `computeCommitment` or derive locally: SHA-256(secret || nullifier).
   *   3. Pass the commitment hex here.
   *   4. Record the returned `leafIndex` — needed for the withdrawal proof.
   */
  async deposit(depositorSecret: string, commitment: string): Promise<PoolDepositResult> {
    const { data } = await this.http.post<{ success: true; data: PoolDepositResult }>('/deposit', {
      depositorSecret,
      commitment,
    });
    return data.data;
  }

  /**
   * Withdraw one denomination unit using a pre-verified Groth16 proof.
   *
   * Steps:
   *   1. Generate Groth16 proof off-chain binding root, nullifierHash, recipient, denomination.
   *   2. Submit proof to AttestationClient.attestPerformance() → get attestationId.
   *   3. Pass root, nullifierHash, and attestationId here.
   */
  async withdraw(params: {
    recipientSecret: string;
    root: string;
    nullifierHash: string;
    attestationId: string;
  }): Promise<PoolWithdrawResult> {
    const { data } = await this.http.post<{ success: true; data: PoolWithdrawResult }>('/withdraw', params);
    return data.data;
  }
}
