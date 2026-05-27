import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { strategyService } from '../../services/strategy.service';
import { vaultFHEService } from '../../services/fhe.service';
import { StrategyType } from '../../types';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('strategy-routes');
const router = Router();

const ExecuteStrategyBody = z.object({
  strategyId: z.string().min(1),
  vaultContractId: z.string().min(1),
  amount: z.string().transform(BigInt),
  agentAddress: z.string().min(56),
  agentSecretKey: z.string().min(56),
  useDWallet: z.boolean().optional(),
  dwalletId: z.string().optional(),
  encryptParams: z.boolean().optional(),
  strategyParams: z
    .object({
      targetAllocation: z.number(),
      maxSlippage: z.number(),
      entryPriceThreshold: z.string().transform(BigInt),
      keyId: z.string(),
    })
    .optional(),
});

const ClosePositionBody = z.object({
  vaultContractId: z.string().min(1),
  agentAddress: z.string().min(56),
  agentSecretKey: z.string().min(56),
  positionId: z.string().transform(BigInt),
  returnAmount: z.string().transform(BigInt),
});

/** GET /api/strategies - List available strategies */
router.get('/', (_req: Request, res: Response) => {
  const strategies = strategyService.listStrategies();
  res.json({ success: true, data: strategies });
});

/** GET /api/strategies/:id */
router.get('/:id', (req: Request, res: Response) => {
  const strategy = strategyService.getStrategy(req.params.id);
  if (!strategy) {
    res.status(404).json({ success: false, error: 'Strategy not found' });
    return;
  }
  res.json({ success: true, data: strategy });
});

/** POST /api/strategies/execute */
router.post('/execute', async (req: Request, res: Response) => {
  const parsed = ExecuteStrategyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  let encryptedParams: import('../../types').EncryptedStrategyParams | undefined;

  // Encrypt strategy params if requested
  if (data.encryptParams && data.strategyParams) {
    try {
      const result = await vaultFHEService.encryptStrategy({
        targetAllocation: data.strategyParams.targetAllocation,
        maxSlippage: data.strategyParams.maxSlippage,
        entryPriceThreshold: data.strategyParams.entryPriceThreshold,
        keyId: data.strategyParams.keyId,
      });
      encryptedParams = result.encrypted;
    } catch (err) {
      log.error({ err }, 'FHE encryption failed');
      res.status(500).json({ success: false, error: `FHE error: ${String(err)}` });
      return;
    }
  }

  try {
    const result = await strategyService.executeStrategy({
      strategyId: data.strategyId,
      vaultContractId: data.vaultContractId,
      amount: data.amount,
      agentAddress: data.agentAddress,
      agentSecretKey: data.agentSecretKey,
      useDWallet: data.useDWallet,
      dwalletId: data.dwalletId,
      encryptedParams,
    });

    res.json({
      success: true,
      data: {
        ...result,
        positionId: result.positionId.toString(),
        amount: result.amount.toString(),
        estimatedReturn: result.estimatedReturn.toString(),
      },
    });
  } catch (err) {
    log.error({ err }, 'Strategy execution failed');
    res.status(500).json({ success: false, error: String(err) });
  }
});

/** POST /api/strategies/close */
router.post('/close', async (req: Request, res: Response) => {
  const parsed = ClosePositionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }
  try {
    const result = await strategyService.closeStrategy({
      vaultContractId: parsed.data.vaultContractId,
      agentAddress: parsed.data.agentAddress,
      agentSecretKey: parsed.data.agentSecretKey,
      positionId: parsed.data.positionId,
      returnAmount: parsed.data.returnAmount,
    });
    res.json({ success: true, data: { ...result, pnl: result.pnl.toString() } });
  } catch (err) {
    log.error({ err }, 'Close position failed');
    res.status(500).json({ success: false, error: String(err) });
  }
});

/** POST /api/strategies/fhe/keys - Generate FHE keys for an agent */
router.post('/fhe/keys', async (_req: Request, res: Response) => {
  try {
    const keys = await vaultFHEService.generateKeys();
    res.json({ success: true, data: keys });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
