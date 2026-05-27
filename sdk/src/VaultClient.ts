import axios, { AxiosInstance } from 'axios';
import {
  SDKConfig,
  VaultState,
  UserPosition,
  DepositResult,
  WithdrawResult,
  GuardrailsConfig,
} from './types';

function parseBigIntFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === 'string') {
      (result as Record<string, unknown>)[field as string] = BigInt(result[field] as string);
    }
  }
  return result;
}

export class VaultClient {
  private http: AxiosInstance;

  constructor(private readonly config: SDKConfig) {
    this.http = axios.create({
      baseURL: `${config.apiUrl}/api/vault`,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
  }

  /** Get current vault state (total assets, shares, share price). */
  async getState(): Promise<VaultState> {
    const res = await this.http.get<{ success: boolean; data: Record<string, string> }>('/info');
    const d = res.data.data;
    return {
      totalAssets: BigInt(d.totalAssets),
      totalShares: BigInt(d.totalShares),
      sharePrice: BigInt(d.sharePrice),
    };
  }

  /** Get the share balance and asset value for an address. */
  async getUserPosition(address: string): Promise<UserPosition> {
    const [state, sharesRes] = await Promise.all([
      this.getState(),
      this.http.get<{ success: boolean; data: { balance: string } }>(`/balance/${address}`),
    ]);
    const shares = BigInt(sharesRes.data.data.balance);
    const assetValue = state.totalShares > 0n
      ? (shares * state.totalAssets) / state.totalShares
      : 0n;
    return { shares, assetValue, sharePrice: state.sharePrice };
  }

  /**
   * Deposit assets into the vault.
   *
   * @param fromPublicKey - Stellar public key of the depositor
   * @param amount - Amount in asset base units (e.g. stroops / token smallest unit)
   * @param signerSecretKey - Secret key to sign the transaction
   */
  async deposit(
    fromPublicKey: string,
    amount: bigint,
    signerSecretKey: string,
  ): Promise<DepositResult> {
    const res = await this.http.post<{ success: boolean; data: Record<string, string> }>(
      '/deposit',
      { fromPublicKey, amount: amount.toString(), signerSecretKey },
    );
    const d = res.data.data;
    return {
      txHash: d.txHash,
      sharesReceived: BigInt(d.sharesReceived),
      assetsDeposited: BigInt(d.assetsDeposited),
    };
  }

  /**
   * Withdraw assets from the vault by burning shares.
   *
   * @param fromPublicKey - Stellar public key of the withdrawer
   * @param shares - Number of shares to burn
   * @param signerSecretKey - Secret key to sign the transaction
   */
  async withdraw(
    fromPublicKey: string,
    shares: bigint,
    signerSecretKey: string,
  ): Promise<WithdrawResult> {
    const res = await this.http.post<{ success: boolean; data: Record<string, string> }>(
      '/withdraw',
      { fromPublicKey, shares: shares.toString(), signerSecretKey },
    );
    const d = res.data.data;
    return {
      txHash: d.txHash,
      assetsReceived: BigInt(d.assetsReceived),
      sharesBurned: BigInt(d.sharesBurned),
    };
  }

  /** Add an authorized agent (admin only). */
  async addAgent(agentAddress: string): Promise<string> {
    const res = await this.http.post<{ success: boolean; data: { txHash: string } }>(
      '/agents',
      { agentAddress },
    );
    return res.data.data.txHash;
  }

  /** Remove an authorized agent (admin only). */
  async removeAgent(agentAddress: string): Promise<string> {
    const res = await this.http.delete<{ success: boolean; data: { txHash: string } }>(
      `/agents/${agentAddress}`,
    );
    return res.data.data.txHash;
  }

  /** Trigger emergency stop (admin only). */
  async emergencyStop(): Promise<string> {
    const res = await this.http.post<{ success: boolean; data: { txHash: string } }>(
      '/emergency-stop',
    );
    return res.data.data.txHash;
  }

  /** Get vault monitoring metrics (last N snapshots). */
  async getMetrics(limit = 60): Promise<object[]> {
    const res = await this.http.get<{ success: boolean; data: object[] }>(
      `/metrics?limit=${limit}`,
    );
    return res.data.data;
  }
}
