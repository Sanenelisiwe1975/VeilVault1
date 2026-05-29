import { createHash } from 'crypto';
import {
  Account,
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('merkle');

// ─── BLS12-381 Fr field ───────────────────────────────────────────────────────

const FR_MOD = BigInt('0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001');
const ROUNDS = 110;
const DEPTH  = 20;

function toFr(bytes: Buffer): bigint {
  const b = Buffer.from(bytes);
  b[0] = 0;
  let v = 0n;
  for (let i = 0; i < 32; i++) v = (v << 8n) | BigInt(b[i]);
  return v % FR_MOD;
}

function frToBytes(fr: bigint): Buffer {
  const buf = Buffer.alloc(32);
  let v = fr;
  for (let i = 31; i >= 0; i--) { buf[i] = Number(v & 0xffn); v >>= 8n; }
  return buf;
}

function frAdd(a: bigint, b: bigint): bigint { return (a + b) % FR_MOD; }
function frMul(a: bigint, b: bigint): bigint { return (a * b) % FR_MOD; }

// ─── MiMC-5 round constants (same derivation as Rust prover + Soroban contract) ─

function computeRoundConstants(): bigint[] {
  let buf = createHash('sha256').update('veilpool_mimc5_bls12381_rc_v1').digest();
  buf[0] = 0;
  const out: bigint[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    let v = 0n;
    for (let j = 0; j < 32; j++) v = (v << 8n) | BigInt(buf[j]);
    out.push(v % FR_MOD);
    buf = createHash('sha256').update(buf).digest();
    buf[0] = 0;
  }
  return out;
}

const ROUND_CONSTANTS = computeRoundConstants();

function bufToFr(bytes: Buffer): bigint {
  let v = 0n;
  for (let i = 0; i < 32; i++) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}

function hashPair(left: Buffer, right: Buffer): Buffer {
  // Inputs are already valid Fr elements (leaves are pre-zeroed by the contract;
  // intermediate values are Fr outputs).  No byte[0] zeroing here.
  let a = bufToFr(left);
  let b = bufToFr(right);
  for (const c of ROUND_CONSTANTS) {
    const t  = frAdd(b, c);
    const t2 = frMul(t, t);
    const t4 = frMul(t2, t2);
    const t5 = frMul(t4, t);
    const nb = frAdd(a, t5);
    a = b;
    b = nb;
  }
  return frToBytes(frAdd(a, b));
}

// ─── Pre-computed zero subtree hashes ────────────────────────────────────────

function computeZeroNodes(): Buffer[] {
  const z: Buffer[] = [Buffer.alloc(32)];
  for (let i = 0; i < DEPTH; i++) z.push(hashPair(z[i], z[i]));
  return z;
}

const ZERO_NODES = computeZeroNodes();

// ─── Off-chain Merkle path ────────────────────────────────────────────────────

export interface MerklePath {
  pathElements: string[];   // 20 × 64-char hex, leaf-to-root order
  pathIndices:  boolean[];  // true = current node is right child at that level
  root:         string;     // 64-char hex of the computed root
}

export function computeMerklePathFromLeaves(allLeaves: Buffer[], targetIndex: number): MerklePath {
  return buildMerklePath(allLeaves, targetIndex);
}

function buildMerklePath(allLeaves: Buffer[], targetIndex: number): MerklePath {
  if (targetIndex >= allLeaves.length) {
    throw new Error(`leaf ${targetIndex} not yet deposited (tree has ${allLeaves.length} leaves)`);
  }

  const memo = new Map<string, Buffer>();

  function subtree(index: number, level: number): Buffer {
    if (level === 0) return allLeaves[index] ?? ZERO_NODES[0];
    const key = `${level}:${index}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const h = hashPair(subtree(index * 2, level - 1), subtree(index * 2 + 1, level - 1));
    memo.set(key, h);
    return h;
  }

  const pathElements: string[] = [];
  const pathIndices:  boolean[] = [];
  let node = targetIndex;

  for (let level = 0; level < DEPTH; level++) {
    const isRight   = node % 2 === 1;
    const sibIdx    = isRight ? node - 1 : node + 1;
    const sibling   = subtree(sibIdx, level);
    pathElements.push(sibling.toString('hex'));
    pathIndices.push(isRight);
    node = Math.floor(node / 2);
  }

  const root = subtree(0, DEPTH).toString('hex');
  return { pathElements, pathIndices, root };
}

// ─── Soroban leaf fetcher ─────────────────────────────────────────────────────

import { Keypair } from '@stellar/stellar-sdk';
const BATCH = 100;

export class MerkleService {
  private readonly server: SorobanRpc.Server;
  private readonly contract: Contract;
  private readonly passphrase: string;

  constructor() {
    this.server      = new SorobanRpc.Server(config.STELLAR_RPC_URL);
    this.contract    = new Contract(config.PRIVACY_POOL_CONTRACT_ID ?? '');
    this.passphrase  = config.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  }

  private async simulate(op: Parameters<Contract['call']>[0], ...args: Parameters<Contract['call']>[1][]) {
    const tx = new TransactionBuilder(
      new Account(Keypair.random().publicKey(), '0'),
      { fee: '100', networkPassphrase: this.passphrase },
    )
      .addOperation(this.contract.call(op, ...args))
      .setTimeout(30)
      .build();
    const result = await this.server.simulateTransaction(tx);
    if (!SorobanRpc.Api.isSimulationSuccess(result)) {
      throw new Error(`simulate ${op} failed`);
    }
    return scValToNative((result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result!.retval);
  }

  async getNextIndex(): Promise<number> {
    const tree = await this.simulate('get_tree_state') as { next_index: unknown };
    return Number(tree.next_index ?? 0);
  }

  async fetchAllLeaves(nextIndex: number): Promise<Buffer[]> {
    const leaves: Buffer[] = [];
    for (let start = 0; start < nextIndex; start += BATCH) {
      const count = Math.min(BATCH, nextIndex - start);
      const batch = await this.simulate(
        'get_leaves',
        nativeToScVal(start, { type: 'u32' }),
        nativeToScVal(count, { type: 'u32' }),
      ) as Uint8Array[];
      for (const raw of batch) {
        leaves.push(Buffer.from(raw));
      }
      log.debug({ start, fetched: batch.length }, 'fetched leaf batch');
    }
    return leaves;
  }

  async getMerklePath(leafIndex: number): Promise<MerklePath> {
    const nextIndex = await this.getNextIndex();
    if (leafIndex >= nextIndex) {
      throw new Error(`leaf ${leafIndex} does not exist (next_index = ${nextIndex})`);
    }
    const leaves = await this.fetchAllLeaves(nextIndex);
    log.info({ nextIndex, leafIndex }, 'computing Merkle path');
    return buildMerklePath(leaves, leafIndex);
  }
}

let instance: MerkleService | null = null;
export function getMerkleService(): MerkleService {
  if (!instance) instance = new MerkleService();
  return instance;
}
