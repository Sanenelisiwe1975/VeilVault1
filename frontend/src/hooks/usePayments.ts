import { useState, useCallback } from "react";
import { api } from "../lib/api";
import { sendPayment, sendPaymentFreighter } from "../lib/stellar";
import { useWalletSession } from "../context/WalletSession";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentStatus = "pending" | "confirmed" | "failed";
export type PaymentDirection = "sent" | "received";

export interface Payment {
  id:          string;
  direction:   PaymentDirection;
  recipient:   string;        // Stellar address or phone
  sender?:     string;
  amount:      string;        // stroops
  asset:       string;        // "XLM" | "USDC"
  memo?:       string;
  txHash?:     string;
  status:      PaymentStatus;
  createdAt:   number;
  private:     boolean;       // routed through privacy pool
}

export interface RecurringPayment {
  id:          string;
  recipient:   string;
  amount:      string;
  asset:       string;
  memo?:       string;
  interval:    "daily" | "weekly" | "monthly";
  nextRun:     number;        // unix ts
  active:      boolean;
  createdAt:   number;
}

// ─── Corridor rates (live data would come from a price feed) ──────────────────

export interface Corridor {
  from:       string;
  to:         string;
  flag:       string;
  rate:       number;    // 1 XLM = N local currency
  fee:        string;    // e.g. "< 0.001 XLM"
  time:       string;    // settlement time
  popular:    boolean;
}

export const CORRIDORS: Corridor[] = [
  { from: "XLM", to: "ZAR", flag: "🇿🇦", rate: 3.8,   fee: "< 0.001 XLM", time: "< 5s",  popular: true  },
  { from: "XLM", to: "NGN", flag: "🇳🇬", rate: 520,   fee: "< 0.001 XLM", time: "< 5s",  popular: true  },
  { from: "XLM", to: "KES", flag: "🇰🇪", rate: 8.5,   fee: "< 0.001 XLM", time: "< 5s",  popular: true  },
  { from: "XLM", to: "GHS", flag: "🇬🇭", rate: 4.2,   fee: "< 0.001 XLM", time: "< 5s",  popular: false },
  { from: "XLM", to: "TZS", flag: "🇹🇿", rate: 165,   fee: "< 0.001 XLM", time: "< 5s",  popular: false },
  { from: "XLM", to: "ETB", flag: "🇪🇹", rate: 38,    fee: "< 0.001 XLM", time: "< 5s",  popular: false },
];

// Local storage 

const PAY_KEY = "vv_payments";
const REC_KEY = "vv_recurring";

function loadPayments():   Payment[]          { try { return JSON.parse(localStorage.getItem(PAY_KEY) ?? "[]"); } catch { return []; } }
function loadRecurring():  RecurringPayment[] { try { return JSON.parse(localStorage.getItem(REC_KEY) ?? "[]"); } catch { return []; } }
function save(key: string, data: unknown)     { localStorage.setItem(key, JSON.stringify(data)); }

// Mock history 

const MOCK_HISTORY: Payment[] = [
  { id: "1", direction: "sent",     recipient: "GBTCO...XK7P", amount: "100000000", asset: "XLM",  memo: "Rent",         txHash: "abc123", status: "confirmed", createdAt: Date.now()/1000 - 86400*2, private: false },
  { id: "2", direction: "received", recipient: "GCLFF...AWE4", sender: "GCEZI...R9MQ", amount: "50000000", asset: "XLM", memo: "Stokvel",     txHash: "def456", status: "confirmed", createdAt: Date.now()/1000 - 86400*5, private: false },
  { id: "3", direction: "sent",     recipient: "Pool",          amount: "10000000",  asset: "XLM",  memo: "Shielded",     txHash: "ghi789", status: "confirmed", createdAt: Date.now()/1000 - 86400*8, private: true  },
  { id: "4", direction: "sent",     recipient: "+27811234567",  amount: "25000000",  asset: "XLM",  memo: "Grocery money",txHash: "jkl012", status: "confirmed", createdAt: Date.now()/1000 - 86400*12, private: false},
];

// Hook 

export function usePayments() {
  const { address, secretKey, walletType, signTransaction } = useWalletSession();
  const [payments,   setPayments]   = useState<Payment[]>(() => {
    const stored = loadPayments();
    return stored.length > 0 ? stored : MOCK_HISTORY;
  });
  const [recurring,  setRecurring]  = useState<RecurringPayment[]>(loadRecurring);
  const [sending,    setSending]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const send = useCallback(async (params: {
    senderSecret: string;
    recipient:    string;
    amount:       string;   // stroops
    asset:        string;
    memo?:        string;
    private?:     boolean;
  }): Promise<Payment> => {
    setSending(true);
    setError(null);
    try {
      let txHash: string;
      const xlmAmount = (Number(params.amount) / 1e7).toFixed(7);

      if (walletType === "freighter" && address) {
        // Freighter: build tx, sign via extension, submit
        txHash = await sendPaymentFreighter({
          from:          address,
          to:            params.recipient,
          amount:        xlmAmount,
          asset:         params.asset as "XLM" | "USDC",
          memo:          params.memo,
          signFreighter: signTransaction,
        });
      } else if (walletType === "secret-key" && (params.senderSecret || secretKey)) {
        // Secret key: sign and submit directly
        txHash = await sendPayment({
          fromSecret: params.senderSecret || secretKey!,
          to:         params.recipient,
          amount:     xlmAmount,
          asset:      params.asset as "XLM" | "USDC",
          memo:       params.memo,
        });
      } else {
        // No wallet connected — demo simulation
        await new Promise(r => setTimeout(r, 1000));
        txHash = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, "0")).join("");
      }

      const payment: Payment = {
        id:         crypto.randomUUID(),
        direction:  "sent",
        recipient:  params.recipient,
        amount:     params.amount,
        asset:      params.asset,
        memo:       params.memo,
        txHash,
        status:     "confirmed",
        createdAt:  Math.floor(Date.now() / 1000),
        private:    params.private ?? false,
      };

      setPayments(prev => {
        const next = [payment, ...prev];
        save(PAY_KEY, next);
        return next;
      });
      return payment;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setSending(false);
    }
  }, []);

  const addRecurring = useCallback((r: Omit<RecurringPayment, "id" | "createdAt">) => {
    const entry: RecurringPayment = { ...r, id: crypto.randomUUID(), createdAt: Math.floor(Date.now() / 1000) };
    setRecurring(prev => { const next = [entry, ...prev]; save(REC_KEY, next); return next; });
  }, []);

  const toggleRecurring = useCallback((id: string) => {
    setRecurring(prev => {
      const next = prev.map(r => r.id === id ? { ...r, active: !r.active } : r);
      save(REC_KEY, next);
      return next;
    });
  }, []);

  const deleteRecurring = useCallback((id: string) => {
    setRecurring(prev => { const next = prev.filter(r => r.id !== id); save(REC_KEY, next); return next; });
  }, []);

  const generateRequest = useCallback((params: { amount: string; asset: string; memo?: string; address: string }) => {
    return `stellar:${params.address}?amount=${Number(params.amount)/1e7}&asset=${params.asset}&memo=${params.memo ?? ""}`;
  }, []);

  const xlm = (stroops: string) => (Number(stroops) / 1e7).toFixed(2);

  return {
    payments, recurring, sending, error,
    send, addRecurring, toggleRecurring, deleteRecurring,
    generateRequest, xlm,
  };
}
