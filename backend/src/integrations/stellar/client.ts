import {
  Contract,
  Keypair,
  rpc as StellarRpc,
  TransactionBuilder,
  Transaction,
  BASE_FEE,
  xdr,
  Operation,
  Address,
  scValToNative,
  hash as stellarHash,
} from '@stellar/stellar-sdk';
import { randomBytes } from 'crypto';
import { config, STELLAR_NETWORKS } from '../../config';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('stellar-client');

export type NetworkName = 'testnet' | 'mainnet' | 'futurenet';

/**
 * Soroban's TransactionMeta union gained a v4 arm (current testnet protocol)
 * alongside the older v3 arm (still seen on networks running an earlier
 * protocol) — both carry a return value, just under differently-named structs.
 */
function sorobanReturnValue(meta: xdr.TransactionMeta): xdr.ScVal | undefined {
  switch (meta.switch()) {
    case 3:
      return meta.v3().sorobanMeta()?.returnValue();
    case 4:
      return meta.v4().sorobanMeta()?.returnValue() ?? undefined;
    default:
      return undefined;
  }
}

/**
 * Output of `prepareAuthorizedInvocation` / input to `submitAuthorizedInvocation`.
 * Holds live SDK objects rather than XDR strings — see the doc comment on
 * `submitAuthorizedInvocation` for why that's fine here.
 */
export interface PreparedAuthorization {
  tx: Transaction;
  simResult: StellarRpc.Api.SimulateTransactionSuccessResponse;
  entries: xdr.SorobanAuthorizationEntry[];
  authEntryIndex: number;
  payloadHash: Buffer;
  signatureExpirationLedger: number;
}

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
        resultVal = sorobanReturnValue(confirmed.resultMetaXdr) ?? null;
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
    const returnVal = sorobanReturnValue(confirmed.resultMetaXdr);
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
    const returnVal = sorobanReturnValue(confirmed.resultMetaXdr);
    if (!returnVal) throw new Error('No return value from createCustomContract');
    const contractAddress = Address.fromScVal(returnVal).toString();

    log.info({ txHash: response.hash, contractAddress }, 'Contract instance deployed');
    return { contractAddress, txHash: response.hash };
  }

  /**
   * Step 1 of authorizing a contract invocation on behalf of a Soroban
   * custom account (e.g. a `smart-wallet` instance) whose `__check_auth`
   * needs a signature we can't produce synchronously (a WebAuthn ceremony
   * has to happen in the user's browser).
   *
   * Builds the invocation, simulates it to learn the required
   * `SorobanAuthorizationEntry` for `authAddress`, and computes the exact
   * 32-byte hash that entry's signature must cover — the same
   * `signature_payload` the contract's `__check_auth` will receive. The
   * caller gets that hash back to use as a WebAuthn `challenge`; once an
   * assertion comes back, finish the flow with
   * `submitAuthorizedInvocation`.
   *
   * NOTE: `@stellar/stellar-sdk`'s own `authorizeEntry`/`authorizeInvocation`
   * helpers can't be reused here — they hard-code the signature into the
   * classic Ed25519 "account contract" ScVal shape and verify it as an
   * Ed25519 signature against the entry's address, which only works for
   * G... accounts, never for a contract-address (C...) custom account like
   * ours. We build and fill the entry manually instead.
   */
  async prepareAuthorizedInvocation(params: {
    contractId: string;
    method: string;
    args: xdr.ScVal[];
    authAddress: string;
    feePayerPublicKey: string;
    validLedgerWindow?: number; // how many ledgers the auth stays valid for; default ~8 min at 5s/ledger
  }): Promise<PreparedAuthorization> {
    const account = await this.loadAccount(params.feePayerPublicKey);
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase })
      .addOperation(Operation.invokeContractFunction({
        contract: params.contractId,
        function: params.method,
        args: params.args,
      }))
      .setTimeout(30)
      .build();

    const simResult = await this.simulate(tx);
    if (!StellarRpc.Api.isSimulationSuccess(simResult)) {
      throw new Error(`prepareAuthorizedInvocation simulation failed: ${JSON.stringify(simResult)}`);
    }
    const entries = simResult.result?.auth ?? [];
    const authEntryIndex = entries.findIndex((entry) => {
      if (entry.credentials().switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) return false;
      const entryAddress = Address.fromScAddress(entry.credentials().address().address()).toString();
      return entryAddress === params.authAddress;
    });
    if (authEntryIndex === -1) {
      throw new Error(`No auth entry for address ${params.authAddress} — does this invocation actually need its authorization?`);
    }

    const currentLedger = await this.getLedgerSequence();
    const signatureExpirationLedger = currentLedger + (params.validLedgerWindow ?? 100);

    const addrAuth = entries[authEntryIndex].credentials().address();
    addrAuth.signatureExpirationLedger(signatureExpirationLedger);

    const networkId = stellarHash(Buffer.from(this.networkPassphrase));
    const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({
        networkId,
        nonce: addrAuth.nonce(),
        invocation: entries[authEntryIndex].rootInvocation(),
        signatureExpirationLedger,
      }),
    );
    const payloadHash = stellarHash(preimage.toXDR());

    return { tx, simResult, entries, authEntryIndex, payloadHash, signatureExpirationLedger };
  }

  /**
   * Step 2: attach a completed signature ScVal to the prepared entry, sign
   * the transaction envelope with the fee payer, and submit. `signatureScVal`
   * must decode to whatever type the target contract's
   * `CustomAccountInterface::Signature` is (for `smart-wallet`, a
   * `WebAuthnSignature` struct) — this method doesn't know or care about
   * that shape, it just slots it in.
   *
   * `prepared` must be the exact object `prepareAuthorizedInvocation`
   * returned — it carries live SDK objects (not XDR strings) because the
   * gap between the two steps is just "time for the browser's WebAuthn
   * ceremony," not a process boundary; the caller (passkey.service.ts) is
   * expected to hold onto it in memory the same way it already holds
   * pending WebAuthn challenges for register/login.
   */
  async submitAuthorizedInvocation(params: {
    prepared: PreparedAuthorization;
    signatureScVal: xdr.ScVal;
    feePayerSecretKey: string;
  }): Promise<{ txHash: string; result: xdr.ScVal | null }> {
    const { tx, entries, authEntryIndex } = params.prepared;
    const signer = Keypair.fromSecret(params.feePayerSecretKey);

    entries[authEntryIndex].credentials().address().signature(params.signatureScVal);

    const invokeOp = tx.operations[0] as Operation.InvokeHostFunction;

    // The original simulation (prepareAuthorizedInvocation) ran before this
    // entry had a real signature, so Soroban only *recorded* that an auth
    // entry was needed here rather than actually executing __check_auth —
    // meaning its resource/instruction estimate never accounted for the real
    // cost of secp256r1_verify. Re-simulate now that the entry is complete so
    // the network enforces (not records) it and gives an accurate budget.
    const unsizedTx = TransactionBuilder.cloneFrom(tx, { networkPassphrase: this.networkPassphrase })
      .clearOperations()
      .addOperation(Operation.invokeHostFunction({ func: invokeOp.func, auth: entries }))
      .build();
    const resim = await this.simulate(unsizedTx);
    if (StellarRpc.Api.isSimulationError(resim)) {
      throw new Error(`submitAuthorizedInvocation re-simulation failed: ${resim.error}`);
    }

    const rebuilt = StellarRpc.assembleTransaction(unsizedTx, resim).build();
    rebuilt.sign(signer);

    const response = await this.rpc.sendTransaction(rebuilt);
    if (response.status === 'ERROR') {
      throw new Error(`submitAuthorizedInvocation submission failed: ${response.errorResult?.toString()}`);
    }
    const confirmed = await this.waitForTransaction(response.hash);
    if (confirmed.status !== 'SUCCESS') {
      const diag = (confirmed as { diagnosticEventsXdr?: xdr.DiagnosticEvent[] }).diagnosticEventsXdr
        ?.map((e) => {
          const body = e.event().body().v0();
          return {
            topics: body.topics().map((t) => scValToNative(t)),
            data: scValToNative(body.data()),
            inSuccessfulContractCall: e.inSuccessfulContractCall(),
          };
        });
      log.error({ txHash: response.hash, status: confirmed.status, diag }, 'submitAuthorizedInvocation failed');
      throw new Error(`submitAuthorizedInvocation transaction did not succeed: ${confirmed.status}`);
    }

    let resultVal: xdr.ScVal | null = null;
    if (confirmed.resultMetaXdr) {
      try {
        resultVal = sorobanReturnValue(confirmed.resultMetaXdr) ?? null;
      } catch { /* ignore decode errors */ }
    }

    log.info({ txHash: response.hash }, 'Passkey-authorized invocation submitted');
    return { txHash: response.hash, result: resultVal };
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
