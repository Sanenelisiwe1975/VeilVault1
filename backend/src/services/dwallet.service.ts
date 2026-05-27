import { Keypair } from '@stellar/stellar-sdk';
import { ikaDWalletClient } from '../integrations/ika/client';
import { stellarClient } from '../integrations/stellar/client';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { DWalletCreateParams, DWalletInfo, DWalletSignResult } from '../types';
import { fromHex, toHex, verifyEd25519, strToBytes } from '../utils/crypto';

const log = createChildLogger('dwallet-service');

export class DWalletService {
  /** Create a new Ika dWallet and register its public key on-chain. */
  async createAndRegister(params: {
    label: string;
    stellarAddress: string;
  }): Promise<DWalletInfo> {
    log.info({ label: params.label, stellarAddress: params.stellarAddress }, 'Creating dWallet');

    const dwalletInfo = await ikaDWalletClient.createDWallet({
      label: params.label,
      stellarAddress: params.stellarAddress,
      network: config.IKA_NETWORK,
    });

    // Register on-chain if verifier contract is configured
    if (config.DWALLET_VERIFIER_CONTRACT_ID) {
      await this.registerOnChain(dwalletInfo);
    }

    log.info({ dwalletId: dwalletInfo.dwalletId }, 'dWallet created and registered');
    return dwalletInfo;
  }

  /** Register an existing dWallet on the Soroban verifier contract. */
  private async registerOnChain(dwalletInfo: DWalletInfo): Promise<string> {
    const adminKeypair = Keypair.fromSecret(config.ADMIN_SECRET_KEY);
    const { nativeToScVal, Address, xdr } = await import('@stellar/stellar-sdk');

    const { txHash } = await stellarClient.invokeContract({
      contractId: config.DWALLET_VERIFIER_CONTRACT_ID!,
      method: 'register_dwallet',
      args: [
        new Address(config.DWALLET_VERIFIER_CONTRACT_ID!).toScVal(), // placeholder
        nativeToScVal(dwalletInfo.dwalletId, { type: 'string' }),
        nativeToScVal(Buffer.from(dwalletInfo.publicKey, 'hex'), { type: 'bytes' }),
        new Address(dwalletInfo.stellarAddress).toScVal(),
        nativeToScVal(dwalletInfo.label, { type: 'string' }),
      ],
      signerSecretKey: config.ADMIN_SECRET_KEY,
    });

    return txHash;
  }

  /** Request a dWallet signature via Ika's MPC network. */
  async sign(dwalletId: string, message: string | Buffer): Promise<DWalletSignResult> {
    const msgHex = Buffer.isBuffer(message)
      ? message.toString('hex')
      : Buffer.from(message, 'utf-8').toString('hex');

    log.info({ dwalletId }, 'Requesting dWallet signature');
    return ikaDWalletClient.sign({ dwalletId, message: msgHex });
  }

  /** Verify a dWallet signature locally (without on-chain call). */
  verifySignatureLocally(params: {
    message: string;        // hex
    signature: string;      // hex
    publicKey: string;      // hex
  }): boolean {
    return verifyEd25519(
      fromHex(params.message),
      fromHex(params.signature),
      fromHex(params.publicKey),
    );
  }

  /** Get info about a dWallet. */
  async getDWallet(dwalletId: string): Promise<DWalletInfo> {
    return ikaDWalletClient.getDWallet(dwalletId);
  }

  /** List all registered dWallets. */
  async listDWallets(): Promise<DWalletInfo[]> {
    return ikaDWalletClient.listDWallets(config.IKA_NETWORK);
  }

  /** Revoke a dWallet (Ika + on-chain). */
  async revoke(dwalletId: string): Promise<void> {
    log.warn({ dwalletId }, 'Revoking dWallet');
    await ikaDWalletClient.revokeDWallet(dwalletId);

    if (config.DWALLET_VERIFIER_CONTRACT_ID) {
      const { nativeToScVal } = await import('@stellar/stellar-sdk');
      await stellarClient.invokeContract({
        contractId: config.DWALLET_VERIFIER_CONTRACT_ID,
        method: 'revoke_dwallet',
        args: [nativeToScVal(dwalletId, { type: 'string' })],
        signerSecretKey: config.ADMIN_SECRET_KEY,
      });
    }
  }
}

export const dwalletService = new DWalletService();
