/**
 * FHE simulation stub — returns deterministic mock data.
 * Replace with the Encrypt TFHE-rs SDK for production.
 */

export interface FheKeyPair {
  publicKey:  Uint8Array;
  privateKey: Uint8Array;
  keyId:      string;
}

export function generateFheKeyPair(): FheKeyPair {
  const seed = Math.floor(Math.random() * 0xffffff);
  return {
    publicKey:  new Uint8Array(32).fill(seed & 0xff),
    privateKey: new Uint8Array(64).fill((seed >> 8) & 0xff),
    keyId:      seed.toString(16).padStart(6, "0"),
  };
}

interface StrategyParams {
  allocationBps:       { asset: string; bps: number }[];
  maxDrawdownBps:      number;
  rebalanceTriggerBps: number;
  stopLossBps:         number;
}

export function encryptStrategyParams(
  _params: StrategyParams,
  _keys: FheKeyPair,
): { bytes: Uint8Array; hash: Uint8Array } {
  return {
    bytes: new Uint8Array(512),
    hash:  new Uint8Array(32).fill(0xab),
  };
}

interface PerfSummary {
  totalDepositedSol: number;
  netValueSol:       number;
  yieldEarnedSol:    number;
  snapshotAt:        string;
}

export function encryptPerformanceSummary(
  _summary: PerfSummary,
  _keys: FheKeyPair,
): { bytes: Uint8Array } {
  return { bytes: new Uint8Array(256) };
}

interface StrategyOp {
  action:         string;
  targetProtocol: string;
  amountLamports: bigint;
}

export function buildStrategyOperation(
  _op: StrategyOp,
  _paramsHash: Uint8Array,
  _keys: FheKeyPair,
): { encryptedOp: Uint8Array; opProof: Uint8Array } {
  return {
    encryptedOp: new Uint8Array(128),
    opProof:     new Uint8Array(64),
  };
}
