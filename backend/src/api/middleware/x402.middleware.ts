import { Request, Response, NextFunction } from 'express';
import { x402Service } from '../../services/x402.service';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('x402-middleware');

export interface X402Options {
  amount: bigint;
  asset: string;
  recipient: string;
  memo: string;
  serviceUrl: string;
}

/**
 * Express middleware that enforces x402 payment for a route.
 *
 * Agents must include `X-Payment-Id` header with a verified Stellar tx hash.
 * On first request without payment → 402 with payment instructions.
 * Subsequent requests with valid `X-Payment-Id` → pass through.
 */
export function requireX402Payment(options: X402Options) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const paymentId = req.headers['x-payment-id'] as string | undefined;

    if (!paymentId) {
      const paymentRequest = x402Service.buildPaymentRequest(options);
      const headers = x402Service.buildX402Headers(paymentRequest);

      Object.entries(headers).forEach(([key, val]) => res.setHeader(key, val));

      res.status(402).json({
        success: false,
        error: 'Payment Required',
        payment: {
          amount: options.amount.toString(),
          asset: options.asset,
          recipient: options.recipient,
          memo: options.memo,
          serviceUrl: options.serviceUrl,
        },
        requestId: (req as Request & { id: string }).id,
      });
      return;
    }

    try {
      const status = await x402Service.checkPaymentStatus(paymentId);
      if (!status.verified) {
        res.status(402).json({
          success: false,
          error: 'Payment not verified. Submit your Stellar tx hash to /api/payments/verify first.',
          requestId: (req as Request & { id: string }).id,
        });
        return;
      }

      log.info({ paymentId, agentId: (req as Request & { agentId?: string }).agentId }, 'Payment verified, allowing access');
      next();
    } catch (err) {
      log.error({ err: (err as Error).message, paymentId }, 'Payment verification error');
      res.status(500).json({
        success: false,
        error: 'Payment verification failed',
        requestId: (req as Request & { id: string }).id,
      });
    }
  };
}
