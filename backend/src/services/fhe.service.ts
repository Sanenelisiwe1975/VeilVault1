import { fheService, FHEService } from '../integrations/fhe/client';
import { createChildLogger } from '../utils/logger';
import { FHEKeyPair, EncryptedStrategyParams } from '../types';

export { FHEService };

const log = createChildLogger('fhe-service');

export class VaultFHEService {
  private fhe: FHEService;

  constructor() {
    this.fhe = fheService;
  }

  /** Generate a new FHE key pair for a vault/agent. */
  async generateKeys(): Promise<{ keyId: string; publicKey: string }> {
    log.info('Generating FHE keys');
    const kp = await this.fhe.generateKeyPair();
    return { keyId: kp.keyId, publicKey: kp.publicKey };
  }

  /** Encrypt strategy parameters using a pre-generated key. */
  async encryptStrategy(params: {
    targetAllocation: number;
    maxSlippage: number;
    entryPriceThreshold: bigint;
    keyId: string;
  }): Promise<{ encrypted: EncryptedStrategyParams; onChainBuffer: Buffer }> {
    log.info({ keyId: params.keyId }, 'Encrypting strategy params');

    const encrypted = await this.fhe.encryptStrategyParams(params);
    const onChainBuffer = this.fhe.encryptedParamsToBuffer(encrypted);

    return { encrypted, onChainBuffer };
  }

  /** Decrypt strategy parameters (only the key owner can do this). */
  async decryptStrategy(params: {
    encrypted: EncryptedStrategyParams;
    keyId?: string;
  }): Promise<{ targetAllocation: number; maxSlippage: number; entryPriceThreshold: bigint }> {
    log.info({ keyId: params.encrypted.keyId }, 'Decrypting strategy params');
    return this.fhe.decryptStrategyParams(params.encrypted, params.keyId);
  }

  /** Parse on-chain metadata bytes back to encrypted params. */
  parseOnChainMetadata(buf: Buffer): EncryptedStrategyParams {
    return this.fhe.encryptedParamsFromBuffer(buf);
  }
}

export const vaultFHEService = new VaultFHEService();
