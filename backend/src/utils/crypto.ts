import nacl from 'tweetnacl';
import { createHash } from 'crypto';

/** SHA-256 hash of a string, returned as hex. */
export function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Encode bytes as lowercase hex. */
export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

/** Decode a hex string to Uint8Array. */
export function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex.replace(/^0x/, ''), 'hex'));
}

/** Verify an ed25519 signature. */
export function verifyEd25519(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  try {
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}

/** Sign a message with an ed25519 secret key. */
export function signEd25519(
  message: Uint8Array,
  secretKey: Uint8Array,
): Uint8Array {
  return nacl.sign.detached(message, secretKey);
}

/** Generate a new ed25519 keypair. */
export function generateKeypair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  return nacl.sign.keyPair();
}

/** Generate a secure random nonce (32 bytes). */
export function randomNonce(): string {
  const bytes = nacl.randomBytes(32);
  return toHex(bytes);
}

/** Encode a string to UTF-8 bytes. */
export function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
