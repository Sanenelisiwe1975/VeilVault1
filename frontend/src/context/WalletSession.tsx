/**
 * WalletSession — holds Stellar wallet state in memory.
 * Supports two connection modes:
 *   - "secret-key": user enters S... key directly
 *   - "freighter":  browser extension (Freighter / Lobstr)
 *
 * Secret key is NEVER written to localStorage or any persistent store.
 */
import React, { createContext, useContext, useState, useCallback } from "react";
import { Keypair } from "@stellar/stellar-sdk";
import { signChallenge } from "../lib/stellar";

export type WalletType = "secret-key" | "freighter" | null;

interface WalletSessionCtx {
  address:     string | null;
  secretKey:   string | null;           // null when using Freighter
  walletType:  WalletType;
  isConnected: boolean;
  authToken:   string | null;           // session token from backend auth

  /** Connect with a raw Stellar secret key (S...). */
  connect:          (secretKey: string) => { address: string } | { error: string };
  /** Connect via Freighter browser wallet. */
  connectFreighter: () => Promise<{ address: string } | { error: string }>;
  /** Disconnect and clear all state. */
  disconnect:       () => void;

  /**
   * Sign a transaction XDR string.
   * - secret-key mode: signs synchronously using the stored keypair.
   * - Freighter mode:  calls the browser extension.
   * Returns the signed XDR.
   */
  signTransaction: (xdr: string) => Promise<string>;

  /** Sign an arbitrary challenge string (for auth). Secret-key mode only. */
  signChallengeFn: (challenge: string) => string | null;

  /** Store an auth token returned by the backend. */
  setAuthToken: (token: string | null) => void;
}

const Ctx = createContext<WalletSessionCtx>({
  address: null, secretKey: null, walletType: null, isConnected: false, authToken: null,
  connect:          () => ({ error: "no provider" }),
  connectFreighter: async () => ({ error: "no provider" }),
  disconnect:       () => {},
  signTransaction:  async () => { throw new Error("not connected"); },
  signChallengeFn:  () => null,
  setAuthToken:     () => {},
});

export function WalletSessionProvider({ children }: { children: React.ReactNode }) {
  const [address,    setAddress]    = useState<string | null>(null);
  const [secretKey,  setSecretKey]  = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType>(null);
  const [authToken,  setAuthToken]  = useState<string | null>(null);

  // ── Secret key connection ──────────────────────────────────────────────────

  const connect = useCallback((sk: string): { address: string } | { error: string } => {
    try {
      const addr = Keypair.fromSecret(sk.trim()).publicKey();
      setAddress(addr);
      setSecretKey(sk.trim());
      setWalletType("secret-key");
      return { address: addr };
    } catch {
      return { error: "Invalid Stellar secret key. Must start with 'S' and be 56 characters." };
    }
  }, []);

  // ── Freighter connection ───────────────────────────────────────────────────

  const connectFreighter = useCallback(async (): Promise<{ address: string } | { error: string }> => {
    try {
      // Dynamic import so the app still works without Freighter installed
      const freighter = await import("@stellar/freighter-api");

      const connected = await freighter.isConnected();
      if (!connected.isConnected) {
        return { error: "Freighter extension not found. Install it from freighter.app" };
      }

      const access = await freighter.requestAccess();
      if (access.error) return { error: access.error };

      const pkResult = await freighter.getPublicKey();
      if (pkResult.error) return { error: pkResult.error };

      const addr = pkResult.publicKey;
      setAddress(addr);
      setSecretKey(null);
      setWalletType("freighter");
      return { address: addr };
    } catch (e) {
      return { error: `Freighter error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }, []);

  // ── Disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    setAddress(null);
    setSecretKey(null);
    setWalletType(null);
    setAuthToken(null);
  }, []);

  // ── Sign transaction ───────────────────────────────────────────────────────

  const signTransaction = useCallback(async (xdr: string): Promise<string> => {
    if (walletType === "secret-key" && secretKey) {
      const { Keypair: KP, TransactionBuilder, Networks } = await import("@stellar/stellar-sdk");
      const { Transaction } = await import("@stellar/stellar-sdk");
      const kp  = KP.fromSecret(secretKey);
      const tx  = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as InstanceType<typeof Transaction>;
      tx.sign(kp);
      return tx.toXDR();
    }

    if (walletType === "freighter") {
      const freighter = await import("@stellar/freighter-api");
      const result = await freighter.signTransaction(xdr, { networkPassphrase: "Test SDF Network ; September 2015" });
      if (result.error) throw new Error(result.error);
      return result.signedTxXdr;
    }

    throw new Error("Wallet not connected");
  }, [walletType, secretKey]);

  // ── Sign challenge (auth) ──────────────────────────────────────────────────

  const signChallengeFn = useCallback((challenge: string): string | null => {
    if (!secretKey) return null;
    return signChallenge(challenge, secretKey);
  }, [secretKey]);

  return (
    <Ctx.Provider value={{
      address, secretKey, walletType, isConnected: !!address, authToken,
      connect, connectFreighter, disconnect, signTransaction, signChallengeFn, setAuthToken,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWalletSession() { return useContext(Ctx); }
