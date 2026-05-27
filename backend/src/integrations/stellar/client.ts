import {
  Contract,
  Keypair,
  Networks,
  rpc as StellarRpc,
  TransactionBuilder,
  BASE_FEE,
  xdr,
  Address,
  scVal,
  nativeToScVal,
} from '@stellar/stellar-sdk';
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

  /** Build, simulate, sign, and submit a Soroban transaction. */
  async invokeContract(params: {
    contractId: string;
    method: string;
    args: xdr.ScVal[];
    signerSecretKey: string;
    fee?: string;
  }): Promise<{ txHash: string; result: xdr.ScVal | null }> {
    const { contractId, method, args, signerSecretKey, fee = BASE_FEE } = params;
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
        const meta = xdr.TransactionMeta.fromXDR(confirmed.resultMetaXdr, 'base64');
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

  /** Read-only call (simulation only, no submission). */
  async callView<T>(params: {
    contractId: string;
    method: string;
    args: xdr.ScVal[];
    callerPublicKey: string;
    decode: (val: xdr.ScVal) => T;
  }): Promise<T> {
    const { contractId, method, args, callerPublicKey, decode } = params;
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
