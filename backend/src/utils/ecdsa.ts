/**
 * secp256r1 (P-256) ECDSA signature plumbing for relaying WebAuthn
 * assertions into Soroban.
 *
 * Browsers return WebAuthn signatures DER-encoded (ASN.1 SEQUENCE of two
 * INTEGERs, r and s) with no guarantee that s is in low-S form. Soroban's
 * native `secp256r1_verify` host function requires raw 64-byte (r || s) and
 * traps on anything other than a canonical low-S signature — so anything
 * relaying a passkey signature onto a `smart-wallet` contract must decode
 * DER to raw and normalize s before submitting.
 */

const P256_ORDER = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
const P256_ORDER_HALF = P256_ORDER / 2n;

function readDerLength(der: Buffer, offset: number): { length: number; offset: number } {
  let length = der[offset++];
  if (length & 0x80) {
    const numBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < numBytes; i++) length = (length << 8) | der[offset++];
  }
  return { length, offset };
}

function leftPad32(b: Buffer): Buffer {
  if (b.length === 32) return b;
  if (b.length > 32) return Buffer.from(b.subarray(b.length - 32));
  return Buffer.concat([Buffer.alloc(32 - b.length), b]);
}

/** Decode a DER-encoded ECDSA signature (SEQUENCE{INTEGER r, INTEGER s}) to raw 64-byte (r || s). */
export function derToRaw(der: Buffer): Buffer {
  let offset = 0;
  if (der[offset++] !== 0x30) {
    throw new Error('Invalid DER signature: expected SEQUENCE tag (0x30)');
  }
  ({ offset } = readDerLength(der, offset));

  function readInteger(): Buffer {
    if (der[offset++] !== 0x02) {
      throw new Error('Invalid DER signature: expected INTEGER tag (0x02)');
    }
    const lenResult = readDerLength(der, offset);
    offset = lenResult.offset;
    let bytes = der.subarray(offset, offset + lenResult.length);
    offset += lenResult.length;
    // DER INTEGER is signed; a leading 0x00 disambiguates a positive number
    // whose first real byte has its high bit set. Strip it for raw form.
    if (bytes.length > 1 && bytes[0] === 0x00 && (bytes[1] & 0x80) !== 0) {
      bytes = bytes.subarray(1);
    }
    return Buffer.from(bytes);
  }

  const r = readInteger();
  const s = readInteger();
  return Buffer.concat([leftPad32(r), leftPad32(s)]);
}

/** Normalize a raw 64-byte (r || s) signature's s component to low-S form (s <= n/2), as Soroban's secp256r1_verify requires. */
export function normalizeLowS(rawSig: Buffer): Buffer {
  if (rawSig.length !== 64) {
    throw new Error(`Expected 64-byte raw (r || s) signature, got ${rawSig.length}`);
  }
  const r = rawSig.subarray(0, 32);
  let s = BigInt(`0x${rawSig.subarray(32, 64).toString('hex')}`);
  if (s > P256_ORDER_HALF) {
    s = P256_ORDER - s;
  }
  const sBuf = Buffer.from(s.toString(16).padStart(64, '0'), 'hex');
  return Buffer.concat([r, sBuf]);
}

/** DER-decode and low-S normalize in one step — what callers relaying a WebAuthn signature to a smart-wallet contract should use. */
export function derToRawLowS(der: Buffer): Buffer {
  return normalizeLowS(derToRaw(der));
}
