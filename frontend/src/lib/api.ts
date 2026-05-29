/**
 * VeilVault1 API client.
 *
 * Bearer token priority (highest to lowest):
 *   1. Session token from POST /api/auth/token  (stored in WalletSession)
 *   2. User-configured API key from localStorage
 *   3. Default dev key
 */

const DEFAULT_KEY = "veilpool-dev-key";

function getToken(): string {
  // The WalletSession context stores the session token in the module-level
  // variable below.  api.ts is intentionally kept free of React hooks so it
  // can be called outside components.
  return sessionToken ?? localStorage.getItem("vv_api_key") ?? DEFAULT_KEY;
}

// Set by WalletSession after a successful /api/auth/token call.
let sessionToken: string | null = null;
export function setSessionToken(token: string | null) { sessionToken = token; }

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${getToken()}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  get:  <T>(path: string)                => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
};
