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
import { fetchSep10Challenge, signSep10ChallengeWithSecret, submitSep10Token } from "../lib/stellar";
import { registerPasskey, loginPasskey as loginPasskeyRequest } from "../lib/passkey";
import { setSessionToken } from "../lib/api";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
const PASSKEY_WALLET_STORAGE_KEY = "veilvault_passkey_wallet";

export type WalletType = "secret-key" | "freighter" | "passkey" | null;

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
  /** Register a brand-new passkey wallet (deploys a smart-wallet contract). */
  registerPasskeyWallet: (userName: string) => Promise<{ address: string } | { error: string }>;
  /** Sign in with a previously registered passkey wallet address. */
  loginPasskeyWallet:    (walletAddress: string) => Promise<{ address: string } | { error: string }>;
  /** Address of the last passkey wallet registered on this device, if any. */
  storedPasskeyWallet:   string | null;
  /** Disconnect and clear all state. */
  disconnect:       () => void;

  /**
   * Sign a transaction XDR string.
   * - secret-key mode: signs synchronously using the stored keypair.
   * - Freighter mode:  calls the browser extension.
   * Returns the signed XDR.
   */
  signTransaction: (xdr: string) => Promise<string>;

  /** Store an auth token returned by the backend. */
  setAuthToken: (token: string | null) => void;
}

const Ctx = createContext<WalletSessionCtx>({
  address: null, secretKey: null, walletType: null, isConnected: false, authToken: null,
  connect:          () => ({ error: "no provider" }),
  connectFreighter: async () => ({ error: "no provider" }),
  registerPasskeyWallet: async () => ({ error: "no provider" }),
  loginPasskeyWallet:    async () => ({ error: "no provider" }),
  storedPasskeyWallet:   null,
  disconnect:       () => {},
  signTransaction:  async () => { throw new Error("not connected"); },
  setAuthToken:     () => {},
});

export function WalletSessionProvider({ children }: { children: React.ReactNode }) {
  const [address,    setAddress]    = useState<string | null>(null);
  const [secretKey,  setSecretKey]  = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType>(null);
  const [authToken,  setAuthToken]  = useState<string | null>(null);

  // ── Background auth (SEP-10: fetch challenge tx → sign → exchange for JWT) ──

  const authenticate = useCallback(async (addr: string, signXdr: (xdr: string) => Promise<string>) => {
    try {
      const { transaction } = await fetchSep10Challenge(API_BASE, addr);
      const signedXdr = await signXdr(transaction);
      const token = await submitSep10Token(API_BASE, signedXdr);
      setAuthToken(token);
      setSessionToken(token);
    } catch {
      // Auth is optional — app still works with the static API key
    }
  }, []);

  // ── Secret key connection ──────────────────────────────────────────────────

  const connect = useCallback((sk: string): { address: string } | { error: string } => {
    try {
      const trimmed = sk.trim();
      const addr = Keypair.fromSecret(trimmed).publicKey();
      setAddress(addr);
      setSecretKey(trimmed);
      setWalletType("secret-key");
      authenticate(addr, async (xdr) => signSep10ChallengeWithSecret(xdr, trimmed)); // fire-and-forget
      return { address: addr };
    } catch {
      return { error: "Invalid Stellar secret key. Must start with 'S' and be 56 characters." };
    }
  }, [authenticate]);

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

      // Freighter v2: getAddress() (v1 used getPublicKey())
      const addrResult = await freighter.getAddress();
      if (addrResult.error) return { error: addrResult.error };

      const addr = addrResult.address;
      setAddress(addr);
      setSecretKey(null);
      setWalletType("freighter");
      authenticate(addr, async (xdr) => {
        const result = await freighter.signTransaction(xdr, { networkPassphrase: "Test SDF Network ; September 2015" });
        if (result.error) throw new Error(typeof result.error === "string" ? result.error : "Freighter signing failed");
        return result.signedTxXdr;
      }); // fire-and-forget
      return { address: addr };
    } catch (e) {
      return { error: `Freighter error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }, [authenticate]);

  // ── Passkey (account abstraction) connection ───────────────────────────────

  const registerPasskeyWallet = useCallback(async (userName: string): Promise<{ address: string } | { error: string }> => {
    try {
      const { walletAddress, token } = await registerPasskey(API_BASE, userName);
      setAddress(walletAddress);
      setSecretKey(null);
      setWalletType("passkey");
      setAuthToken(token);
      setSessionToken(token);
      localStorage.setItem(PASSKEY_WALLET_STORAGE_KEY, walletAddress);
      return { address: walletAddress };
    } catch (e) {
      return { error: `Passkey registration failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }, []);

  const loginPasskeyWallet = useCallback(async (walletAddress: string): Promise<{ address: string } | { error: string }> => {
    try {
      const result = await loginPasskeyRequest(API_BASE, walletAddress);
      setAddress(result.walletAddress);
      setSecretKey(null);
      setWalletType("passkey");
      setAuthToken(result.token);
      setSessionToken(result.token);
      localStorage.setItem(PASSKEY_WALLET_STORAGE_KEY, result.walletAddress);
      return { address: result.walletAddress };
    } catch (e) {
      return { error: `Passkey sign-in failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }, []);

  const storedPasskeyWallet = typeof window !== "undefined"
    ? localStorage.getItem(PASSKEY_WALLET_STORAGE_KEY)
    : null;

  // ── Disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    setAddress(null);
    setSecretKey(null);
    setWalletType(null);
    setAuthToken(null);
    setSessionToken(null);  // clear the global api.ts token
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

    if (walletType === "passkey") {
      // Signing in is fully supported (issues a session JWT, no transaction
      // involved). Authorizing an actual on-chain transaction as a passkey
      // wallet requires a WebAuthn ceremony per-transaction plus DER/low-S
      // signature normalization before submitting to the smart-wallet
      // contract's __check_auth — not yet wired up.
      throw new Error("Signing transactions with a passkey wallet isn't supported yet — sign in is.");
    }

    throw new Error("Wallet not connected");
  }, [walletType, secretKey]);

  return (
    <Ctx.Provider value={{
      address, secretKey, walletType, isConnected: !!address, authToken,
      connect, connectFreighter, registerPasskeyWallet, loginPasskeyWallet, storedPasskeyWallet,
      disconnect, signTransaction, setAuthToken,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWalletSession() { return useContext(Ctx); }
