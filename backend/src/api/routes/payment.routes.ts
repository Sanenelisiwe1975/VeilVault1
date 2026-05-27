import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { x402Service } from '../../services/x402.service';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('payment-routes');
const router = Router();

const VerifyPaymentBody = z.object({
  txHash: z.string().min(64).max(64),
  expectedTo: z.string().min(56),
  expectedAmount: z.string().transform(BigInt),
  expectedAsset: z.string().min(1),
  expectedMemo: z.string(),
});

const CheckStatusBody = z.object({
  paymentId: z.string().min(1),
});

/**
 * POST /api/payments/verify
 * Agent submits a Stellar tx hash after making a payment.
 * Backend verifies on Horizon and attests on-chain.
 */
router.post('/verify', async (req: Request, res: Response) => {
  const parsed = VerifyPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }
  try {
    const proof = await x402Service.processPaymentProof({
      txHash: parsed.data.txHash,
      expectedTo: parsed.data.expectedTo,
      expectedAmount: parsed.data.expectedAmount,
      expectedAsset: parsed.data.expectedAsset,
      expectedMemo: parsed.data.expectedMemo,
    });
    res.json({
      success: true,
      data: {
        ...proof,
        amount: proof.amount.toString(),
      },
    });
  } catch (err) {
    log.error({ err }, 'Payment verification failed');
    res.status(400).json({ success: false, error: String(err) });
  }
});

/**
 * GET /api/payments/status/:paymentId
 */
router.get('/status/:paymentId', async (req: Request, res: Response) => {
  try {
    const status = await x402Service.checkPaymentStatus(req.params.paymentId);
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/**
 * POST /api/payments/request
 * Generate a payment request for a resource.
 */
router.post('/request', (req: Request, res: Response) => {
  const { amount, asset, recipient, memo, serviceUrl, ttlSeconds } = req.body;
  if (!amount || !asset || !recipient || !memo || !serviceUrl) {
    res.status(400).json({ success: false, error: 'Missing required fields' });
    return;
  }
  const paymentRequest = x402Service.buildPaymentRequest({
    amount: BigInt(amount),
    asset,
    recipient,
    memo,
    serviceUrl,
    ttlSeconds,
  });
  res.json({ success: true, data: { ...paymentRequest, amount: paymentRequest.amount.toString() } });
});

export default router;
