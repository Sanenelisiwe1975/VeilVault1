import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PoolState {
  contractId:   string;
  denomination: string;   // stroops
  asset:        string;
  nextIndex:    number;
  currentRoot:  string;
  isPaused:     boolean;
  circuitId:    string;
}

export interface MerklePath {
  pathElements: string[]; // 20 × 64-char hex, leaf → root
  pathIndices:  boolean[]; // 20 — true = current node is right child at that level
  root:         string;    // 64-char hex
}

export interface TreeState {
  next_index:   number;
  depth:        number;
  current_root: string;
}

export interface DepositNote {
  id:          string;       // local UUID
  secret:      string;       // 64 hex chars
  nullifier:   string;       // 64 hex chars
  commitment:  string;       // 64 hex chars
  nullifierHash: string;     // 64 hex chars
  leafIndex:   number;
  txHash:      string;
  depositedAt: number;       // unix ts
  spent:       boolean;
}

export interface WithdrawResult {
  txHash:    string;
  recipient: string;
}

const NOTES_KEY = "vv_pool_notes";

function loadNotes(): DepositNote[] {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]"); }
  catch { return []; }
}
function saveNotes(notes: DepositNote[]) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

// Generate a cryptographically random 32-byte hex string
function randHex64(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_STATE: PoolState = {
  contractId:   "CAE3XBP6E5DFLAEZXJNYQ2HMJWKRIXP44U2EE6E5VRGLLGCLS4PO24ZI",
  denomination: "10000000",
  asset:        "XLM",
  nextIndex:    2,
  currentRoot:  "12871d08259e5d13d07cd80b07edcb37b338165c2098879f06d836e314d2d01a",
  isPaused:     false,
  circuitId:    "0101010101010101010101010101010101010101010101010101010101010101",
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePrivacyPool() {
  const [state,     setState]     = useState<PoolState | null>(null);
  const [notes,     setNotes]     = useState<DepositNote[]>(loadNotes);
  const [loading,   setLoading]   = useState(true);
  const [usingMock, setUsingMock] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: PoolState }>("/privacy-pool/state");
      setState(res.data);
      setUsingMock(false);
    } catch {
      setState(MOCK_STATE);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Deposit ────────────────────────────────────────────────────────────────

  const deposit = useCallback(async (depositorSecret: string): Promise<DepositNote> => {
    const secret    = randHex64();
    const nullifier = randHex64();

    let commitment: string;
    let nullifierHash: string;
    let leafIndex: number;
    let txHash: string;

    if (usingMock) {
      // Simulate commitment derivation + deposit
      await new Promise(r => setTimeout(r, 1200));
      commitment    = randHex64();
      nullifierHash = randHex64();
      leafIndex     = (state?.nextIndex ?? 0);
      txHash        = randHex64();
    } else {
      // 1. Compute commitment
      const commitRes = await api.post<{ success: boolean; data: { commitment: string; nullifierHash: string } }>(
        "/privacy-pool/commitment",
        { secret, nullifier },
      );
      commitment    = commitRes.data.commitment;
      nullifierHash = commitRes.data.nullifierHash;

      // 2. Deposit on-chain
      const depRes = await api.post<{ success: boolean; data: { leafIndex: number; txHash: string } }>(
        "/privacy-pool/deposit",
        { depositorSecret, commitment },
      );
      leafIndex = depRes.data.leafIndex;
      txHash    = depRes.data.txHash;
    }

    const note: DepositNote = {
      id:           crypto.randomUUID(),
      secret,
      nullifier,
      commitment,
      nullifierHash,
      leafIndex,
      txHash,
      depositedAt:  Math.floor(Date.now() / 1000),
      spent:        false,
    };

    const updated = [note, ...notes];
    setNotes(updated);
    saveNotes(updated);
    await load();
    return note;
  }, [usingMock, notes, state, load]);

  // ── Merkle path (for proving) ──────────────────────────────────────────────

  const getMerklePath = useCallback(async (leafIndex: number): Promise<MerklePath> => {
    const res = await api.get<{ success: boolean; data: MerklePath }>(`/privacy-pool/merkle-path/${leafIndex}`);
    return res.data;
  }, []);

  // ── Withdraw ───────────────────────────────────────────────────────────────

  const withdraw = useCallback(async (params: {
    note:            DepositNote;
    recipientSecret: string;
    attestationId:   string;
    root:            string;
  }): Promise<WithdrawResult> => {
    if (usingMock) {
      await new Promise(r => setTimeout(r, 1400));
      const result = { txHash: randHex64(), recipient: "G...demo" };
      markNoteSpent(params.note.id);
      return result;
    }

    const res = await api.post<{ success: boolean; data: WithdrawResult }>("/privacy-pool/withdraw", {
      recipientSecret: params.recipientSecret,
      root:            params.root,
      nullifierHash:   params.note.nullifierHash,
      attestationId:   params.attestationId,
    });
    markNoteSpent(params.note.id);
    return res.data;
  }, [usingMock]); // eslint-disable-line

  const markNoteSpent = (id: string) => {
    setNotes(prev => {
      const next = prev.map(n => n.id === id ? { ...n, spent: true } : n);
      saveNotes(next);
      return next;
    });
  };

  const deleteNote = (id: string) => {
    setNotes(prev => {
      const next = prev.filter(n => n.id !== id);
      saveNotes(next);
      return next;
    });
  };

  const xlmDenomination = state ? (Number(state.denomination) / 1e7).toFixed(0) : "10";

  return {
    state, notes, loading, usingMock,
    xlmDenomination,
    deposit, withdraw, deleteNote, getMerklePath,
    refresh: load,
  };
}
