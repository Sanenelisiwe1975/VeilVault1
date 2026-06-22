import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getStellarClient } from '../../integrations/stellar/client';
import { getAgentRegistryService, ReputationLevel, AdminAction } from '../../services/agent-registry.service';

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

const ProposeAdminActionSchema = z.object({
  proposer: z.string().min(56).max(56),
  action: z.number().int().min(0).max(3), // AdminAction: 0=Ban 1=Unban 2=Slash 3=AcceptVc
  target: z.string().min(56).max(56),
  amount: z.number().int().min(0).max(2000).optional(), // required for Slash
  proposerSecret: z.string().min(56),
});

const ApproveAdminActionSchema = z.object({
  approver: z.string().min(56).max(56),
  proposalId: z.coerce.bigint(),
  approverSecret: z.string().min(56),
});

const ExecuteAdminActionSchema = z.object({
  executor: z.string().min(56).max(56),
  proposalId: z.coerce.bigint(),
  executorSecret: z.string().min(56),
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
    res.json({ message: 'VC update submitted, awaiting admin multisig acceptance' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Admin proposals (M-of-N multisig) — ban / unban / slash / accept-vc
//
// A single admin key can no longer ban, slash, unban, or accept a VC update
// directly. These actions require `admin_threshold` distinct admin
// approvals via propose -> approve -> execute (contracts/agent-registry).

// POST /api/registry/admin/propose
router.post('/admin/propose', async (req: Request, res: Response) => {
  const parsed = ProposeAdminActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.action === AdminAction.Slash && !parsed.data.amount) {
    return res.status(400).json({ error: 'amount is required for Slash proposals' });
  }
  try {
    const proposalId = await getService().proposeAdminAction(parsed.data);
    res.status(201).json({ proposalId: proposalId.toString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/registry/admin/approve
router.post('/admin/approve', async (req: Request, res: Response) => {
  const parsed = ApproveAdminActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const status = await getService().approveAdminAction(parsed.data);
    res.json({ status });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/registry/admin/execute
router.post('/admin/execute', async (req: Request, res: Response) => {
  const parsed = ExecuteAdminActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().executeAdminAction(parsed.data);
    res.json({ message: 'Admin action executed' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/registry/admin/proposal/:id
router.get('/admin/proposal/:id', async (req: Request, res: Response) => {
  try {
    const proposal = await getService().getAdminProposal(BigInt(req.params.id));
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    res.json({
      ...proposal,
      id: proposal.id.toString(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/registry/admin/config
router.get('/admin/config', async (_req: Request, res: Response) => {
  try {
    const [admins, threshold] = await Promise.all([
      getService().getAdmins(),
      getService().getAdminThreshold(),
    ]);
    res.json({ admins, threshold });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
