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

/** Sign in with an existing passkey wallet. Returns the wallet address + a fresh session token. */
export async function loginPasskey(
  apiBase: string,
  walletAddress: string,
): Promise<{ walletAddress: string; token: string }> {
  const { sessionId, options } = await postJSON<{ sessionId: string; options: any }>(
    apiBase, "/api/auth/passkey/login/options", { walletAddress },
  );

  const assertion = await startAuthentication({ optionsJSON: options });

  return postJSON<{ walletAddress: string; token: string }>(
    apiBase, "/api/auth/passkey/login/verify", { sessionId, response: assertion },
  );
}
