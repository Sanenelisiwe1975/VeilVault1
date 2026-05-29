import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { dwalletService } from '../../services/dwallet.service';
import { strategyService } from '../../services/strategy.service';
import { getAgentRegistryService } from '../../services/agent-registry.service';
import { getStellarClient } from '../../integrations/stellar/client';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('agent-routes');
const router = Router();

const CreateDWalletBody = z.object({
  label: z.string().min(1),
  stellarAddress: z.string().min(56),
});

const SignBody = z.object({
  dwalletId: z.string().min(1),
  message: z.string().min(1),
});

/** POST /api/agents/dwallet - Create a new Ika dWallet */
router.post('/dwallet', async (req: Request, res: Response) => {
  const parsed = CreateDWalletBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }
  try {
    const info = await dwalletService.createAndRegister(parsed.data);
    res.json({ success: true, data: info });
  } catch (err) {
    log.error({ err }, 'Failed to create dWallet');
    res.status(500).json({ success: false, error: String(err) });
  }
});

/** GET /api/agents/dwallet - List all dWallets */
router.get('/dwallet', async (_req: Request, res: Response) => {
  try {
    const wallets = await dwalletService.listDWallets();
    res.json({ success: true, data: wallets });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/** GET /api/agents/dwallet/:id */
router.get('/dwallet/:id', async (req: Request, res: Response) => {
  try {
    const info = await dwalletService.getDWallet(req.params.id);
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(404).json({ success: false, error: 'dWallet not found' });
  }
});

/** POST /api/agents/dwallet/sign */
router.post('/dwallet/sign', async (req: Request, res: Response) => {
  const parsed = SignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }
  try {
    const result = await dwalletService.sign(parsed.data.dwalletId, parsed.data.message);
    res.json({ success: true, data: result });
  } catch (err) {
    log.error({ err }, 'dWallet sign failed');
    res.status(500).json({ success: false, error: String(err) });
  }
});

/** DELETE /api/agents/dwallet/:id */
router.delete('/dwallet/:id', async (req: Request, res: Response) => {
  try {
    await dwalletService.revoke(req.params.id);
    res.json({ success: true, data: { revoked: true } });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Execute Strategy ─────────────────────────────────────────────────────────

const ExecuteStrategyBody = z.object({
  strategyId:     z.string().min(1),
  vaultAddress:   z.string().min(56).optional(),
  agentAddress:   z.string().min(56),
  agentSecretKey: z.string().min(56),
  amount:         z.string().regex(/^\d+$/),
  options: z.object({
    encryptParams:  z.boolean().optional(),
    strategyParams: z.record(z.unknown()).optional(),
  }).optional(),
});

/**
 * POST /api/agent/execute-strategy
 *
 * Execute a yield strategy on behalf of an AI agent.
 * Validates agent is registered, runs the strategy, and returns execution result.
 */
router.post('/execute-strategy', async (req: Request, res: Response) => {
  const parsed = ExecuteStrategyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const d = parsed.data;
  try {
    // 1. Verify the agent is registered in the KYA registry
    const registry = getAgentRegistryService(getStellarClient());
    const profile  = await registry.getProfile(d.agentAddress).catch(() => null);
    if (!profile) {
      res.status(403).json({ success: false, error: 'Agent not registered. Call POST /api/registry/register first.' });
      return;
    }
    if (profile.banned) {
      res.status(403).json({ success: false, error: 'Agent is banned.' });
      return;
    }

    // 2. Execute the strategy
    const result = await strategyService.executeStrategy({
      strategyId:     d.strategyId,
      vaultContractId: d.vaultAddress ?? '',
      amount:         BigInt(d.amount),
      agentAddress:   d.agentAddress,
      agentSecretKey: d.agentSecretKey,
      encryptedParams: undefined,
      useDWallet:     false,
    });

    log.info({ strategyId: d.strategyId, agent: d.agentAddress }, 'Strategy executed by agent');

    res.json({
      success: true,
      data: {
        txHash:          result.txHash,
        positionId:      result.positionId.toString(),
        strategyId:      d.strategyId,
        agentAddress:    d.agentAddress,
        amount:          d.amount,
        executedAt:      Math.floor(Date.now() / 1000),
        estimatedReturn: result.estimatedReturn.toString(),
        status:          'open',
      },
    });
  } catch (err) {
    log.error({ err, strategyId: d.strategyId }, 'Strategy execution failed');
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
