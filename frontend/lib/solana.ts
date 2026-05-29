/**
 * Solana on-chain client stub.
 * Replace with the real Anchor-generated client + IDL for production.
 */
import { Connection, PublicKey, Transaction } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

export function findVaultPda(owner: PublicKey): [PublicKey, number] {
  // Stub — return a deterministic but fake PDA
  return [owner, 255];
}

export function findDWalletRecordPda(vaultPda: PublicKey): [PublicKey, number] {
  return [vaultPda, 254];
}

interface WalletSigner {
  publicKey:       PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

export class VeilVaultClient {
  constructor(
    private _connection: Connection,
    private _wallet:     WalletSigner,
  ) {}

  async initializeVault(_params: {
    fhePubkey:             Uint8Array;
    maxDrawdownBps:        number;
    spendingLimitLamports: bigint;
    timeLockSecs:          bigint;
  }): Promise<string> { return "stub-sig"; }

  async createDWallet(_params: {
    dwalletId:     Uint8Array;
    dwalletPubkey: Uint8Array;
    chainBitmap:   number;
  }): Promise<string> { return "stub-sig"; }

  async approveDWallet(): Promise<string> { return "stub-sig"; }

  async addApprovedProtocol(_protocol: PublicKey): Promise<string> { return "stub-sig"; }

  async setStrategyParams(_params: {
    encryptedParams: Uint8Array;
    paramsHash:      Uint8Array;
  }): Promise<string> { return "stub-sig"; }

  async deposit(_params: {
    amountLamports: bigint;
    sourceChain:    number;
    bridgeless:     boolean;
    dwalletTxId:    Uint8Array;
    depositIndex:   bigint;
  }): Promise<string> { return "stub-sig"; }

  async withdraw(_amountLamports: bigint): Promise<string> { return "stub-sig"; }

  async executeStrategy(_params: {
    encryptedOp:     Uint8Array;
    opProof:         Uint8Array;
    protocolAccount: PublicKey;
    amountLamports:  bigint;
  }): Promise<string> { return "stub-sig"; }

  async returnAndHarvestYield(_lamports: bigint): Promise<string> { return "stub-sig"; }

  async updatePerformance(_encryptedSummary: Uint8Array): Promise<string> { return "stub-sig"; }
}

export { PROGRAM_ID };
