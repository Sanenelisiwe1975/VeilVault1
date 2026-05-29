/**
 * WalletSession — holds the user's Stellar address + secret key in memory only.
 * Secret key is NEVER written to localStorage or any persistent store.
 */
import React, { createContext, useContext, useState, useCallback } from "react";
import { Keypair } from "@stellar/stellar-sdk";

interface WalletSessionCtx {
  address:    string | null;
  secretKey:  string | null;
  isConnected:boolean;
  connect:    (secretKey: string) => { address: string } | { error: string };
  disconnect: () => void;
}

const Ctx = createContext<WalletSessionCtx>({
  address:     null,
  secretKey:   null,
  isConnected: false,
  connect:     () => ({ error: "no provider" }),
  disconnect:  () => {},
});

export function WalletSessionProvider({ children }: { children: React.ReactNode }) {
  const [address,   setAddress]   = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);

  const connect = useCallback((sk: string): { address: string } | { error: string } => {
    try {
      const kp   = Keypair.fromSecret(sk.trim());
      const addr = kp.publicKey();
      setAddress(addr);
      setSecretKey(sk.trim());
      return { address: addr };
    } catch {
      return { error: "Invalid Stellar secret key. It should start with 'S' and be 56 characters." };
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setSecretKey(null);
  }, []);

  return (
    <Ctx.Provider value={{ address, secretKey, isConnected: !!address, connect, disconnect }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWalletSession() {
  return useContext(Ctx);
}
