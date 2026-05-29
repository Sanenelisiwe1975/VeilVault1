import { useState, useCallback } from "react";
import type { DepositWithdraw } from "../types";

interface UseDepositFormReturn {
  activeAction: DepositWithdraw;
  amount:       string;
  setActiveAction: (action: DepositWithdraw) => void;
  setAmount:       (amount: string)          => void;
  applyPercent:    (pct: number)             => void;
  handleConfirm:   () => void;
}

const WALLET_BALANCE = 12.45; // USDC — would come from a wallet provider in prod

/**
 * Manages the Deposit / Withdraw panel state on the Vault Detail page.
 */
export function useDepositForm(): UseDepositFormReturn {
  const [activeAction, setActiveAction] = useState<DepositWithdraw>("Deposit");
  const [amount, setAmount] = useState<string>("0.00");

  const applyPercent = useCallback((pct: number) => {
    const value = ((WALLET_BALANCE * pct) / 100).toFixed(2);
    setAmount(value);
  }, []);

  const handleConfirm = useCallback(() => {
    // Wire up to wallet provider / contract call in production
    console.log(`[VeilVault] ${activeAction} confirmed: ${amount} USDC`);
  }, [activeAction, amount]);

  return { activeAction, amount, setActiveAction, setAmount, applyPercent, handleConfirm };
}
