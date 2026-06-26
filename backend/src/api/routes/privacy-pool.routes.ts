import { Router, Request, Response, NextFunction } from 'express';
import { Keypair } from '@stellar/stellar-sdk';
import { z } from 'zod';
import {
  PrivacyPoolService,
  computeCommitment,
  computeNullifierHash,
} from '../../services/privacy-pool.service';
import { getMerkleService } from '../../services/merkle.service';
import { getStellarClient } from '../../integrations/stellar/client';
import { getZkAttestationService } from '../../services/zk-attestation.service';
import { config } from '../../config';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('privacy-pool-routes');
const router = Router();
const svc = new PrivacyPoolService();

// ── Helpers ───────────────────────────────────────────────────────────────────

function validate<S extends z.ZodSchema>(schema: S, data: unknown, res: Response): z.infer<S> | null {
  const r = schema.safeParse(data);
  if (!r.success) {
    res.status(400).json({ success: false, error: r.error.flatten() });
    return null;
  }
  return r.data;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/privacy-pool/state
 * Returns pool config and stats.
 */
router.get('/state', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await svc.getState();
    res.json({ success: true, data: state });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/privacy-pool/tree
 * Returns the current Merkle tree state (next_index, depth, current_root).
 */
router.get('/tree', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tree = await svc.getTreeState();
    res.json({ success: true, data: tree });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/privacy-pool/root
 * Returns the current Merkle root as hex.
 */
router.get('/root', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const root = await svc.getCurrentRoot();
    res.json({ success: true, data: { root } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/privacy-pool/nullifier/:hash
 * Returns whether a nullifier has been spent.
 */
router.get('/nullifier/:hash', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { hash } = req.params;
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
      return res.status(400).json({ success: false, error: 'invalid nullifier hash (must be 64-char hex)' });
    }
    const spent = await svc.isNullifierSpent(hash);
    res.json({ success: true, data: { nullifierHash: hash, spent } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/privacy-pool/root/:hash/known
 * Returns whether a given root is in the recent history window.
 */
router.get('/root/:hash/known', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { hash } = req.params;
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
      return res.status(400).json({ success: false, error: 'invalid root (must be 64-char hex)' });
    }
    const known = await svc.isKnownRoot(hash);
    res.json({ success: true, data: { root: hash, known } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/privacy-pool/merkle-path/compute
 * Compute a Merkle path from caller-supplied leaf values (no contract fetch).
 * Use when the deployed contract pre-dates get_leaves support.
 *
 * Body:
 *   leaves:      string[]  — all committed leaf values as 64-char hex, index 0 first
 *   targetIndex: number    — which leaf to generate the path for
 */
router.post('/merkle-path/compute', async (req: Request, res: Response, next: NextFunction) => {
  const body = validate(
    z.object({
      leaves:      z.array(z.string().regex(/^[0-9a-fA-F]{64}$/)).min(1),
      targetIndex: z.number().int().min(0),
    }),
    req.body,
    res,
  );
  if (!body) return;
  try {
    const { computeMerklePathFromLeaves } = await import('../../services/merkle.service');
    const path = computeMerklePathFromLeaves(
      body.leaves.map(h => Buffer.from(h, 'hex')),
      body.targetIndex,
    );
    res.json({ success: true, data: path });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/privacy-pool/merkle-path/:leafIndex
 * Returns the 20-level MiMC-5 Merkle sibling path for a deposited leaf.
 * Clients use this to generate a withdrawal proof with the Rust prover.
 *
 * Response:
 *   pathElements: string[20]  — 20 × 64-char hex sibling hashes, leaf→root
 *   pathIndices:  boolean[20] — true = current node is right child at that level
 *   root:         string      — 64-char hex of the computed root
 */
router.get('/merkle-path/:leafIndex', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leafIndex = parseInt(req.params.leafIndex, 10);
    if (!Number.isInteger(leafIndex) || leafIndex < 0) {
      return res.status(400).json({ success: false, error: 'leafIndex must be a non-negative integer' });
    }
    const path = await getMerkleService().getMerklePath(leafIndex);
    res.json({ success: true, data: path });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/privacy-pool/commitment
 * Utility: compute a commitment from secret+nullifier without revealing them
 * to the network (this is a local computation helper).
 *
 * Body: { secret: "<32-byte hex>", nullifier: "<32-byte hex>" }
 * Returns: { commitment: "<32-byte hex>" }
 */
router.post('/commitment', (req: Request, res: Response) => {
  const body = validate(
    z.object({
      secret: z.string().regex(/^[0-9a-fA-F]{64}$/, 'secret must be 64-char hex'),
      nullifier: z.string().regex(/^[0-9a-fA-F]{64}$/, 'nullifier must be 64-char hex'),
    }),
    req.body,
    res,
  );
  if (!body) return;

  const commitment = computeCommitment(
    Buffer.from(body.secret, 'hex'),
    Buffer.from(body.nullifier, 'hex'),
  );
  const nullifierHash = computeNullifierHash(Buffer.from(body.nullifier, 'hex'));
  res.json({
    success: true,
    data: {
      commitment: commitment.toString('hex'),
      nullifierHash: nullifierHash.toString('hex'),
    },
  });
});

/**
 * POST /api/privacy-pool/deposit
 * Deposit one denomination unit into the pool.
 *
 * Body: { depositorSecret: string, commitment: "<32-byte hex>" }
 */
router.post('/deposit', async (req: Request, res: Response, next: NextFunction) => {
  const body = validate(
    z.object({
      depositorSecret: z.string().min(56),
      commitment: z.string().regex(/^[0-9a-fA-F]{64}$/, 'commitment must be 64-char hex'),
    }),
    req.body,
    res,
  );
  if (!body) return;

  try {
    const result = await svc.deposit(body.depositorSecret, body.commitment);
    log.info({ leafIndex: result.leafIndex, txHash: result.txHash }, 'deposit completed');
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/privacy-pool/attest-withdrawal
 * Submits a withdrawal proof (generated client-side — secret/nullifier never
 * sent here) to the zk-attestation contract and returns the attestationId
 * /withdraw needs. Signed/paid for by the backend's own admin key, which is
 * safe: a valid proof reveals nothing about who deposited or is withdrawing,
 * so relaying it carries none of the risk that relaying secret+nullifier
 * would. Field names match prover-wasm's prove() output (circuit_id,
 * proof.{a,b,c}, public_inputs) so the browser can pass that JSON through
 * with no reshaping.
 *
 * Body:
 *   circuit_id:    string (hex)
 *   proof:         { a: string (hex), b: string (hex), c: string (hex) }
 *   public_inputs: string[5] (hex) — [root, nullifierHash, recipient, denomination, protocolVersion]
 */
router.post('/attest-withdrawal', async (req: Request, res: Response, next: NextFunction) => {
  const body = validate(
    z.object({
      circuit_id: z.string().regex(/^[0-9a-fA-F]{64}$/),
      proof: z.object({
        a: z.string().regex(/^[0-9a-fA-F]{192}$/),
        b: z.string().regex(/^[0-9a-fA-F]{384}$/),
        c: z.string().regex(/^[0-9a-fA-F]{192}$/),
      }),
      public_inputs: z.array(z.string().regex(/^[0-9a-fA-F]{64}$/)).length(5),
    }),
    req.body,
    res,
  );
  if (!body) return;

  if (!config.PRIVACY_POOL_CONTRACT_ID) {
    return next(new Error('PRIVACY_POOL_CONTRACT_ID not configured'));
  }

  try {
    const adminPublicKey = Keypair.fromSecret(config.ADMIN_SECRET_KEY).publicKey();
    const attestationId = await getZkAttestationService(getStellarClient()).attestPerformance({
      circuitId: body.circuit_id,
      vault: config.PRIVACY_POOL_CONTRACT_ID,
      prover: adminPublicKey,
      strategyCommitment: Buffer.from(body.public_inputs[1], 'hex'), // nullifierHash
      periodStart: 0,
      periodEnd: 1,
      returnBps: 0,
      proof: {
        a: Buffer.from(body.proof.a, 'hex'),
        b: Buffer.from(body.proof.b, 'hex'),
        c: Buffer.from(body.proof.c, 'hex'),
      },
      publicInputs: body.public_inputs.map((pi) => Buffer.from(pi, 'hex')),
      proverSecret: config.ADMIN_SECRET_KEY,
    });
    log.info({ attestationId }, 'withdrawal proof attested');
    res.json({ success: true, data: { attestationId } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/privacy-pool/withdraw
 * Withdraw one denomination unit using a pre-verified Groth16 proof.
 *
 * Body:
 *   recipientSecret:  string        — recipient signs the tx
 *   root:             string (hex)  — recent Merkle root committed in the proof
 *   nullifierHash:    string (hex)  — SHA-256(nullifier), prevents double-spend
 *   attestationId:    string (hex)  — from zk-attestation.attest_performance
 */
router.post('/withdraw', async (req: Request, res: Response, next: NextFunction) => {
  const body = validate(
    z.object({
      recipientSecret: z.string().min(56),
      root: z.string().regex(/^[0-9a-fA-F]{64}$/),
      nullifierHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
      attestationId: z.string().regex(/^[0-9a-fA-F]{64}$/),
    }),
    req.body,
    res,
  );
  if (!body) return;

  try {
    const result = await svc.withdraw(
      body.recipientSecret,
      body.root,
      body.nullifierHash,
      body.attestationId,
    );
    log.info({ txHash: result.txHash, recipient: result.recipient }, 'withdrawal completed');
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
