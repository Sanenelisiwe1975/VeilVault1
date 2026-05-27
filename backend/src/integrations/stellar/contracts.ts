/**
 * Typed wrappers for VeilVault1 Soroban contract calls.
 * Each method maps directly to a contract entry point.
 */
import {
  nativeToScVal,
  scValToNative,
  xdr,
  Address,
  Contract,
} from '@stellar/stellar-sdk';
import { StellarClient } from './client';
import {
  VaultInfo,
  GuardrailsConfig,
  Position,
  StrategyType,
} from '../../types';

function addrVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

function i128Val(n: bigint): xdr.ScVal {
  return nativeToScVal(n, { type: 'i128' });
}

function u32Val(n: number): xdr.ScVal {
  return nativeToScVal(n, { type: 'u32' });
}

function u64Val(n: bigint): xdr.ScVal {
  return nativeToScVal(n, { type: 'u64' });
}

function boolVal(b: boolean): xdr.ScVal {
  return nativeToScVal(b, { type: 'bool' });
}

function bytesVal(buf: Buffer): xdr.ScVal {
  return nativeToScVal(buf, { type: 'bytes' });
}

function stringVal(s: string): xdr.ScVal {
  return nativeToScVal(s, { type: 'string' });
}

function guardrailsToScVal(client: StellarClient, g: GuardrailsConfig): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: stringVal('max_drawdown_bps'),
      val: u32Val(g.maxDrawdownBps),
    }),
    new xdr.ScMapEntry({
      key: stringVal('daily_spending_cap'),
      val: i128Val(g.dailySpendingCap),
    }),
    new xdr.ScMapEntry({
      key: stringVal('time_lock_seconds'),
      val: u64Val(BigInt(g.timeLockSeconds)),
    }),
    new xdr.ScMapEntry({
      key: stringVal('whitelisted_protocols'),
      val: xdr.ScVal.scvVec(g.whitelistedProtocols.map(addrVal)),
    }),
    new xdr.ScMapEntry({
      key: stringVal('max_position_size_bps'),
      val: u32Val(g.maxPositionSizeBps),
    }),
    new xdr.ScMapEntry({
      key: stringVal('max_leverage_bps'),
      val: u32Val(g.maxLeverageBps),
    }),
    new xdr.ScMapEntry({
      key: stringVal('emergency_stop'),
      val: boolVal(g.emergencyStop),
    }),
  ]);
}

export class VaultContractClient {
  constructor(
    private readonly stellar: StellarClient,
    private readonly contractId: string,
    private readonly callerPublicKey: string,
  ) {}

  async initialize(params: {
    admin: string;
    name: string;
    asset: string;
    guardrails: GuardrailsConfig;
    signerSecretKey: string;
  }): Promise<string> {
    const { txHash } = await this.stellar.invokeContract({
      contractId: this.contractId,
      method: 'initialize',
      args: [
        addrVal(params.admin),
        stringVal(params.name),
        addrVal(params.asset),
        guardrailsToScVal(this.stellar, params.guardrails),
      ],
      signerSecretKey: params.signerSecretKey,
    });
    return txHash;
  }

  async deposit(params: {
    from: string;
    amount: bigint;
    signerSecretKey: string;
  }): Promise<{ txHash: string; shares: bigint }> {
    const { txHash, result } = await this.stellar.invokeContract({
      contractId: this.contractId,
      method: 'deposit',
      args: [addrVal(params.from), i128Val(params.amount)],
      signerSecretKey: params.signerSecretKey,
    });
    const shares = result ? BigInt(scValToNative(result) as number) : 0n;
    return { txHash, shares };
  }

  async withdraw(params: {
    from: string;
    shares: bigint;
    signerSecretKey: string;
  }): Promise<{ txHash: string; assets: bigint }> {
    const { txHash, result } = await this.stellar.invokeContract({
      contractId: this.contractId,
      method: 'withdraw',
      args: [addrVal(params.from), i128Val(params.shares)],
      signerSecretKey: params.signerSecretKey,
    });
    const assets = result ? BigInt(scValToNative(result) as number) : 0n;
    return { txHash, assets };
  }

  async openPosition(params: {
    agent: string;
    protocol: string;
    amount: bigint;
    expiresAt: number;
    strategyType: StrategyType;
    metadata: Buffer;
    signerSecretKey: string;
  }): Promise<{ txHash: string; positionId: bigint }> {
    const { txHash, result } = await this.stellar.invokeContract({
      contractId: this.contractId,
      method: 'open_position',
      args: [
        addrVal(params.agent),
        addrVal(params.protocol),
        i128Val(params.amount),
        u64Val(BigInt(params.expiresAt)),
        u32Val(params.strategyType),
        bytesVal(params.metadata),
      ],
      signerSecretKey: params.signerSecretKey,
    });
    const positionId = result ? BigInt(scValToNative(result) as number) : 0n;
    return { txHash, positionId };
  }

  async closePosition(params: {
    agent: string;
    positionId: bigint;
    returnAmount: bigint;
    signerSecretKey: string;
  }): Promise<{ txHash: string; pnl: bigint }> {
    const { txHash, result } = await this.stellar.invokeContract({
      contractId: this.contractId,
      method: 'close_position',
      args: [
        addrVal(params.agent),
        u64Val(params.positionId),
        i128Val(params.returnAmount),
      ],
      signerSecretKey: params.signerSecretKey,
    });
    const pnl = result ? BigInt(scValToNative(result) as number) : 0n;
    return { txHash, pnl };
  }

  async addAgent(params: { agent: string; signerSecretKey: string }): Promise<string> {
    const { txHash } = await this.stellar.invokeContract({
      contractId: this.contractId,
      method: 'add_agent',
      args: [addrVal(params.agent)],
      signerSecretKey: params.signerSecretKey,
    });
    return txHash;
  }

  async removeAgent(params: { agent: string; signerSecretKey: string }): Promise<string> {
    const { txHash } = await this.stellar.invokeContract({
      contractId: this.contractId,
      method: 'remove_agent',
      args: [addrVal(params.agent)],
      signerSecretKey: params.signerSecretKey,
    });
    return txHash;
  }

  async emergencyStop(params: { signerSecretKey: string }): Promise<string> {
    const { txHash } = await this.stellar.invokeContract({
      contractId: this.contractId,
      method: 'emergency_stop',
      args: [],
      signerSecretKey: params.signerSecretKey,
    });
    return txHash;
  }

  async getTotalAssets(): Promise<bigint> {
    return this.stellar.callView({
      contractId: this.contractId,
      method: 'get_total_assets',
      args: [],
      callerPublicKey: this.callerPublicKey,
      decode: val => BigInt(scValToNative(val) as number),
    });
  }

  async getTotalShares(): Promise<bigint> {
    return this.stellar.callView({
      contractId: this.contractId,
      method: 'get_total_shares',
      args: [],
      callerPublicKey: this.callerPublicKey,
      decode: val => BigInt(scValToNative(val) as number),
    });
  }

  async getBalance(address: string): Promise<bigint> {
    return this.stellar.callView({
      contractId: this.contractId,
      method: 'get_balance',
      args: [addrVal(address)],
      callerPublicKey: this.callerPublicKey,
      decode: val => BigInt(scValToNative(val) as number),
    });
  }

  async isAuthorizedAgent(agent: string): Promise<boolean> {
    return this.stellar.callView({
      contractId: this.contractId,
      method: 'is_authorized_agent',
      args: [addrVal(agent)],
      callerPublicKey: this.callerPublicKey,
      decode: val => Boolean(scValToNative(val)),
    });
  }
}

export class X402VerifierClient {
  constructor(
    private readonly stellar: StellarClient,
    private readonly contractId: string,
    private readonly callerPublicKey: string,
  ) {}

  async attestPayment(params: {
    paymentId: string;
    from: string;
    to: string;
    amount: bigint;
    asset: string;
    memo: string;
    ledgerSequence: number;
    expiresAt: number;
    signerSecretKey: string;
  }): Promise<string> {
    const proof = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: stringVal('payment_id'), val: stringVal(params.paymentId) }),
      new xdr.ScMapEntry({ key: stringVal('from'), val: addrVal(params.from) }),
      new xdr.ScMapEntry({ key: stringVal('to'), val: addrVal(params.to) }),
      new xdr.ScMapEntry({ key: stringVal('amount'), val: i128Val(params.amount) }),
      new xdr.ScMapEntry({ key: stringVal('asset'), val: addrVal(params.asset) }),
      new xdr.ScMapEntry({ key: stringVal('memo'), val: stringVal(params.memo) }),
      new xdr.ScMapEntry({ key: stringVal('ledger_sequence'), val: u32Val(params.ledgerSequence) }),
      new xdr.ScMapEntry({ key: stringVal('expires_at'), val: u64Val(BigInt(params.expiresAt)) }),
    ]);
    const sig = bytesVal(Buffer.alloc(64)); // oracle sig verified via Stellar auth
    const { txHash } = await this.stellar.invokeContract({
      contractId: this.contractId,
      method: 'attest_payment',
      args: [proof, sig],
      signerSecretKey: params.signerSecretKey,
    });
    return txHash;
  }

  async isVerified(paymentId: string): Promise<boolean> {
    return this.stellar.callView({
      contractId: this.contractId,
      method: 'is_verified',
      args: [stringVal(paymentId)],
      callerPublicKey: this.callerPublicKey,
      decode: val => Boolean(scValToNative(val)),
    });
  }
}
