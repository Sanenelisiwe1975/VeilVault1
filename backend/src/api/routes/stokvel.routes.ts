import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getStellarClient } from '../../integrations/stellar/client';
import { getStokvelService, ProposalType } from '../../services/stokvel.service';

const router = Router();

const InitSchema = z.object({
  admin: z.string().min(56).max(56),
  name: z.string().min(1).max(64),
  asset: z.string().min(56).max(56),
  threshold: z.number().int().min(1),
  maxMembers: z.number().int().min(2),
  contributionAmount: z.string().regex(/^\d+$/),
  contributionIntervalSecs: z.string().regex(/^\d+$/),
  adminSecret: z.string().min(56),
});

const AddMemberSchema = z.object({
  admin: z.string().min(56).max(56),
  member: z.string().min(56).max(56),
  adminSecret: z.string().min(56),
});

const ContributeSchema = z.object({
  member: z.string().min(56).max(56),
  memberSecret: z.string().min(56),
});

const ProposeSchema = z.object({
  proposer: z.string().min(56).max(56),
  recipient: z.string().min(56).max(56),
  amount: z.string().regex(/^\d+$/),
  proposerSecret: z.string().min(56),
});

const VoteSchema = z.object({
  voter: z.string().min(56).max(56),
  proposalId: z.string().regex(/^\d+$/),
  approve: z.boolean(),
  voterSecret: z.string().min(56),
});

const ExecuteProposalSchema = z.object({
  executor: z.string().min(56).max(56),
  proposalId: z.string().regex(/^\d+$/),
  executorSecret: z.string().min(56),
});

const SetYieldVaultSchema = z.object({
  vaultAddress: z.string().min(56).max(56),
  adminSecret: z.string().min(56),
});

function getService() {
  return getStokvelService(getStellarClient());
}

// GET /api/stokvel/config
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const cfg = await getService().getConfig();
    if (!cfg) return res.status(404).json({ error: 'Stokvel not initialized' });
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/stokvel/member/:address
router.get('/member/:address', async (req: Request, res: Response) => {
  try {
    const member = await getService().getMemberInfo(req.params.address);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/stokvel/proposal/:id
router.get('/proposal/:id', async (req: Request, res: Response) => {
  try {
    const proposal = await getService().getProposal(BigInt(req.params.id));
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    res.json(proposal);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/stokvel/init
router.post('/init', async (req: Request, res: Response) => {
  const parsed = InitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const d = parsed.data;
    await getService().initialize({
      ...d,
      contributionAmount: BigInt(d.contributionAmount),
      contributionIntervalSecs: BigInt(d.contributionIntervalSecs),
    });
    res.status(201).json({ message: 'Stokvel initialized' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/stokvel/add-member
router.post('/add-member', async (req: Request, res: Response) => {
  const parsed = AddMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().addMember(parsed.data);
    res.status(201).json({ message: 'Member added' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/stokvel/contribute
router.post('/contribute', async (req: Request, res: Response) => {
  const parsed = ContributeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().contribute(parsed.data);
    res.json({ message: 'Contribution recorded' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/stokvel/propose
router.post('/propose', async (req: Request, res: Response) => {
  const parsed = ProposeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const d = parsed.data;
    const proposalId = await getService().proposeDistribution({
      proposer: d.proposer,
      recipient: d.recipient,
      amount: BigInt(d.amount),
      proposerSecret: d.proposerSecret,
    });
    res.status(201).json({ proposalId: proposalId.toString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/stokvel/vote
router.post('/vote', async (req: Request, res: Response) => {
  const parsed = VoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const d = parsed.data;
    await getService().voteProposal({ ...d, proposalId: BigInt(d.proposalId) });
    res.json({ message: `Vote recorded: ${d.approve ? 'approved' : 'rejected'}` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/stokvel/execute-proposal
router.post('/execute-proposal', async (req: Request, res: Response) => {
  const parsed = ExecuteProposalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const d = parsed.data;
    await getService().executeProposal({ ...d, proposalId: BigInt(d.proposalId) });
    res.json({ message: 'Proposal executed' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/stokvel/set-yield-vault
router.post('/set-yield-vault', async (req: Request, res: Response) => {
  const parsed = SetYieldVaultSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().setYieldVault(parsed.data);
    res.json({ message: 'Yield vault set' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
