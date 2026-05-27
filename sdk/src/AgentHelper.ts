import axios, { AxiosInstance } from 'axios';
import {
  SDKConfig,
  DWalletInfo,
  X402PaymentProof,
  X402PaymentRequest,
} from './types';

/**
 * AgentHelper provides all utilities an autonomous AI agent needs to interact
 * with VeilVault1: dWallet management, x402 payments, and self-description.
 *
 * Designed for use with LLM tool-use systems, autonomous trading bots,
 * and Zerion-style DeFi agents.
 *
 * @example
 * ```typescript
 * const agent = new AgentHelper({
 *   apiUrl: 'https://api.veilVault1.xyz',
 *   apiKey: process.env.VEIL_API_KEY!,
 * });
 *
 * // Create a dWallet for this agent
 * const wallet = await agent.createDWallet({
 *   label: 'trading-bot-01',
 *   stellarAddress: myPublicKey,
 * });
 *
 * // Make an x402 payment to access a strategy
 * const proof = await agent.verifyPayment({
 *   txHash: myPaymentTxHash,
 *   expectedTo: VAULT_SERVICE_ADDRESS,
 *   expectedAmount: 1_000_000n,
 *   expectedAsset: USDC_SAC_ADDRESS,
 *   expectedMemo: 'strategy-access',
 * });
 * ```
 */
export class AgentHelper {
  private http: AxiosInstance;

  constructor(private readonly config: SDKConfig) {
    this.http = axios.create({
      baseURL: config.apiUrl,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
  }

  // ── dWallet management ────────────────────────────────────────────────────

  /** Create a new Ika dWallet and register it on-chain. */
  async createDWallet(params: {
    label: string;
    stellarAddress: string;
  }): Promise<DWalletInfo> {
    const res = await this.http.post<{ success: boolean; data: DWalletInfo }>(
      '/api/agents/dwallet',
      params,
    );
    return res.data.data;
  }

  /** Get a dWallet by ID. */
  async getDWallet(dwalletId: string): Promise<DWalletInfo> {
    const res = await this.http.get<{ success: boolean; data: DWalletInfo }>(
      `/api/agents/dwallet/${dwalletId}`,
    );
    return res.data.data;
  }

  /** List all dWallets. */
  async listDWallets(): Promise<DWalletInfo[]> {
    const res = await this.http.get<{ success: boolean; data: DWalletInfo[] }>(
      '/api/agents/dwallet',
    );
    return res.data.data;
  }

  /** Sign a message with a dWallet. Returns hex-encoded signature. */
  async signWithDWallet(dwalletId: string, message: string): Promise<string> {
    const res = await this.http.post<{ success: boolean; data: { signature: string } }>(
      '/api/agents/dwallet/sign',
      { dwalletId, message },
    );
    return res.data.data.signature;
  }

  /** Revoke a dWallet. */
  async revokeDWallet(dwalletId: string): Promise<void> {
    await this.http.delete(`/api/agents/dwallet/${dwalletId}`);
  }

  // ── x402 Payment utilities ────────────────────────────────────────────────

  /**
   * Submit a Stellar transaction hash to verify a payment.
   * The backend checks Horizon and attests on-chain.
   *
   * Call this after making a Stellar payment; store the `paymentId` (tx hash)
   * and include it as `X-Payment-Id` header in subsequent API requests.
   */
  async verifyPayment(params: {
    txHash: string;
    expectedTo: string;
    expectedAmount: bigint;
    expectedAsset: string;
    expectedMemo: string;
  }): Promise<X402PaymentProof> {
    const res = await this.http.post<{ success: boolean; data: Record<string, unknown> }>(
      '/api/payments/verify',
      {
        ...params,
        expectedAmount: params.expectedAmount.toString(),
      },
    );
    const d = res.data.data;
    return {
      paymentId: d.paymentId as string,
      from: d.from as string,
      to: d.to as string,
      amount: BigInt(d.amount as string),
      asset: d.asset as string,
      memo: d.memo as string,
      ledgerSequence: d.ledgerSequence as number,
    };
  }

  /** Check the status of a payment. */
  async checkPaymentStatus(paymentId: string): Promise<{ verified: boolean; consumed: boolean }> {
    const res = await this.http.get<{
      success: boolean;
      data: { verified: boolean; consumed: boolean };
    }>(`/api/payments/status/${paymentId}`);
    return res.data.data;
  }

  /**
   * Request a payment challenge for a resource.
   * Returns the details needed to make the payment.
   */
  async getPaymentRequest(params: {
    amount: bigint;
    asset: string;
    recipient: string;
    memo: string;
    serviceUrl: string;
  }): Promise<X402PaymentRequest> {
    const res = await this.http.post<{ success: boolean; data: Record<string, unknown> }>(
      '/api/payments/request',
      { ...params, amount: params.amount.toString() },
    );
    const d = res.data.data;
    return {
      amount: BigInt(d.amount as string),
      asset: d.asset as string,
      recipient: d.recipient as string,
      memo: d.memo as string,
      expiresAt: d.expiresAt as number,
      serviceUrl: d.serviceUrl as string,
    };
  }

  // ── Agent introspection ───────────────────────────────────────────────────

  /**
   * Returns a structured description of VeilVault1 capabilities
   * for use by LLM tool-use or agent planning systems.
   */
  getCapabilityManifest(): object {
    return {
      name: 'VeilVault1',
      description: 'Private and programmable yield platform for AI agents on Stellar',
      version: '0.1.0',
      network: this.config.network ?? 'testnet',
      capabilities: [
        {
          id: 'deposit',
          description: 'Deposit assets into a yield vault and receive shares',
          requiredAuth: 'stellar-keypair',
        },
        {
          id: 'withdraw',
          description: 'Burn shares to withdraw proportional assets from vault',
          requiredAuth: 'stellar-keypair',
        },
        {
          id: 'execute_strategy',
          description: 'Deploy vault capital to a whitelisted DeFi protocol',
          requiredAuth: 'stellar-keypair + agent-authorization',
          optional: ['fhe-encryption', 'dwallet-signing'],
        },
        {
          id: 'x402_payment',
          description: 'Pay for premium services using Stellar transactions (HTTP 402)',
          requiredAuth: 'stellar-payment',
        },
        {
          id: 'dwallet',
          description: 'Create and manage Ika MPC wallets for cross-chain signing',
          requiredAuth: 'api-key',
        },
      ],
      guardrails: {
        description: 'On-chain risk controls that cannot be bypassed',
        features: [
          'max_drawdown_bps',
          'daily_spending_cap',
          'time_lock_seconds',
          'whitelisted_protocols',
          'max_position_size_bps',
          'emergency_stop',
        ],
      },
    };
  }
}
