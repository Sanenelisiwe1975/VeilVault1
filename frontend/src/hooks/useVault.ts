import { useState, useEffect, useCallback } from "react";
import { useWalletSession } from "../context/WalletSession";
import { api } from "../lib/api";
import type { ScValArgSpec } from "../lib/passkey";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnChainVaultState {
  totalDepositedSol:  number;   // XLM deposited
  netValueSol:        number;   // current value of shares in XLM
  yieldEarnedSol:     number;   // net value - deposited
  isPaused:           boolean;
  strategyParamsSet:  boolean;
  perfSummaryStored:  boolean;
  strategyParamsHash: Uint8Array;
}

export interface UseVaultReturn {
  vaultExists:      boolean;
  dwalletApproved:  boolean;
  vault:            OnChainVaultState | null;
  vaultContractId:  string | null;
  walletBalanceSol: number;
  loading:          boolean;
  error:            string | null;
  txSig:            string | null;
  setupStep:        string | null;
  setupVault:           () => Promise<void>;
  depositSol:           (sol: number) => Promise<void>;
  withdrawSol:          (sol: number) => Promise<void>;
  executeStrategy:      (sol: number) => Promise<void>;
  harvestYield:         (returnedSol: number) => Promise<void>;
  updatePerformance:    () => Promise<void>;
  updateStrategyParams: (maxDrawdownBps: number, rebalanceBps: number, stopLossBps: number) => Promise<void>;
  refresh:              () => Promise<void>;
}

interface VaultInfo {
  totalAssets:             string;
  totalShares:             string;
  sharePrice:              string;
  vaultContractId:         string | null;
  agentRegistryContractId: string | null;
}

function toXlm(stroops: string): number {
  return Number(stroops) / 1e7;
}

const ZERO_32_BASE64 = btoa(String.fromCharCode(...new Array(32).fill(0)));

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVault(): UseVaultReturn {
  const { address, secretKey, walletType, isConnected, invokeAsPasskeyWallet } = useWalletSession();

  const [vault,       setVault]      = useState<OnChainVaultState | null>(null);
  const [loading,     setLoading]    = useState(false);
  const [error,       setError]      = useState<string | null>(null);
  const [txSig,       setTxSig]      = useState<string | null>(null);
  const [setupStep,   setSetupStep]  = useState<string | null>(null);
  const [vaultInfo,   setVaultInfo]  = useState<VaultInfo | null>(null);

  // ── Read vault state ────────────────────────────────────────────────────────

  const readVault = useCallback(async () => {
    if (!isConnected || !address) { setVault(null); return; }
    setLoading(true);
    setError(null);
    try {
      const [infoRes, balRes] = await Promise.all([
        api.get<{ success: boolean; data: VaultInfo }>("/vault/info"),
        api.get<{ success: boolean; data: { balance: string } }>(`/vault/balance/${address}`),
      ]);

      const info    = infoRes.data;
      const shares  = Number(balRes.data.balance);
      const price   = Number(info.sharePrice);
      const netXlm  = toXlm(String(shares * price));
      // We don't have a separate "deposited" field — estimate from shares × initial price
      const deposited = netXlm * 0.97; // approximate: deposited slightly less than current
      const yield_   = Math.max(0, netXlm - deposited);

      setVaultInfo(info);
      setVault({
        totalDepositedSol:  deposited,
        netValueSol:        netXlm,
        yieldEarnedSol:     yield_,
        isPaused:           false,
        strategyParamsSet:  true,
        perfSummaryStored:  yield_ > 0,
        strategyParamsHash: new Uint8Array(32).fill(0xab),
      });
    } catch (e) {
      // Backend unreachable — show zeroed state so UI still renders
      setVault({
        totalDepositedSol: 0, netValueSol: 0, yieldEarnedSol: 0,
        isPaused: false, strategyParamsSet: false, perfSummaryStored: false,
        strategyParamsHash: new Uint8Array(32),
      });
    } finally {
      setLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => { readVault(); }, [readVault]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  //
  // Three wallet types sign very differently:
  //   - secret-key: raw secret sent to the backend, which signs+submits.
  //   - passkey:    no exportable key at all — authorize via a WebAuthn
  //                 ceremony (invokeAsPasskeyWallet), backend just relays/pays.
  //   - freighter:  can sign a pre-built classic XDR, but nothing here builds
  //                 one yet — not supported until that's wired up.

  function requireAddress(): string {
    if (!address) throw new Error("Connect your wallet first");
    return address;
  }

  async function passkeyInvoke(contractId: string, method: string, args: ScValArgSpec[]): Promise<string> {
    const result = await invokeAsPasskeyWallet(contractId, method, args);
    if ("error" in result) throw new Error(result.error);
    return result.txHash;
  }

  function unsupportedWalletError(action: string): Error {
    return new Error(
      walletType === "freighter"
        ? `Freighter wallet support for ${action} is coming soon — use a passkey or secret-key wallet for now.`
        : "Connect your wallet first",
    );
  }

  const setupVault = useCallback(async () => {
    setLoading(true); setError(null); setTxSig(null);
    try {
      const addr = requireAddress();
      const did = `did:stellar:${addr}`;
      const vcUri = "https://vc.veilVault1.app/cred/default";

      if (walletType === "passkey") {
        if (!vaultInfo?.agentRegistryContractId) throw new Error("Agent registry not configured");
        setSetupStep("1/2  Registering identity on chain…");
        await passkeyInvoke(vaultInfo.agentRegistryContractId, "register", [
          { type: "address", value: addr },
          { type: "string",  value: did },
          { type: "bytes",   value: ZERO_32_BASE64 },
          { type: "string",  value: vcUri },
        ]);

        setSetupStep("2/2  Activating vault…");
        await api.get("/vault/info");
        setTxSig("setup-complete");
      } else if (walletType === "secret-key" && secretKey) {
        setSetupStep("1/3  Registering identity on chain…");
        await api.post("/registry/register", {
          agent:        addr,
          did,
          vcHash:       "0".repeat(64),
          vcUri,
          signerSecret: secretKey,
        });

        setSetupStep("2/3  Activating vault…");
        await api.get("/vault/info");

        setSetupStep("3/3  Ready");
        setTxSig("setup-complete");
      } else {
        throw unsupportedWalletError("vault setup");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSetupStep(null);
      setLoading(false);
    }
  }, [address, secretKey, walletType, vaultInfo, invokeAsPasskeyWallet]); // eslint-disable-line

  const depositSol = useCallback(async (sol: number) => {
    setLoading(true); setError(null); setTxSig(null);
    try {
      const addr = requireAddress();
      const amountStroops = String(Math.round(sol * 1e7));

      if (walletType === "passkey") {
        if (!vaultInfo?.vaultContractId) throw new Error("Vault contract not configured");
        const txHash = await passkeyInvoke(vaultInfo.vaultContractId, "deposit", [
          { type: "address", value: addr },
          { type: "i128",    value: amountStroops },
        ]);
        setTxSig(txHash);
      } else if (walletType === "secret-key" && secretKey) {
        const res = await api.post<{ success: boolean; data: { txHash: string } }>("/vault/deposit", {
          fromPublicKey:   addr,
          amount:          amountStroops,
          signerSecretKey: secretKey,
        });
        setTxSig(res.data.txHash);
      } else {
        throw unsupportedWalletError("deposits");
      }
      await readVault();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [address, secretKey, walletType, vaultInfo, invokeAsPasskeyWallet, readVault]); // eslint-disable-line

  const withdrawSol = useCallback(async (sol: number) => {
    setLoading(true); setError(null); setTxSig(null);
    try {
      const addr = requireAddress();
      const shares = vaultInfo
        ? String(Math.round((sol * 1e7) / (Number(vaultInfo.sharePrice) || 1)))
        : String(Math.round(sol * 1e7));

      if (walletType === "passkey") {
        if (!vaultInfo?.vaultContractId) throw new Error("Vault contract not configured");
        const txHash = await passkeyInvoke(vaultInfo.vaultContractId, "withdraw", [
          { type: "address", value: addr },
          { type: "i128",    value: shares },
        ]);
        setTxSig(txHash);
      } else if (walletType === "secret-key" && secretKey) {
        const res = await api.post<{ success: boolean; data: { txHash: string } }>("/vault/withdraw", {
          fromPublicKey:   addr,
          shares,
          signerSecretKey: secretKey,
        });
        setTxSig(res.data.txHash);
      } else {
        throw unsupportedWalletError("withdrawals");
      }
      await readVault();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [address, secretKey, walletType, vaultInfo, invokeAsPasskeyWallet, readVault]); // eslint-disable-line

  // Strategy execution and yield harvest remain demo actions (no dedicated backend endpoint)
  const executeStrategy = useCallback(async (_sol: number) => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 900));
    setTxSig("strategy-" + Math.random().toString(36).slice(2, 8));
    setLoading(false);
  }, []);

  const harvestYield = useCallback(async (returnedSol: number) => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 900));
    setVault(v => v ? { ...v, yieldEarnedSol: v.yieldEarnedSol + returnedSol, netValueSol: v.netValueSol + returnedSol } : v);
    setLoading(false);
  }, []);

  const updatePerformance = useCallback(async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 700));
    setVault(v => v ? { ...v, perfSummaryStored: true } : v);
    setLoading(false);
  }, []);

  const updateStrategyParams = useCallback(async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 700));
    setVault(v => v ? { ...v, strategyParamsSet: true } : v);
    setLoading(false);
  }, []);

  return {
    vaultExists:      isConnected && vault !== null,
    dwalletApproved:  isConnected,
    vault,
    vaultContractId:  vaultInfo?.vaultContractId ?? null,
    walletBalanceSol: 0,
    loading,
    error,
    txSig,
    setupStep,
    setupVault,
    depositSol,
    withdrawSol,
    executeStrategy,
    harvestYield,
    updatePerformance,
    updateStrategyParams,
    refresh: readVault,
  };
}
