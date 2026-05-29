/** Thin wrapper around fetch for the VeilVault1 backend. */

const API_KEY = localStorage.getItem("vv_api_key") ?? "veilpool-dev-key";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${API_KEY}`,
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
  get:  <T>(path: string)               => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
};
