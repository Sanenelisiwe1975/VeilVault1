/**
 * Ika dWallet API client.
 *
 * Ika enables multi-party computation wallets that can sign for multiple
 * chains without exposing private keys. This client wraps Ika's REST API
 * to create/manage dWallets and request signatures.
 *
 * Docs: https://docs.ika.xyz
 */
import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';
import { createChildLogger } from '../../utils/logger';
import { DWalletCreateParams, DWalletInfo, DWalletSignRequest, DWalletSignResult } from '../../types';

const log = createChildLogger('ika-client');

interface IkaCreateWalletResponse {
  wallet_id: string;
  public_key: string;
  stellar_address: string;
  network: string;
  created_at: number;
}

interface IkaSignResponse {
  wallet_id: string;
  message: string;
  signature: string;
  signed_at: number;
}

interface IkaGetWalletResponse {
  wallet_id: string;
  public_key: string;
  stellar_address: string;
  network: string;
  label: string;
  created_at: number;
  status: 'active' | 'revoked';
}

export class IkaDWalletClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.IKA_API_URL,
      headers: {
        'Authorization': `Bearer ${config.IKA_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Ika-Network': config.IKA_NETWORK,
      },
      timeout: 15_000,
    });

    this.http.interceptors.response.use(
      res => res,
      err => {
        log.error({ err: err.message, url: err.config?.url }, 'Ika API error');
        throw err;
      },
    );
  }

  /** Create a new dWallet linked to a Stellar address. */
  async createDWallet(params: DWalletCreateParams): Promise<DWalletInfo> {
    log.info({ stellarAddress: params.stellarAddress, label: params.label }, 'Creating dWallet');

    const response = await this.http.post<IkaCreateWalletResponse>('/v1/wallets', {
      label: params.label,
      stellar_address: params.stellarAddress,
      network: params.network,
      key_scheme: 'ed25519',
    });

    const data = response.data;
    return {
      dwalletId: data.wallet_id,
      publicKey: data.public_key,
      stellarAddress: data.stellar_address,
      label: params.label,
      network: data.network,
      createdAt: data.created_at,
    };
  }

  /** Retrieve dWallet info by ID. */
  async getDWallet(dwalletId: string): Promise<DWalletInfo> {
    const response = await this.http.get<IkaGetWalletResponse>(`/v1/wallets/${dwalletId}`);
    const data = response.data;
    return {
      dwalletId: data.wallet_id,
      publicKey: data.public_key,
      stellarAddress: data.stellar_address,
      label: data.label,
      network: data.network,
      createdAt: data.created_at,
    };
  }

  /** Request a signature over a message (hex-encoded). */
  async sign(request: DWalletSignRequest): Promise<DWalletSignResult> {
    log.info({ dwalletId: request.dwalletId }, 'Requesting dWallet signature');

    const response = await this.http.post<IkaSignResponse>(
      `/v1/wallets/${request.dwalletId}/sign`,
      { message: request.message },
    );

    return {
      dwalletId: response.data.wallet_id,
      message: response.data.message,
      signature: response.data.signature,
    };
  }

  /** List all dWallets for the authenticated account. */
  async listDWallets(network?: string): Promise<DWalletInfo[]> {
    const params = network ? { network } : {};
    const response = await this.http.get<IkaGetWalletResponse[]>('/v1/wallets', { params });
    return response.data.map(d => ({
      dwalletId: d.wallet_id,
      publicKey: d.public_key,
      stellarAddress: d.stellar_address,
      label: d.label,
      network: d.network,
      createdAt: d.created_at,
    }));
  }

  /** Revoke (deactivate) a dWallet. */
  async revokeDWallet(dwalletId: string): Promise<void> {
    log.warn({ dwalletId }, 'Revoking dWallet');
    await this.http.delete(`/v1/wallets/${dwalletId}`);
  }
}

export const ikaDWalletClient = new IkaDWalletClient();
