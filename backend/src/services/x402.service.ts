/**
 * x402 Payment Service
 *
 * Implements the HTTP 402 Payment Required protocol for agent-to-agent
 * micropayments on Stellar. Agents pay in any SAC token (USDC, XLM, etc.)
 * to gain access to vault services.
 *
 * Protocol flow:
 *   1. Client requests a resource → server responds with 402 + PaymentRequest.
 *   2. Agent pays on Stellar (tracked via Horizon).
 *   3. Agent submits payment proof → this service verifies on Horizon and
 *      attests the payment on the x402-verifier contract.
 *   4. Verified paymentId is included in subsequent requests.
 */
import axios from 'axios';
import { Keypair, Horizon } from '@stellar/stellar-sdk';
import { config, STELLAR_NETWORKS } from '../config';
import { createChildLogger } from '../utils/logger';
import { stellarClient } from '../integrations/stellar/client';
import { X402VerifierClient } from '../integrations/stellar/contracts';
import {
  X402PaymentRequest,
  X402PaymentProof,
  X402PaymentStatus,
} from '../types';

const log = createChildLogger('x402-service');

export class X402Service {
  private horizon: Horizon.Server;
  private oraclePublicKey: string;
  private verifierClient: X402VerifierClient | null = null;

  constructor() {
    const net = STELLAR_NETWORKS[config.STELLAR_NETWORK as 'testnet' | 'mainnet'];
    this.horizon = new Horizon.Server(net.horizonUrl);
    this.oraclePublicKey = Keypair.fromSecret(config.ORACLE_SECRET_KEY).publicKey();

    if (config.X402_VERIFIER_CONTRACT_ID) {
      this.verifierClient = new X402VerifierClient(
        stellarClient,
        config.X402_VERIFIER_CONTRACT_ID,
        this.oraclePublicKey,
      );
    }
  }

  /** Generate a 402 Payment Required challenge for a resource. */
  buildPaymentRequest(params: {
    amount: bigint;
    asset: string;   // SAC address or 'native'
    recipient: string;
    memo: string;
    serviceUrl: string;
    ttlSeconds?: number;
  }): X402PaymentRequest {
    const expiresAt = Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? 300);
    return {
      amount: params.amount,
      asset: params.asset,
      recipient: params.recipient,
      memo: params.memo,
      expiresAt,
      serviceUrl: params.serviceUrl,
    };
  }

  /** Verify that a Stellar payment was made by querying Horizon. */
  async verifyPaymentOnChain(params: {
    txHash: string;
    expectedFrom?: string;
    expectedTo: string;
    expectedAmount: bigint;
    expectedAsset: string;
    expectedMemo: string;
  }): Promise<X402PaymentProof> {
    log.info({ txHash: params.txHash }, 'Verifying payment on Horizon');

    const tx = await this.horizon.transactions().transaction(params.txHash).call();

    if (tx.successful !== true) {
      throw new Error(`Transaction ${params.txHash} was not successful`);
    }

    // Load operations to find the payment op
    const ops = await this.horizon.operations().forTransaction(params.txHash).call();
    const paymentOp = ops.records.find(
      op => op.type === 'payment',
    ) as Horizon.ServerApi.PaymentOperationRecord | undefined;

    if (!paymentOp) {
      throw new Error('No payment operation found in transaction');
    }

    const amount = BigInt(Math.round(parseFloat(paymentOp.amount) * 1e7));

    if (params.expectedAmount > 0n && amount < params.expectedAmount) {
      throw new Error(
        `Payment amount ${amount} is less than required ${params.expectedAmount}`,
      );
    }

    if (paymentOp.to !== params.expectedTo) {
      throw new Error(
        `Payment recipient ${paymentOp.to} does not match expected ${params.expectedTo}`,
      );
    }

    const ledgerSequence = tx.ledger_attr as unknown as number;

    return {
      paymentId: params.txHash,
      from: paymentOp.from,
      to: paymentOp.to,
      amount,
      asset: params.expectedAsset,
      memo: params.expectedMemo,
      ledgerSequence,
      expiresAt: 0,
    };
  }

  /** Attest a verified payment on-chain so the x402-verifier contract records it. */
  async attestPayment(proof: X402PaymentProof): Promise<string> {
    if (!this.verifierClient) {
      throw new Error('x402 verifier contract not configured');
    }
    log.info({ paymentId: proof.paymentId }, 'Attesting payment on-chain');

    const txHash = await this.verifierClient.attestPayment({
      paymentId: proof.paymentId,
      from: proof.from,
      to: proof.to,
      amount: proof.amount,
      asset: proof.asset,
      memo: proof.memo,
      ledgerSequence: proof.ledgerSequence,
      expiresAt: proof.expiresAt,
      signerSecretKey: config.ORACLE_SECRET_KEY,
    });

    log.info({ paymentId: proof.paymentId, attestTxHash: txHash }, 'Payment attested');
    return txHash;
  }

  /** Full flow: verify on Horizon + attest on-chain. Returns the payment proof. */
  async processPaymentProof(params: {
    txHash: string;
    expectedTo: string;
    expectedAmount: bigint;
    expectedAsset: string;
    expectedMemo: string;
  }): Promise<X402PaymentProof> {
    const proof = await this.verifyPaymentOnChain({
      txHash: params.txHash,
      expectedTo: params.expectedTo,
      expectedAmount: params.expectedAmount,
      expectedAsset: params.expectedAsset,
      expectedMemo: params.expectedMemo,
    });

    await this.attestPayment(proof);
    return proof;
  }

  /** Check if a payment has been verified (on-chain). */
  async checkPaymentStatus(paymentId: string): Promise<X402PaymentStatus> {
    if (!this.verifierClient) {
      throw new Error('x402 verifier contract not configured');
    }
    const verified = await this.verifierClient.isVerified(paymentId);
    return { paymentId, verified, consumed: !verified };
  }

  /** Build the standard 402 response headers. */
  buildX402Headers(paymentRequest: X402PaymentRequest): Record<string, string> {
    return {
      'X-Payment-Required': JSON.stringify({
        version: '1.0',
        scheme: 'stellar',
        network: config.STELLAR_NETWORK,
        amount: paymentRequest.amount.toString(),
        asset: paymentRequest.asset,
        recipient: paymentRequest.recipient,
        memo: paymentRequest.memo,
        expires_at: paymentRequest.expiresAt,
        service_url: paymentRequest.serviceUrl,
      }),
    };
  }
}

export const x402Service = new X402Service();
