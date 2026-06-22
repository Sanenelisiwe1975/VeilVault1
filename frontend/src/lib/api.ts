/**
 * VeilVault1 API client.
 *
 * Backend URL resolution:
 *   - Development: Vite proxies /api/* → localhost:3000 (vite.config.ts)
 *   - Production (Vercel): uses VITE_API_URL env var
 *     e.g. VITE_API_URL=https://your-backend.up.railway.app
 *
 * Bearer token priority (highest to lowest):
 *   1. Session token from SEP-10 auth (GET/POST /api/auth)
 *   2. User-configured API key from localStorage
 *   3. Default dev key
 */

const DEFAULT_KEY = "veilpool-dev-key";

// In production VITE_API_URL points to the deployed backend.
// In dev it's empty and the Vite proxy forwards /api/* to localhost:3000.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

function getToken(): string {
  return sessionToken ?? localStorage.getItem("vv_api_key") ?? DEFAULT_KEY;
}

let sessionToken: string | null = null;
export function setSessionToken(token: string | null) { sessionToken = token; }

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
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
