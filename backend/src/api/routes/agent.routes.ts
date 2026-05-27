import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { dwalletService } from '../../services/dwallet.service';
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

export default router;
