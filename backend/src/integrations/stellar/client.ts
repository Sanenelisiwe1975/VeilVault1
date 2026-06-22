import {
  Contract,
  Keypair,
  rpc as StellarRpc,
  TransactionBuilder,
  BASE_FEE,
  xdr,
  Operation,
  Address,
  scValToNative,
} from '@stellar/stellar-sdk';
import { randomBytes } from 'crypto';
import { config, STELLAR_NETWORKS } from '../../config';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('stellar-client');

export type NetworkName = 'testnet' | 'mainnet' | 'futurenet';

export class StellarClient {
  private rpc: StellarRpc.Server;
  private networkPassphrase: string;
  private networkName: NetworkName;

  constructor(network: NetworkName = config.STELLAR_NETWORK as NetworkName) {
    const net = STELLAR_NETWORKS[network];
    this.rpc = new StellarRpc.Server(net.rpcUrl, { allowHttp: false });
    this.networkPassphrase = net.passphrase;
    this.networkName = network;
    log.info(`Stellar client initialized for ${network}`);
  }

  get rpcServer(): StellarRpc.Server {
    return this.rpc;
  }

  get passphrase(): string {
    return this.networkPassphrase;
  }

  /** Load the current account state (sequence number etc.) */
  async loadAccount(publicKey: string) {
    return this.rpc.getAccount(publicKey);
  }

  /** Simulate a Soroban transaction and return the result. */
  async simulate(
    tx: Parameters<StellarRpc.Server['simulateTransaction']>[0],
  ): Promise<StellarRpc.Api.SimulateTransactionResponse> {
    return this.rpc.simulateTransaction(tx);
  }

  /** Build, simulate, sign, and submit a Soroban transaction.
   *
   * Accepts both the object form:
   *   invokeContract({ contractId, method, args, signerSecretKey })
   * and the legacy positional form used by service files:
   *   invokeContract(contractId, method, args, signerSecretKey)
   */
  async invokeContract(
    paramsOrContractId:
      | { contractId: string; method: string; args: xdr.ScVal[]; signerSecretKey: string; fee?: string }
      | string,
    legacyMethod?: string,
    legacyArgs?: xdr.ScVal[],
    legacySignerSecretKey?: string,
  ): Promise<{ txHash: string; result: xdr.ScVal | null }> {
    let contractId: string, method: string, args: xdr.ScVal[], signerSecretKey: string, fee: string;

    if (typeof paramsOrContractId === 'string') {
      // Legacy positional call: invokeContract(contractId, method, args, signer)
      contractId      = paramsOrContractId;
      method          = legacyMethod!;
      args            = legacyArgs ?? [];
      signerSecretKey = legacySignerSecretKey!;
      fee             = BASE_FEE;
    } else {
      // Object form
      ({ contractId, method, args, signerSecretKey } = paramsOrContractId);
      fee = paramsOrContractId.fee ?? BASE_FEE;
    }
    const signer = Keypair.fromSecret(signerSecretKey);
    const account = await this.loadAccount(signer.publicKey());

    const tx = new TransactionBuilder(account, {
      fee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        new Contract(contractId).call(method, ...args),
      )
      .setTimeout(30)
      .build();

    const simResult = await this.simulate(tx);
    if (StellarRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    const prepared = StellarRpc.assembleTransaction(tx, simResult).build();
    prepared.sign(signer);

    const response = await this.rpc.sendTransaction(prepared);
    if (response.status === 'ERROR') {
      throw new Error(`Transaction submission failed: ${response.errorResult?.toString()}`);
    }

    const txHash = response.hash;
    const confirmed = await this.waitForTransaction(txHash);

    let resultVal: xdr.ScVal | null = null;
    if (confirmed.status === 'SUCCESS' && confirmed.resultMetaXdr) {
      try {
        const meta = confirmed.resultMetaXdr;
        if (meta.v3().sorobanMeta()?.returnValue()) {
          resultVal = meta.v3().sorobanMeta()!.returnValue();
        }
      } catch { /* ignore decode errors */ }
    }

    log.debug({ txHash, method, contractId }, 'Contract invoked');
    return { txHash, result: resultVal };
  }

  /** Poll for transaction confirmation. */
  async waitForTransaction(
    txHash: string,
    timeoutMs = 30_000,
  ): Promise<StellarRpc.Api.GetTransactionResponse> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.rpc.getTransaction(txHash);
      if (result.status !== 'NOT_FOUND') return result;
      await new Promise(r => setTimeout(r, 2_000));
    }
    throw new Error(`Transaction ${txHash} not confirmed within ${timeoutMs}ms`);
  }

  /**
   * Upload a contract's WASM bytecode. Idempotent — uploading the same
   * bytes twice yields the same hash (the second upload is a no-op cost-wise
   * on most networks, but still requires a signed transaction).
   */
  async uploadWasm(wasm: Buffer, signerSecretKey: string): Promise<{ wasmHash: Buffer; txHash: string }> {
    const signer = Keypair.fromSecret(signerSecretKey);
    const account = await this.loadAccount(signer.publicKey());

    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
      .addOperation(Operation.uploadContractWasm({ wasm }))
      .setTimeout(30)
      .build();

    const simResult = await this.simulate(tx);
    if (StellarRpc.Api.isSimulationError(simResult)) {
      throw new Error(`uploadContractWasm simulation failed: ${simResult.error}`);
    }
    const prepared = StellarRpc.assembleTransaction(tx, simResult).build();
    prepared.sign(signer);

    const response = await this.rpc.sendTransaction(prepared);
    if (response.status === 'ERROR') {
      throw new Error(`uploadContractWasm submission failed: ${response.errorResult?.toString()}`);
    }
    const confirmed = await this.waitForTransaction(response.hash);
    if (confirmed.status !== 'SUCCESS' || !confirmed.resultMetaXdr) {
      throw new Error('uploadContractWasm did not succeed');
    }
    const returnVal = confirmed.resultMetaXdr.v3().sorobanMeta()?.returnValue();
    if (!returnVal) throw new Error('No return value from uploadContractWasm');
    const wasmHash = Buffer.from(scValToNative(returnVal) as Uint8Array);

    log.info({ txHash: response.hash, wasmHash: wasmHash.toString('hex') }, 'Contract WASM uploaded');
    return { wasmHash, txHash: response.hash };
  }

  /**
   * Deploy a new instance of an already-uploaded contract WASM (does not
   * call any constructor/initialize method — callers must do that as a
   * separate invocation). Returns the new contract's address.
   */
  async deployContract(params: {
    wasmHash: Buffer;
    deployerSecretKey: string;
    salt?: Buffer;
  }): Promise<{ contractAddress: string; txHash: string }> {
    const signer = Keypair.fromSecret(params.deployerSecretKey);
    const account = await this.loadAccount(signer.publicKey());
    const salt = params.salt ?? randomBytes(32);

    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
      .addOperation(Operation.createCustomContract({
        address: new Address(signer.publicKey()),
        wasmHash: params.wasmHash,
        salt,
      }))
      .setTimeout(30)
      .build();

    const simResult = await this.simulate(tx);
    if (StellarRpc.Api.isSimulationError(simResult)) {
      throw new Error(`createCustomContract simulation failed: ${simResult.error}`);
    }
    const prepared = StellarRpc.assembleTransaction(tx, simResult).build();
    prepared.sign(signer);

    const response = await this.rpc.sendTransaction(prepared);
    if (response.status === 'ERROR') {
      throw new Error(`createCustomContract submission failed: ${response.errorResult?.toString()}`);
    }
    const confirmed = await this.waitForTransaction(response.hash);
    if (confirmed.status !== 'SUCCESS' || !confirmed.resultMetaXdr) {
      throw new Error('createCustomContract did not succeed');
    }
    const returnVal = confirmed.resultMetaXdr.v3().sorobanMeta()?.returnValue();
    if (!returnVal) throw new Error('No return value from createCustomContract');
    const contractAddress = Address.fromScVal(returnVal).toString();

    log.info({ txHash: response.hash, contractAddress }, 'Contract instance deployed');
    return { contractAddress, txHash: response.hash };
  }

  /**
   * Read-only call (simulation only, no submission).
   *
   * Accepts both the typed object form:
   *   callView({ contractId, method, args, callerPublicKey, decode })
   * and the legacy positional form used by many service files, which returns
   * the raw ScVal for the caller to decode with scValToNative:
   *   callView(contractId, method, args)
   */
  async callView<T>(params: {
    contractId: string;
    method: string;
    args: xdr.ScVal[];
    callerPublicKey: string;
    decode: (val: xdr.ScVal) => T;
  }): Promise<T>;
  async callView(contractId: string, method: string, args: xdr.ScVal[]): Promise<xdr.ScVal>;
  async callView<T>(
    paramsOrContractId:
      | { contractId: string; method: string; args: xdr.ScVal[]; callerPublicKey: string; decode: (val: xdr.ScVal) => T }
      | string,
    legacyMethod?: string,
    legacyArgs?: xdr.ScVal[],
  ): Promise<T | xdr.ScVal> {
    let contractId: string, method: string, args: xdr.ScVal[], callerPublicKey: string;
    let decode: (val: xdr.ScVal) => T | xdr.ScVal;

    if (typeof paramsOrContractId === 'string') {
      contractId = paramsOrContractId;
      method = legacyMethod!;
      args = legacyArgs ?? [];
      callerPublicKey = Keypair.fromSecret(config.ADMIN_SECRET_KEY).publicKey();
      decode = (val) => val;
    } else {
      ({ contractId, method, args, callerPublicKey, decode } = paramsOrContractId);
    }

    const account = await this.loadAccount(callerPublicKey);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(30)
      .build();

    const simResult = await this.simulate(tx);
    if (StellarRpc.Api.isSimulationError(simResult)) {
      throw new Error(`View call failed: ${simResult.error}`);
    }

    const returnVal = (simResult as StellarRpc.Api.SimulateTransactionSuccessResponse)
      .result?.retval;
    if (!returnVal) throw new Error('No return value from view call');
    return decode(returnVal);
  }

  /** Get the current ledger sequence number. */
  async getLedgerSequence(): Promise<number> {
    const latest = await this.rpc.getLatestLedger();
    return latest.sequence;
  }
}

// Singleton
export const stellarClient = new StellarClient();
export function getStellarClient(): StellarClient { return stellarClient; }
