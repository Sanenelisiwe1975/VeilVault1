import {
  Account,
  Contract,
  Networks,
  TransactionBuilder,
  SorobanRpc,
  Keypair,
  xdr,
  nativeToScVal,
  scValToNative,
  Address,
} from '@stellar/stellar-sdk';
import { createHash } from 'crypto';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('privacy-pool');

export interface PoolState {
  denomination: string;
  asset: string;
  totalDeposits: number;
  totalWithdrawals: number;
  isPaused: boolean;
  zkVerifier: string | null;
}

export interface TreeState {
  nextIndex: number;
  depth: number;
  currentRoot: string;
}

export interface DepositResult {
  leafIndex: number;
  commitment: string;
  txHash: string;
}

export interface WithdrawResult {
  txHash: string;
  recipient: string;
}

/**
 * Computes the Groth16 commitment for a privacy-pool deposit.
 * commitment = SHA-256(secret || nullifier)
 * This must be computed CLIENT-SIDE and the secret/nullifier kept private.
 */
export function computeCommitment(secret: Buffer, nullifier: Buffer): Buffer {
  return createHash('sha256').update(secret).update(nullifier).digest();
}

/**
 * Computes the nullifier hash for a withdrawal.
 * nullifier_hash = SHA-256(nullifier)
 */
export function computeNullifierHash(nullifier: Buffer): Buffer {
  return createHash('sha256').update(nullifier).digest();
}

export class PrivacyPoolService {
  private readonly server: SorobanRpc.Server;
  private readonly contractId: string;
  private readonly networkPassphrase: string;

  constructor() {
    this.server = new SorobanRpc.Server(config.STELLAR_RPC_URL);
    this.contractId = config.PRIVACY_POOL_CONTRACT_ID ?? '';
    this.networkPassphrase =
      config.STELLAR_NETWORK === 'mainnet'
        ? Networks.PUBLIC
        : Networks.TESTNET;
  }

  private get contract() {
    return new Contract(this.contractId);
  }

  // ── Deposit ───────────────────────────────────────────────────────────────

  /**
   * Deposit exactly one denomination unit into the privacy pool.
   *
   * The caller must:
   *   1. Generate a random 32-byte secret and 32-byte nullifier — KEEP PRIVATE.
   *   2. Compute commitment = SHA-256(secret || nullifier).
   *   3. Pass the commitment hex here.
   *
   * The leaf_index returned must be recorded to generate the withdrawal proof.
   */
  async deposit(
    depositorSecret: string,
    commitmentHex: string,
  ): Promise<DepositResult> {
    const kp = Keypair.fromSecret(depositorSecret);
    const commitmentBytes = Buffer.from(commitmentHex, 'hex');
    if (commitmentBytes.length !== 32) throw new Error('commitment must be 32 bytes');

    const account = await this.server.getAccount(kp.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: '500000',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          'deposit',
          new Address(kp.publicKey()).toScVal(),
          nativeToScVal(commitmentBytes, { type: 'bytes' }),
        ),
      )
      .setTimeout(30)
      .build();

    const prep = await this.server.prepareTransaction(tx);
    prep.sign(kp);
    const result = await this.server.sendTransaction(prep);
    log.info({ txHash: result.hash, depositor: kp.publicKey() }, 'deposit submitted');

    const leafIndex = await this.waitAndExtractLeafIndex(result.hash);
    return { leafIndex, commitment: commitmentHex, txHash: result.hash };
  }

  // ── Withdraw ──────────────────────────────────────────────────────────────

  /**
   * Withdraw one denomination unit from the pool.
   *
   * Before calling, the owner must:
   *   1. Generate a Groth16 proof off-chain using the circuit registered for
   *      this pool, binding root, nullifier_hash, recipient, and denomination.
   *   2. Submit that proof to the zk-attestation contract to get an attestation_id.
   *   3. Pass root, nullifier_hash, and attestation_id here.
   */
  async withdraw(
    recipientSecret: string,
    root: string,
    nullifierHash: string,
    attestationId: string,
  ): Promise<WithdrawResult> {
    const kp = Keypair.fromSecret(recipientSecret);

    const rootBytes = Buffer.from(root, 'hex');
    const nullifierBytes = Buffer.from(nullifierHash, 'hex');
    const attestationBytes = Buffer.from(attestationId, 'hex');

    if (rootBytes.length !== 32 || nullifierBytes.length !== 32 || attestationBytes.length !== 32) {
      throw new Error('root, nullifier_hash, and attestation_id must be 32 bytes hex');
    }

    const account = await this.server.getAccount(kp.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: '500000',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          'withdraw',
          new Address(kp.publicKey()).toScVal(),
          nativeToScVal(rootBytes, { type: 'bytes' }),
          nativeToScVal(nullifierBytes, { type: 'bytes' }),
          nativeToScVal(attestationBytes, { type: 'bytes' }),
        ),
      )
      .setTimeout(30)
      .build();

    const prep = await this.server.prepareTransaction(tx);
    prep.sign(kp);
    const result = await this.server.sendTransaction(prep);
    log.info({ txHash: result.hash, recipient: kp.publicKey() }, 'withdrawal submitted');

    return { txHash: result.hash, recipient: kp.publicKey() };
  }

  // ── Views ─────────────────────────────────────────────────────────────────

  async getState(): Promise<PoolState> {
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(
        new Account(Keypair.random().publicKey(), '0'),
        { fee: '100', networkPassphrase: this.networkPassphrase },
      )
        .addOperation(this.contract.call('get_config'))
        .setTimeout(30)
        .build(),
    );

    if (!SorobanRpc.Api.isSimulationSuccess(result)) {
      throw new Error('Failed to get pool config');
    }

    const val = scValToNative((result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result!.retval);
    return {
      denomination: val.denomination?.toString() ?? '0',
      asset: val.asset ?? '',
      totalDeposits: Number(val.total_deposits ?? 0),
      totalWithdrawals: Number(val.total_withdrawals ?? 0),
      isPaused: !!val.is_paused,
      zkVerifier: val.zk_verifier ?? null,
    };
  }

  async getCurrentRoot(): Promise<string> {
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(
        new Account(Keypair.random().publicKey(), '0'),
        { fee: '100', networkPassphrase: this.networkPassphrase },
      )
        .addOperation(this.contract.call('get_current_root'))
        .setTimeout(30)
        .build(),
    );

    if (!SorobanRpc.Api.isSimulationSuccess(result)) throw new Error('Failed to get root');
    const val = scValToNative((result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result!.retval);
    return Buffer.from(val).toString('hex');
  }

  async getTreeState(): Promise<TreeState> {
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(
        new Account(Keypair.random().publicKey(), '0'),
        { fee: '100', networkPassphrase: this.networkPassphrase },
      )
        .addOperation(this.contract.call('get_tree_state'))
        .setTimeout(30)
        .build(),
    );

    if (!SorobanRpc.Api.isSimulationSuccess(result)) throw new Error('Failed to get tree');
    const val = scValToNative((result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result!.retval);
    return {
      nextIndex: Number(val.next_index ?? 0),
      depth: Number(val.depth ?? 20),
      currentRoot: Buffer.from(val.current_root ?? []).toString('hex'),
    };
  }

  async isNullifierSpent(nullifierHashHex: string): Promise<boolean> {
    const nullifierBytes = Buffer.from(nullifierHashHex, 'hex');
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(
        new Account(Keypair.random().publicKey(), '0'),
        { fee: '100', networkPassphrase: this.networkPassphrase },
      )
        .addOperation(
          this.contract.call(
            'is_nullifier_spent',
            nativeToScVal(nullifierBytes, { type: 'bytes' }),
          ),
        )
        .setTimeout(30)
        .build(),
    );

    if (!SorobanRpc.Api.isSimulationSuccess(result)) return false;
    return !!scValToNative((result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result!.retval);
  }

  async isKnownRoot(rootHex: string): Promise<boolean> {
    const rootBytes = Buffer.from(rootHex, 'hex');
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(
        new Account(Keypair.random().publicKey(), '0'),
        { fee: '100', networkPassphrase: this.networkPassphrase },
      )
        .addOperation(
          this.contract.call(
            'is_known_root',
            nativeToScVal(rootBytes, { type: 'bytes' }),
          ),
        )
        .setTimeout(30)
        .build(),
    );

    if (!SorobanRpc.Api.isSimulationSuccess(result)) return false;
    return !!scValToNative((result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result!.retval);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private async waitAndExtractLeafIndex(txHash: string): Promise<number> {
    let attempts = 0;
    while (attempts < 20) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await this.server.getTransaction(txHash);
      if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        const val = scValToNative(status.returnValue!);
        return Number(val);
      }
      if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Deposit transaction failed: ${txHash}`);
      }
      attempts++;
    }
    throw new Error(`Transaction not confirmed after ${attempts} attempts`);
  }
}
