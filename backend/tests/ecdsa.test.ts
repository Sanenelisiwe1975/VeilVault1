import { generateKeyPairSync, createSign, createVerify } from 'crypto';
import { derToRaw, normalizeLowS, derToRawLowS } from '../src/utils/ecdsa';

describe('derToRaw', () => {
  it('decodes a real Node-generated P-256 DER signature to 64 raw bytes', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const message = Buffer.from('hello soroban');

    const der = createSign('SHA256').update(message).sign(privateKey);
    const raw = derToRaw(der);

    expect(raw.length).toBe(64);

    // Re-encode raw (r||s) back to DER manually and verify it still validates
    // against the original message — proves derToRaw preserved r and s exactly.
    const r = raw.subarray(0, 32);
    const s = raw.subarray(32, 64);
    const reDer = encodeDerFromRawForTest(r, s);
    const verified = createVerify('SHA256').update(message).verify(publicKey, reDer);
    expect(verified).toBe(true);
  });

  it('round-trips across many random signatures (covers variable-length DER integers)', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    for (let i = 0; i < 50; i++) {
      const message = Buffer.from(`message-${i}`);
      const der = createSign('SHA256').update(message).sign(privateKey);
      const raw = derToRaw(der);
      expect(raw.length).toBe(64);
      const reDer = encodeDerFromRawForTest(raw.subarray(0, 32), raw.subarray(32, 64));
      expect(createVerify('SHA256').update(message).verify(publicKey, reDer)).toBe(true);
    }
  });
});

describe('normalizeLowS', () => {
  const P256_ORDER = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');

  it('leaves an already-low-S signature unchanged', () => {
    const r = Buffer.alloc(32, 1);
    const lowS = Buffer.alloc(32, 1); // tiny value, definitely <= n/2
    const raw = Buffer.concat([r, lowS]);
    expect(normalizeLowS(raw)).toEqual(raw);
  });

  it('flips a high-S signature to n - s, and the result is verifiably equivalent', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const message = Buffer.from('flip-me');

    // Find a signature whose raw s happens to be high-S (or force it by flipping a low one).
    const der = createSign('SHA256').update(message).sign(privateKey);
    const raw = derToRaw(der);
    const r = raw.subarray(0, 32);
    const sBig = BigInt(`0x${raw.subarray(32, 64).toString('hex')}`);
    const forcedHighS = sBig <= P256_ORDER / 2n ? P256_ORDER - sBig : sBig;
    const forcedRaw = Buffer.concat([r, Buffer.from(forcedHighS.toString(16).padStart(64, '0'), 'hex')]);

    const normalized = normalizeLowS(forcedRaw);
    const normalizedS = BigInt(`0x${normalized.subarray(32, 64).toString('hex')}`);
    expect(normalizedS <= P256_ORDER / 2n).toBe(true);

    // (r, s) and (r, n-s) both verify for the same message under secp256r1 —
    // confirm the normalized signature still validates.
    const reDer = encodeDerFromRawForTest(normalized.subarray(0, 32), normalized.subarray(32, 64));
    expect(createVerify('SHA256').update(message).verify(publicKey, reDer)).toBe(true);
  });

  it('rejects non-64-byte input', () => {
    expect(() => normalizeLowS(Buffer.alloc(63))).toThrow();
  });
});

describe('derToRawLowS', () => {
  it('produces a 64-byte signature with low-S, verifiable end to end', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const message = Buffer.from('end-to-end');
    const der = createSign('SHA256').update(message).sign(privateKey);

    const raw = derToRawLowS(der);
    expect(raw.length).toBe(64);

    const P256_ORDER = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');
    const s = BigInt(`0x${raw.subarray(32, 64).toString('hex')}`);
    expect(s <= P256_ORDER / 2n).toBe(true);

    const reDer = encodeDerFromRawForTest(raw.subarray(0, 32), raw.subarray(32, 64));
    expect(createVerify('SHA256').update(message).verify(publicKey, reDer)).toBe(true);
  });
});

/** Minimal raw(r||s) -> DER encoder, test-only, mirroring what derToRaw must invert. */
function encodeDerFromRawForTest(r: Buffer, s: Buffer): Buffer {
  function encodeInt(b: Buffer): Buffer {
    let trimmed = b;
    while (trimmed.length > 1 && trimmed[0] === 0x00 && (trimmed[1] & 0x80) === 0) {
      trimmed = trimmed.subarray(1);
    }
    if (trimmed[0] & 0x80) {
      trimmed = Buffer.concat([Buffer.from([0x00]), trimmed]);
    }
    return Buffer.concat([Buffer.from([0x02, trimmed.length]), trimmed]);
  }
  const rEnc = encodeInt(r);
  const sEnc = encodeInt(s);
  const body = Buffer.concat([rEnc, sEnc]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}
