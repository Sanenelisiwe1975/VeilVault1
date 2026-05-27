import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getStellarClient } from '../../integrations/stellar/client';
import { getZkAttestationService } from '../../services/zk-attestation.service';

const router = Router();

const ProofSchema = z.object({
  a: z.string().length(192),  // hex-encoded 96 bytes
  b: z.string().length(384),  // hex-encoded 192 bytes
  c: z.string().length(192),  // hex-encoded 96 bytes
});

const VerifySchema = z.object({
  circuitId: z.string().length(64),
  proof: ProofSchema,
  publicInputs: z.array(z.string().length(64)).min(1),  // hex Fr scalars
});

const AttestSchema = z.object({
  circuitId: z.string().length(64),
  vault: z.string().min(56).max(56),
  prover: z.string().min(56).max(56),
  strategyCommitment: z.string().length(64),
  periodStart: z.number().int().positive(),
  periodEnd: z.number().int().positive(),
  returnBps: z.number().int().min(-10000).max(100000),
  proof: ProofSchema,
  publicInputs: z.array(z.string().length(64)).length(5),
  proverSecret: z.string().min(56),
});

const RegisterCircuitSchema = z.object({
  circuitId: z.string().length(64),
  circuitName: z.string().min(1).max(64),
  alphaG1Neg: z.string().length(192),
  betaG2: z.string().length(384),
  gammaG2: z.string().length(384),
  deltaG2: z.string().length(384),
  ic: z.array(z.string().length(192)).min(2),
  adminSecret: z.string().min(56),
});

function getService() {
  return getZkAttestationService(getStellarClient());
}

function parseProof(p: { a: string; b: string; c: string }) {
  return {
    a: Buffer.from(p.a, 'hex'),
    b: Buffer.from(p.b, 'hex'),
    c: Buffer.from(p.c, 'hex'),
  };
}

// GET /api/attestations/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const att = await getService().getAttestation(req.params.id);
    if (!att) return res.status(404).json({ error: 'Attestation not found' });
    res.json(att);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/attestations/:id/valid
router.get('/:id/valid', async (req: Request, res: Response) => {
  try {
    const valid = await getService().isValid(req.params.id);
    res.json({ valid });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/attestations/count
router.get('/count', async (_req: Request, res: Response) => {
  try {
    const count = await getService().getAttestationCount();
    res.json({ count: count.toString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/attestations/verify
router.post('/verify', async (req: Request, res: Response) => {
  const parsed = VerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const { circuitId, proof, publicInputs } = parsed.data;
    const valid = await getService().verifyProof({
      circuitId,
      proof: parseProof(proof),
      publicInputs: publicInputs.map(pi => Buffer.from(pi, 'hex')),
    });
    res.json({ valid });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/attestations/attest
router.post('/attest', async (req: Request, res: Response) => {
  const parsed = AttestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const d = parsed.data;
    const attestationId = await getService().attestPerformance({
      circuitId: d.circuitId,
      vault: d.vault,
      prover: d.prover,
      strategyCommitment: Buffer.from(d.strategyCommitment, 'hex'),
      periodStart: d.periodStart,
      periodEnd: d.periodEnd,
      returnBps: d.returnBps,
      proof: parseProof(d.proof),
      publicInputs: d.publicInputs.map(pi => Buffer.from(pi, 'hex')),
      proverSecret: d.proverSecret,
    });
    res.status(201).json({ attestationId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/attestations/register-circuit
router.post('/register-circuit', async (req: Request, res: Response) => {
  const parsed = RegisterCircuitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const d = parsed.data;
    await getService().registerCircuit({
      circuitId: d.circuitId,
      circuitName: d.circuitName,
      vk: {
        alphaG1Neg: Buffer.from(d.alphaG1Neg, 'hex'),
        betaG2: Buffer.from(d.betaG2, 'hex'),
        gammaG2: Buffer.from(d.gammaG2, 'hex'),
        deltaG2: Buffer.from(d.deltaG2, 'hex'),
        ic: d.ic.map(p => Buffer.from(p, 'hex')),
      },
      adminSecret: d.adminSecret,
    });
    res.status(201).json({ message: 'Circuit registered' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
