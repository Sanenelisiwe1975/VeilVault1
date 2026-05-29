import { useState, useCallback } from "react";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface OnChainVaultState {
  totalDepositedSol:  number;
  netValueSol:        number;
  yieldEarnedSol:     number;
  isPaused:           boolean;
  strategyParamsSet:  boolean;
  perfSummaryStored:  boolean;
  strategyParamsHash: Uint8Array;
}

export interface UseVaultReturn {
  vaultExists:      boolean;
  dwalletApproved:  boolean;
  vault:            OnChainVaultState | null;
  walletBalanceSol: number;
  loading:          boolean;
  error:            string | null;
  txSig:            string | null;
  setupStep:        string | null;
  setupVault:             () => Promise<void>;
  depositSol:             (sol: number) => Promise<void>;
  withdrawSol:            (sol: number) => Promise<void>;
  executeStrategy:        (sol: number) => Promise<void>;
  harvestYield:           (returnedSol: number) => Promise<void>;
  updatePerformance:      () => Promise<void>;
  updateStrategyParams:   (maxDrawdownBps: number, rebalanceBps: number, stopLossBps: number) => Promise<void>;
  refresh:                () => Promise<void>;
}

const MOCK_VAULT: OnChainVaultState = {
  totalDepositedSol:  3.5,
  netValueSol:        3.82,
  yieldEarnedSol:     0.32,
  isPaused:           false,
  strategyParamsSet:  true,
  perfSummaryStored:  true,
  strategyParamsHash: new Uint8Array(32).fill(0xab),
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVault(): UseVaultReturn {
  const [vault,    setVault]    = useState<OnChainVaultState>(MOCK_VAULT);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [txSig,    setTxSig]    = useState<string | null>(null);
  const [setupStep, setSetupStep] = useState<string | null>(null);

  const simulateTx = useCallback(async (label: string, updateFn?: () => void) => {
    setLoading(true); setError(null); setTxSig(null);
    try {
      await new Promise(r => setTimeout(r, 800));
      const sig = "demo" + Math.random().toString(36).slice(2, 10);
      setTxSig(sig);
      updateFn?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const setupVault = useCallback(async () => {
    setLoading(true); setError(null); setTxSig(null);
    const steps = [
      "1/5  Generating FHE keys…",
      "2/5  Creating Ika dWallet…",
      "3/5  Approving dWallet…",
      "4/5  Adding yield protocol…",
      "5/5  Encrypting strategy params…",
    ];
    for (const step of steps) {
      setSetupStep(step);
      await new Promise(r => setTimeout(r, 600));
    }
    setSetupStep(null);
    setTxSig("setup" + Math.random().toString(36).slice(2, 10));
    setLoading(false);
  }, []);

  const depositSol = useCallback(async (sol: number) => {
    await simulateTx("deposit", () =>
      setVault(v => ({
        ...v,
        totalDepositedSol: v.totalDepositedSol + sol,
        netValueSol:       v.netValueSol + sol,
      }))
    );
  }, [simulateTx]);

  const withdrawSol = useCallback(async (sol: number) => {
    await simulateTx("withdraw", () =>
      setVault(v => ({
        ...v,
        totalDepositedSol: Math.max(0, v.totalDepositedSol - sol),
        netValueSol:       Math.max(0, v.netValueSol - sol),
      }))
    );
  }, [simulateTx]);

  const executeStrategy = useCallback(async (_sol: number) => {
    await simulateTx("executeStrategy");
  }, [simulateTx]);

  const harvestYield = useCallback(async (returnedSol: number) => {
    await simulateTx("harvestYield", () =>
      setVault(v => ({
        ...v,
        yieldEarnedSol: v.yieldEarnedSol + returnedSol,
        netValueSol:    v.netValueSol + returnedSol,
      }))
    );
  }, [simulateTx]);

  const updatePerformance = useCallback(async () => {
    await simulateTx("updatePerformance", () =>
      setVault(v => ({ ...v, perfSummaryStored: true }))
    );
  }, [simulateTx]);

  const updateStrategyParams = useCallback(async (
    _maxDrawdownBps: number, _rebalanceBps: number, _stopLossBps: number,
  ) => {
    await simulateTx("updateStrategyParams", () =>
      setVault(v => ({ ...v, strategyParamsSet: true }))
    );
  }, [simulateTx]);

  return {
    vaultExists:      true,
    dwalletApproved:  true,
    vault,
    walletBalanceSol: 5.0,
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
    refresh: async () => {},
  };
}
