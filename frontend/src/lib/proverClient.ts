/**
 * Promise-based wrapper around proverWorker.ts — generates a withdrawal
 * proof in a background thread so the ~6,600-constraint Groth16 proof
 * doesn't block the UI. The first call also downloads the ~70MB proving key
 * once (cached afterward via the Cache API), so it can take a while; use
 * onProgress to surface that to the user.
 */
export interface ProveParams {
  secretHex: string;
  nullifierHex: string;
  pathElementsJson: string;
  pathIndicesJson: string;
  rootHex: string;
  recipientHex: string;
  denomination: number;
  circuitIdHex: string;
  poolAddress: string;
  proverAddress: string;
}

export interface WithdrawalProof {
  circuit_id: string;
  proof: { a: string; b: string; c: string };
  public_inputs: string[];
}

export type ProveProgress = "downloading-key" | "proving";

export function proveWithdrawal(
  params: ProveParams,
  onProgress?: (stage: ProveProgress) => void,
): Promise<WithdrawalProof> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./proverWorker.ts", import.meta.url), { type: "module" });

    worker.onmessage = (ev: MessageEvent) => {
      const msg = ev.data;
      if (msg.type === "progress") { onProgress?.(msg.stage); return; }
      if (msg.type === "done") { resolve(msg.proof as WithdrawalProof); worker.terminate(); return; }
      if (msg.type === "error") { reject(new Error(msg.message)); worker.terminate(); }
    };
    worker.onerror = (e) => { reject(new Error(e.message)); worker.terminate(); };

    worker.postMessage({ type: "prove", ...params });
  });
}
