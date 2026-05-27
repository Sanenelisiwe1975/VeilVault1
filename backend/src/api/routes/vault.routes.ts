import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getVaultService } from '../../services/vault.service';
import { monitoringService } from '../../services/monitoring.service';
import { createChildLogger } from '../../utils/logger';
import { config } from '../../config';

const log = createChildLogger('vault-routes');
const router = Router();

const DepositBody = z.object({
  fromPublicKey: z.string().min(56),
  amount: z.string().transform(BigInt),
  signerSecretKey: z.string().min(56),
});

const WithdrawBody = z.object({
  fromPublicKey: z.string().min(56),
  shares: z.string().transform(BigInt),
  signerSecretKey: z.string().min(56),
});

const AddAgentBody = z.object({
  agentAddress: z.string().min(56),
});

function withBigInt<T extends object>(obj: T): unknown {
  return JSON.parse(JSON.stringify(obj, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v,
  ));
}

/** GET /api/vault/info */
router.get('/info', async (req: Request, res: Response) => {
  try {
    const vault = getVaultService();
    const [assets, shares, sharePrice] = await Promise.all([
      vault.getTotalAssets(),
      vault.getTotalShares(),
      vault.getSharePrice(),
    ]);
    res.json({
      success: true,
      data: withBigInt({ totalAssets: assets, totalShares: shares, sharePrice }),
      requestId: (req as Request & { id: string }).id,
    });
  } catch (err) {
    log.error({ err }, 'Failed to get vault info');
    res.status(500).json({ success: false, error: String(err), requestId: (req as Request & { id: string }).id });
  }
});

/** GET /api/vault/balance/:address */
router.get('/balance/:address', async (req: Request, res: Response) => {
  try {
    const vault = getVaultService();
    const balance = await vault.getUserBalance(req.params.address);
    res.json({ success: true, data: { balance: balance.toString() }, requestId: (req as Request & { id: string }).id });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err), requestId: (req as Request & { id: string }).id });
  }
});

/** POST /api/vault/deposit */
router.post('/deposit', async (req: Request, res: Response) => {
  const parsed = DepositBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message, requestId: (req as Request & { id: string }).id });
    return;
  }
  try {
    const vault = getVaultService();
    const result = await vault.deposit(
      parsed.data.fromPublicKey,
      parsed.data.amount,
      parsed.data.signerSecretKey,
    );
    res.json({ success: true, data: withBigInt(result), requestId: (req as Request & { id: string }).id });
  } catch (err) {
    log.error({ err }, 'Deposit failed');
    res.status(500).json({ success: false, error: String(err), requestId: (req as Request & { id: string }).id });
  }
});

/** POST /api/vault/withdraw */
router.post('/withdraw', async (req: Request, res: Response) => {
  const parsed = WithdrawBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message, requestId: (req as Request & { id: string }).id });
    return;
  }
  try {
    const vault = getVaultService();
    const result = await vault.withdraw(
      parsed.data.fromPublicKey,
      parsed.data.shares,
      parsed.data.signerSecretKey,
    );
    res.json({ success: true, data: withBigInt(result), requestId: (req as Request & { id: string }).id });
  } catch (err) {
    log.error({ err }, 'Withdrawal failed');
    res.status(500).json({ success: false, error: String(err), requestId: (req as Request & { id: string }).id });
  }
});

/** POST /api/vault/agents (admin) */
router.post('/agents', async (req: Request, res: Response) => {
  const parsed = AddAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message, requestId: (req as Request & { id: string }).id });
    return;
  }
  try {
    const vault = getVaultService();
    const txHash = await vault.addAgent(parsed.data.agentAddress);
    res.json({ success: true, data: { txHash }, requestId: (req as Request & { id: string }).id });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err), requestId: (req as Request & { id: string }).id });
  }
});

/** DELETE /api/vault/agents/:address (admin) */
router.delete('/agents/:address', async (req: Request, res: Response) => {
  try {
    const vault = getVaultService();
    const txHash = await vault.removeAgent(req.params.address);
    res.json({ success: true, data: { txHash }, requestId: (req as Request & { id: string }).id });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err), requestId: (req as Request & { id: string }).id });
  }
});

/** POST /api/vault/emergency-stop (admin) */
router.post('/emergency-stop', async (req: Request, res: Response) => {
  try {
    const vault = getVaultService();
    const txHash = await vault.emergencyStop();
    log.error('Emergency stop triggered via API');
    res.json({ success: true, data: { txHash }, requestId: (req as Request & { id: string }).id });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err), requestId: (req as Request & { id: string }).id });
  }
});

/** GET /api/vault/metrics */
router.get('/metrics', (_req: Request, res: Response) => {
  const snapshots = monitoringService.getSnapshotsForApi();
  res.json({ success: true, data: snapshots });
});

export default router;
