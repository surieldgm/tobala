/**
 * Fetch wrapper for the Tobalá backend.
 *
 * - Reads the access token from localStorage and attaches it as a Bearer
 * - On 401, makes a single-flight call to /auth/refresh/ and retries once
 * - Any request that still fails post-refresh clears tokens and rethrows
 *
 * This is intentionally dependency-free so it can be imported from anywhere.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

const ACCESS_KEY = "tobala.access";
const REFRESH_KEY = "tobala.refresh";

export const tokens = {
  getAccess: () =>
    typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY),
  getRefresh: () =>
    typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh?: string) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, data: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.status = status;
    this.data = data;
  }
}

let refreshInflight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInflight) return refreshInflight;
  const refresh = tokens.getRefresh();
  if (!refresh) return null;

  refreshInflight = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) {
        tokens.clear();
        return null;
      }
      const data = (await res.json()) as { access: string; refresh?: string };
      tokens.set(data.access, data.refresh);
      return data.access;
    } finally {
      refreshInflight = null;
    }
  })();

  return refreshInflight;
}

type RequestOptions = RequestInit & { auth?: boolean };

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { auth = true, headers, ...rest } = opts;
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;

  const buildHeaders = (access: string | null): HeadersInit => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      ...(headers as Record<string, string> | undefined),
    };
    if (auth && access) h["Authorization"] = `Bearer ${access}`;
    return h;
  };

  let res = await fetch(url, {
    ...rest,
    headers: buildHeaders(tokens.getAccess()),
  });

  if (res.status === 401 && auth) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      res = await fetch(url, {
        ...rest,
        headers: buildHeaders(newAccess),
      });
    }
  }

  if (!res.ok) {
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      // non-JSON body
    }
    throw new ApiError(res.status, data);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, {
      ...opts,
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, {
      ...opts,
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, {
      ...opts,
      method: "PUT",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};
