/**
 * Passkey sign-in (account-abstraction option) — talks to /api/auth/passkey/*
 * and drives the browser's native WebAuthn ceremony via @simplewebauthn/browser.
 *
 * Registration deploys a new Soroban smart-wallet contract bound to the
 * passkey's public key; the resulting contract address becomes the user's
 * wallet address. Login just verifies a fresh assertion to issue a session
 * token — it does not touch the chain.
 */
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { api } from "./api";

/** Mirrors backend/src/utils/scval-args.ts's ScValArgSpec — keep in sync. */
export type ScValArgSpec =
  | { type: "u32"; value: number }
  | { type: "u64"; value: string }
  | { type: "i128"; value: string }
  | { type: "bytes"; value: string } // base64
  | { type: "address"; value: string }
  | { type: "string"; value: string }
  | { type: "symbol"; value: string }
  | { type: "bool"; value: boolean };

export function isPasskeySupported(): boolean {
  return browserSupportsWebAuthn();
}

async function postJSON<T>(apiBase: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

/** Register a brand-new passkey wallet. Returns the deployed wallet address + session token. */
export async function registerPasskey(
  apiBase: string,
  userName: string,
): Promise<{ walletAddress: string; token: string }> {
  const { sessionId, options } = await postJSON<{ sessionId: string; options: any }>(
    apiBase, "/api/auth/passkey/register/options", { userName },
  );

  const attestation = await startRegistration({ optionsJSON: options });

  return postJSON<{ walletAddress: string; token: string }>(
    apiBase, "/api/auth/passkey/register/verify", { sessionId, response: attestation },
  );
}

/**
 * Sign in with an existing passkey wallet. No wallet address needed — the
 * browser offers every discoverable passkey registered for this origin, and
 * the backend resolves which wallet it belongs to via the on-chain
 * passkey-registry once the assertion comes back.
 */
export async function loginPasskey(apiBase: string): Promise<{ walletAddress: string; token: string }> {
  const { sessionId, options } = await postJSON<{ sessionId: string; options: any }>(
    apiBase, "/api/auth/passkey/login/options", {},
  );

  const assertion = await startAuthentication({ optionsJSON: options });

  return postJSON<{ walletAddress: string; token: string }>(
    apiBase, "/api/auth/passkey/login/verify", { sessionId, response: assertion },
  );
}

/**
 * Add a backup passkey to the currently signed-in wallet (recovery). Two
 * WebAuthn ceremonies in a row: first create the new passkey (registration),
 * then prove you still control an EXISTING one on this wallet
 * (authentication) to actually authorize adding it. Requires an active
 * session (uses the same Bearer token api.ts already attaches).
 */
export async function addBackupPasskey(userName: string): Promise<{ success: true; signerIndex: number }> {
  const { sessionId, options } = await api.post<{ sessionId: string; options: any }>(
    "/passkey/signers/add/options", { userName },
  );

  const attestation = await startRegistration({ optionsJSON: options });

  const { sessionId: authSessionId, options: authOptions } = await api.post<{ sessionId: string; options: any }>(
    "/passkey/signers/add/register-verify", { sessionId, response: attestation },
  );

  const assertion = await startAuthentication({ optionsJSON: authOptions });

  return api.post<{ success: true; signerIndex: number }>(
    "/passkey/signers/add/authorize", { sessionId: authSessionId, response: assertion },
  );
}

/**
 * Authorize an arbitrary Soroban contract call as the currently signed-in
 * passkey wallet — one WebAuthn ceremony (an EXISTING passkey on this
 * wallet signs the prepared authorization), then the backend submits it.
 * Generalizes the same mechanism `addBackupPasskey` uses for `add_signer`
 * to any contract/method/args. Requires an active session.
 */
export async function invokePasskeyTransaction(
  contractId: string,
  method: string,
  args: ScValArgSpec[] = [],
): Promise<{ txHash: string; result: unknown }> {
  const { sessionId, options } = await api.post<{ sessionId: string; options: any }>(
    "/passkey/tx/prepare", { contractId, method, args },
  );

  const assertion = await startAuthentication({ optionsJSON: options });

  return api.post<{ txHash: string; result: unknown }>(
    "/passkey/tx/submit", { sessionId, response: assertion },
  );
}
