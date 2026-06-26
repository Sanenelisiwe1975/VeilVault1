/**
 * Runs the VeilPool withdrawal prover entirely in this worker thread.
 * secret/nullifier are passed in via postMessage and never leave the
 * browser — same security model as running the Rust CLI locally, just
 * without the terminal. See lib/proverClient.ts for the caller-facing API.
 */
import init, { prove } from "./prover-wasm/veilpool_prover.js";

const PK_CACHE_NAME = "veilpool-prover-v1";
const PK_URL = "/prover/pk.bin";

let wasmReady: Promise<unknown> | null = null;
function ensureWasmInit() {
  if (!wasmReady) wasmReady = init();
  return wasmReady;
}

async function getProvingKeyBytes(): Promise<Uint8Array> {
  const cache = await caches.open(PK_CACHE_NAME);
  let res = await cache.match(PK_URL);
  if (!res) {
    res = await fetch(PK_URL);
    if (!res.ok) throw new Error(`Failed to fetch proving key: HTTP ${res.status}`);
    await cache.put(PK_URL, res.clone());
  }
  return new Uint8Array(await res.arrayBuffer());
}

export interface ProveRequest {
  type: "prove";
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

self.onmessage = async (ev: MessageEvent<ProveRequest>) => {
  const req = ev.data;
  try {
    self.postMessage({ type: "progress", stage: "downloading-key" });
    const [pkBytes] = await Promise.all([getProvingKeyBytes(), ensureWasmInit()]);

    self.postMessage({ type: "progress", stage: "proving" });
    const json = prove(
      req.secretHex,
      req.nullifierHex,
      req.pathElementsJson,
      req.pathIndicesJson,
      req.rootHex,
      req.recipientHex,
      BigInt(req.denomination),
      pkBytes,
      req.circuitIdHex,
      req.poolAddress,
      req.proverAddress,
    );
    self.postMessage({ type: "done", proof: JSON.parse(json) });
  } catch (e) {
    self.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
