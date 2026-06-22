import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { stellarClient } from '../../integrations/stellar/client';
import {
  getRWAOptimizerService,
  RWAType,
  RWAAsset,
} from '../../services/rwa-optimizer.service';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('rwa-routes');
const router = Router();

function svc() {
  return getRWAOptimizerService(stellarClient);
}

function validate<S extends z.ZodSchema>(schema: S, data: unknown, res: Response): z.infer<S> | null {
  const r = schema.safeParse(data);
  if (!r.success) {
    res.status(400).json({ success: false, error: r.error.flatten() });
    return null;
  }
  return r.data;
}

/**
 * GET /api/rwa/assets
 * List all registered RWA assets, optionally filtered by type.
 */
router.get('/assets', (req: Request, res: Response) => {
  const type = req.query.type as RWAType | undefined;
  const assets = svc().listAssets(type);
  res.json({ success: true, data: assets });
});

/**
 * GET /api/rwa/assets/:assetId
 * Get a single RWA asset by ID.
 */
router.get('/assets/:assetId', (req: Request, res: Response) => {
  const asset = svc().getAsset(req.params.assetId);
  if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });
  res.json({ success: true, data: asset });
});

/**
 * POST /api/rwa/assets
 * Register a new RWA asset (admin-only in production; open in dev for testing).
 */
router.post('/assets', (req: Request, res: Response) => {
  const body = validate(
    z.object({
      assetId: z.string().min(1),
      type: z.nativeEnum(RWAType),
      issuer: z.string().min(1),
      faceValue: z.coerce.bigint().positive(),
      currentValue: z.coerce.bigint().positive(),
      maturityDate: z.number().nullable().default(null),
      yieldBps: z.number().int().nonnegative(),
      currency: z.string().min(1),
      region: z.string().min(1),
      isVerified: z.boolean().default(false),
      dataFeedUri: z.string().url().nullable().default(null),
      metadata: z.record(z.unknown()).default({}),
    }),
    req.body,
    res,
  );
  if (!body) return;
  svc().registerAsset(body as RWAAsset);
  log.info({ assetId: body.assetId, type: body.type }, 'RWA asset registered');
  res.status(201).json({ success: true, data: { assetId: body.assetId } });
});

/**
 * GET /api/rwa/routes
 * List active remittance corridors, optionally filtered by source currency.
 */
router.get('/routes', (req: Request, res: Response) => {
  const sourceCurrency = req.query.sourceCurrency as string | undefined;
  const routes = svc().listRemittanceRoutes(sourceCurrency);
  res.json({ success: true, data: routes });
});

/**
 * GET /api/rwa/routes/:corridorId
 * Get a specific remittance corridor.
 */
router.get('/routes/:corridorId', (req: Request, res: Response) => {
  const route = svc().getRemittanceRoute(req.params.corridorId);
  if (!route) return res.status(404).json({ success: false, error: 'Corridor not found' });
  res.json({ success: true, data: route });
});

/**
 * POST /api/rwa/optimize
 * Run portfolio optimisation for RWA allocation.
 *
 * Body:
 *   totalAUM:            string (bigint, USDC stroops)
 *   maxRWAExposureBps:   number
 *   existingAllocations: Record<assetId, bps>   (optional)
 */
router.post('/optimize', (_req: Request, res: Response, next: NextFunction) => {
  const body = validate(
    z.object({
      totalAUM: z.coerce.bigint().positive(),
      maxRWAExposureBps: z.number().int().min(0).max(10000),
      existingAllocations: z.record(z.number().int().nonnegative()).default({}),
    }),
    _req.body,
    res,
  );
  if (!body) return;

  try {
    const existingMap = new Map<string, number>(Object.entries(body.existingAllocations));
    const recommendations = svc().optimizeAllocation(
      body.totalAUM,
      body.maxRWAExposureBps,
      existingMap,
    );
    res.json({ success: true, data: recommendations });
  } catch (err) {
    next(err);
  }
});

export default router;
