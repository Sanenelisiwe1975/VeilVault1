/**
 * FHE (Fully Homomorphic Encryption) client using TFHE-rs (via the `tfhe` npm package).
 *
 * Enables encrypted strategy parameters so vault agents can prove execution
 * correctness without revealing proprietary trading logic.
 *
 * The `tfhe` npm package provides WASM bindings to TFHE-rs by Zama.
 */
import { createChildLogger } from '../../utils/logger';
import { FHEEncryptedValue, FHEKeyPair, EncryptedStrategyParams } from '../../types';
import { randomNonce, toHex, fromHex } from '../../utils/crypto';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../config';

const log = createChildLogger('fhe-client');

// Lazily loaded TFHE module
let tfhe: typeof import('tfhe') | null = null;

async function getTfhe() {
  if (!tfhe) {
    tfhe = await import('tfhe');
  }
  return tfhe;
}

export class FHEService {
  private keysDir: string;

  constructor() {
    this.keysDir = config.FHE_KEYS_DIR;
    if (!fs.existsSync(this.keysDir)) {
      fs.mkdirSync(this.keysDir, { recursive: true });
    }
  }

  /** Generate a new FHE keypair and persist it to disk. */
  async generateKeyPair(): Promise<FHEKeyPair> {
    const lib = await getTfhe();
    log.info('Generating FHE key pair (this may take a moment)...');

    const config_fhe = lib.ConfigBuilder.default().build();
    const clientKey = lib.ClientKey.generate(config_fhe);
    const publicKey = lib.CompactPublicKey.new(clientKey);

    const keyId = randomNonce().slice(0, 16);
    const keyPair: FHEKeyPair = {
      publicKey: toHex(publicKey.serialize()),
      privateKey: toHex(clientKey.serialize()),
      keyId,
    };

    // Persist keys
    const keyPath = path.join(this.keysDir, `${keyId}.json`);
    fs.writeFileSync(keyPath, JSON.stringify({ keyId, publicKey: keyPair.publicKey }));

    // Store private key separately (never log or expose)
    const privPath = path.join(this.keysDir, `${keyId}.priv`);
    fs.writeFileSync(privPath, keyPair.privateKey, { mode: 0o600 });

    log.info({ keyId }, 'FHE key pair generated');
    return keyPair;
  }

  /** Load an existing keypair from disk. */
  async loadKeyPair(keyId: string): Promise<FHEKeyPair> {
    const pubPath = path.join(this.keysDir, `${keyId}.json`);
    const privPath = path.join(this.keysDir, `${keyId}.priv`);

    if (!fs.existsSync(pubPath) || !fs.existsSync(privPath)) {
      throw new Error(`FHE key pair not found: ${keyId}`);
    }

    const pub = JSON.parse(fs.readFileSync(pubPath, 'utf-8'));
    const priv = fs.readFileSync(privPath, 'utf-8').trim();

    return { keyId, publicKey: pub.publicKey, privateKey: priv };
  }

  /** Encrypt a 32-bit signed integer. */
  async encryptInt32(value: number, keyPair: FHEKeyPair): Promise<FHEEncryptedValue> {
    const lib = await getTfhe();
    const clientKey = lib.ClientKey.deserialize(fromHex(keyPair.privateKey));
    const ct = lib.FheInt32.encrypt_with_client_key(value, clientKey);

    return {
      ciphertext: toHex(ct.serialize()),
      keyId: keyPair.keyId,
      dataType: 'int32',
    };
  }

  /** Decrypt a 32-bit signed integer. */
  async decryptInt32(encrypted: FHEEncryptedValue, keyPair: FHEKeyPair): Promise<number> {
    const lib = await getTfhe();
    const clientKey = lib.ClientKey.deserialize(fromHex(keyPair.privateKey));
    const ct = lib.FheInt32.deserialize(fromHex(encrypted.ciphertext));
    return ct.decrypt(clientKey) as number;
  }

  /** Encrypt a 64-bit signed integer (for amounts). */
  async encryptInt64(value: bigint, keyPair: FHEKeyPair): Promise<FHEEncryptedValue> {
    const lib = await getTfhe();
    const clientKey = lib.ClientKey.deserialize(fromHex(keyPair.privateKey));
    const ct = lib.FheInt64.encrypt_with_client_key(Number(value), clientKey);

    return {
      ciphertext: toHex(ct.serialize()),
      keyId: keyPair.keyId,
      dataType: 'int64',
    };
  }

  /** Encrypt an entire strategy parameter set. */
  async encryptStrategyParams(params: {
    targetAllocation: number;   // basis points
    maxSlippage: number;        // basis points
    entryPriceThreshold: bigint; // in asset units
    keyId: string;
  }): Promise<EncryptedStrategyParams> {
    const keyPair = await this.loadKeyPair(params.keyId);

    const [targetAlloc, maxSlippage, entryPrice] = await Promise.all([
      this.encryptInt32(params.targetAllocation, keyPair),
      this.encryptInt32(params.maxSlippage, keyPair),
      this.encryptInt64(params.entryPriceThreshold, keyPair),
    ]);

    return {
      targetAllocation: targetAlloc,
      maxSlippage: maxSlippage,
      entryPriceThreshold: entryPrice,
      keyId: params.keyId,
    };
  }

  /** Decrypt an entire strategy parameter set. */
  async decryptStrategyParams(
    encrypted: EncryptedStrategyParams,
    keyId?: string,
  ): Promise<{ targetAllocation: number; maxSlippage: number; entryPriceThreshold: bigint }> {
    const kId = keyId ?? encrypted.keyId;
    const keyPair = await this.loadKeyPair(kId);

    const [targetAllocation, maxSlippage, entryPriceThreshold] = await Promise.all([
      this.decryptInt32(encrypted.targetAllocation, keyPair),
      this.decryptInt32(encrypted.maxSlippage, keyPair),
      this.decryptInt32(encrypted.entryPriceThreshold, keyPair).then(BigInt),
    ]);

    return { targetAllocation, maxSlippage, entryPriceThreshold };
  }

  /** Serialize encrypted params to a Buffer suitable for on-chain storage. */
  encryptedParamsToBuffer(params: EncryptedStrategyParams): Buffer {
    const json = JSON.stringify({
      ta: params.targetAllocation.ciphertext,
      ms: params.maxSlippage.ciphertext,
      ep: params.entryPriceThreshold.ciphertext,
      kid: params.keyId,
    });
    return Buffer.from(json, 'utf-8');
  }

  /** Deserialize on-chain bytes back to EncryptedStrategyParams. */
  encryptedParamsFromBuffer(buf: Buffer): EncryptedStrategyParams {
    const obj = JSON.parse(buf.toString('utf-8'));
    return {
      targetAllocation: { ciphertext: obj.ta, keyId: obj.kid, dataType: 'int32' },
      maxSlippage: { ciphertext: obj.ms, keyId: obj.kid, dataType: 'int32' },
      entryPriceThreshold: { ciphertext: obj.ep, keyId: obj.kid, dataType: 'int64' },
      keyId: obj.kid,
    };
  }
}

export const fheService = new FHEService();
