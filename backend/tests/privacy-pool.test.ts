/**
 * Unit tests for privacy-pool commitment and nullifier logic.
 * These mirror the on-chain commitment scheme: SHA-256(secret ‖ nullifier).
 */

import { createHash } from 'crypto';

function computeCommitment(secret: Buffer, nullifier: Buffer): string {
  return createHash('sha256').update(Buffer.concat([secret, nullifier])).digest('hex');
}

function computeNullifierHash(nullifier: Buffer): string {
  return createHash('sha256').update(nullifier).digest('hex');
}

describe('Privacy pool commitment scheme', () => {
  const secret   = Buffer.from('0'.repeat(64), 'hex');   // 32-byte zero secret
  const nullifier = Buffer.from('1'.repeat(64), 'hex');  // 32-byte ones nullifier

  it('produces a 32-byte (64 hex char) commitment', () => {
    const commitment = computeCommitment(secret, nullifier);
    expect(commitment).toHaveLength(64);
  });

  it('commitment is deterministic for same inputs', () => {
    const c1 = computeCommitment(secret, nullifier);
    const c2 = computeCommitment(secret, nullifier);
    expect(c1).toBe(c2);
  });

  it('different secrets produce different commitments', () => {
    const secret2 = Buffer.from('a'.repeat(64), 'hex');
    expect(computeCommitment(secret, nullifier)).not.toBe(computeCommitment(secret2, nullifier));
  });

  it('different nullifiers produce different commitments', () => {
    const nullifier2 = Buffer.from('2'.repeat(64), 'hex');
    expect(computeCommitment(secret, nullifier)).not.toBe(computeCommitment(secret, nullifier2));
  });

  it('nullifier hash is deterministic', () => {
    expect(computeNullifierHash(nullifier)).toBe(computeNullifierHash(nullifier));
  });

  it('commitment and nullifier hash are different values', () => {
    // They hash different inputs so should almost certainly differ
    expect(computeCommitment(secret, nullifier)).not.toBe(computeNullifierHash(nullifier));
  });
});

describe('Merkle tree leaf count', () => {
  const TREE_DEPTH = 20;
  const MAX_LEAVES = 2 ** TREE_DEPTH;

  it('depth-20 tree holds 1,048,576 notes', () => {
    expect(MAX_LEAVES).toBe(1_048_576);
  });

  it('leaf index fits in a u32', () => {
    expect(MAX_LEAVES - 1).toBeLessThan(2 ** 32);
  });
});
