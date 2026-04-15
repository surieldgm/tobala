"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, tokens } from "@/lib/api";
import { ws } from "@/lib/ws";
import type { AuthUser } from "@/lib/types";

/** Reads tokens on mount to avoid Next.js hydration mismatch. */
export function useHasToken() {
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  useEffect(() => setHasToken(!!tokens.getAccess()), []);
  return hasToken;
}

export function useMe() {
  const hasToken = useHasToken();
  return useQuery<AuthUser | null>({
    queryKey: ["me"],
    enabled: hasToken === true,
    queryFn: async () => {
      try {
        return await api.get<AuthUser>("/auth/me/");
      } catch {
        return null;
      }
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (creds: { username: string; password: string }) =>
      api.post<{ access: string; refresh: string }>("/auth/login/", creds, {
        auth: false,
      }),
    onSuccess: (data) => {
      tokens.set(data.access, data.refresh);
      // The WS socket was opened (if at all) with the anonymous user's
      // absent token — reconnect now that we have a real access token.
      ws.reauth();
      qc.invalidateQueries({ queryKey: ["me"] });
      router.push("/notes");
    },
  });
}

export function useSignup() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async (payload: {
      username: string;
      password: string;
      email?: string;
    }) => {
      await api.post("/auth/signup/", payload, { auth: false });
      const loginRes = await api.post<{ access: string; refresh: string }>(
        "/auth/login/",
        { username: payload.username, password: payload.password },
        { auth: false }
      );
      tokens.set(loginRes.access, loginRes.refresh);
    },
    onSuccess: () => {
      ws.reauth();
      qc.invalidateQueries({ queryKey: ["me"] });
      router.push("/notes");
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return () => {
    tokens.clear();
    ws.reauth();
    qc.clear();
    router.push("/login");
  };
}
