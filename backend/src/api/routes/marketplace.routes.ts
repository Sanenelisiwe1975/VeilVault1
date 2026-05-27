import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getStellarClient } from '../../integrations/stellar/client';
import {
  getStrategyMarketplaceService,
  StrategyCategory,
} from '../../services/strategy-marketplace.service';

const router = Router();

const PublishSchema = z.object({
  author: z.string().min(56).max(56),
  name: z.string().min(1).max(64),
  description: z.string().max(512),
  executionFee: z.string().regex(/^\d+$/),
  feeAsset: z.string().min(56).max(56),
  category: z.nativeEnum(StrategyCategory),
  minAgentLevel: z.number().int().min(0).max(3),
  authorSecret: z.string().min(56),
});

const ExecuteSchema = z.object({
  strategyId: z.string().length(64),
  executor: z.string().min(56).max(56),
  vaultAddress: z.string().min(56).max(56),
  amount: z.string().regex(/^\d+$/),
  executionParams: z.string(),  // hex-encoded bytes
  executorSecret: z.string().min(56),
});

const AuditSchema = z.object({
  strategyId: z.string().length(64),
  auditReportHash: z.string().length(64),
  auditorSecret: z.string().min(56),
});

const DeactivateSchema = z.object({
  strategyId: z.string().length(64),
  callerSecret: z.string().min(56),
});

const RecordReturnSchema = z.object({
  strategyId: z.string().length(64),
  returnBps: z.number().int().min(-10000).max(100000),
  callerSecret: z.string().min(56),
});

function getService() {
  return getStrategyMarketplaceService(getStellarClient());
}

// GET /api/marketplace/:strategyId
router.get('/:strategyId', async (req: Request, res: Response) => {
  try {
    const listing = await getService().getListing(req.params.strategyId);
    if (!listing) return res.status(404).json({ error: 'Strategy not found' });
    res.json(listing);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/marketplace/publish
router.post('/publish', async (req: Request, res: Response) => {
  const parsed = PublishSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const data = parsed.data;
    const strategyId = await getService().publishStrategy({
      ...data,
      executionFee: BigInt(data.executionFee),
    });
    res.status(201).json({ strategyId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/marketplace/execute
router.post('/execute', async (req: Request, res: Response) => {
  const parsed = ExecuteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const data = parsed.data;
    await getService().executeStrategy({
      strategyId: data.strategyId,
      executor: data.executor,
      vaultAddress: data.vaultAddress,
      amount: BigInt(data.amount),
      executionParams: Buffer.from(data.executionParams, 'hex'),
      executorSecret: data.executorSecret,
    });
    res.json({ message: 'Strategy executed' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/marketplace/audit
router.post('/audit', async (req: Request, res: Response) => {
  const parsed = AuditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().auditStrategy(parsed.data);
    res.json({ message: 'Strategy audited' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/marketplace/deactivate
router.post('/deactivate', async (req: Request, res: Response) => {
  const parsed = DeactivateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().deactivateStrategy(parsed.data);
    res.json({ message: 'Strategy deactivated' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/marketplace/record-return
router.post('/record-return', async (req: Request, res: Response) => {
  const parsed = RecordReturnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await getService().recordReturn(parsed.data);
    res.json({ message: 'Return recorded' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
