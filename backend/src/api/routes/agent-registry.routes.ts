import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getStellarClient } from '../../integrations/stellar/client';
import { getAgentRegistryService, ReputationLevel } from '../../services/agent-registry.service';

const router = Router();

const RegisterSchema = z.object({
  agent: z.string().min(56).max(56),
  did: z.string().startsWith('did:'),
  vcHash: z.string().length(64),
  vcUri: z.string().url(),
  signerSecret: z.string().min(56),
});

const VcUpdateSchema = z.object({
  agent: z.string().min(56).max(56),
  vcHash: z.string().length(64),
  vcUri: z.string().url(),
  signerSecret: z.string().min(56),
});

const AcceptVcSchema = z.object({
  agent: z.string().min(56).max(56),
  adminSecret: z.string().min(56),
});

const BanSchema = z.object({
  agent: z.string().min(56).max(56),
  adminSecret: z.string().min(56),
});

const SlashSchema = z.object({
  agent: z.string().min(56).max(56),
  amount: z.number().int().min(1).max(2000),
  adminSecret: z.string().min(56),
});

function getService() {
  return getAgentRegistryService(getStellarClient());
}

// GET /api/registry/:address
router.get('/:address', async (req: Request, res: Response) => {
  try {
    const profile = await getService().getProfile(req.params.address);
    if (!profile) return res.status(404).json({ error: 'Agent not found' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/registry/:address/level?min=1
router.get('/:address/level', async (req: Request, res: Response) => {
  try {
    const minLevel = Number(req.query.min ?? 0) as ReputationLevel;
    const meets = await getService().meetsMinimumLevel(req.params.address, minLevel);
    res.json({ meets, minLevel });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/registry/register
router.post('/register', async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().registerAgent(parsed.data);
    res.status(201).json({ message: 'Agent registered' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/registry/vc-update
router.post('/vc-update', async (req: Request, res: Response) => {
  const parsed = VcUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().submitVcUpdate(parsed.data);
    res.json({ message: 'VC update submitted, awaiting admin acceptance' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/registry/accept-vc
router.post('/accept-vc', async (req: Request, res: Response) => {
  const parsed = AcceptVcSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().acceptVc(parsed.data);
    res.json({ message: 'VC accepted' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/registry/ban
router.post('/ban', async (req: Request, res: Response) => {
  const parsed = BanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().banAgent(parsed.data);
    res.json({ message: 'Agent banned' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/registry/unban
router.post('/unban', async (req: Request, res: Response) => {
  const parsed = BanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().unbanAgent({ agent: parsed.data.agent, adminSecret: parsed.data.adminSecret });
    res.json({ message: 'Agent unbanned' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/registry/slash
router.post('/slash', async (req: Request, res: Response) => {
  const parsed = SlashSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().slashAgent(parsed.data);
    res.json({ message: `Agent slashed by ${parsed.data.amount} bps` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
