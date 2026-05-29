/**
 * Ika dWallet integration stub.
 * Replace with the real Ika SDK for production.
 */
import { PublicKey } from "@solana/web3.js";

export const CHAIN_SOLANA   = 0;
export const CHAIN_BITCOIN  = 1;
export const CHAIN_ETHEREUM = 2;

export interface DWalletResult {
  dwalletId:     Uint8Array;
  dwalletPubkey: Uint8Array;
  chainBitmap:   number;
}

export async function createDWallet(_params: {
  chains:      number[];
  vaultPubkey: PublicKey;
  userPubkey:  PublicKey;
}): Promise<DWalletResult> {
  return {
    dwalletId:     new Uint8Array(32).fill(0xde),
    dwalletPubkey: new Uint8Array(33).fill(0xda),
    chainBitmap:   0b111,
  };
}
