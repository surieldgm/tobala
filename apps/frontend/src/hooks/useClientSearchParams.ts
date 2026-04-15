"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ReadonlyURLSearchParams } from "next/navigation";

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const notify = () => queueMicrotask(onStoreChange);
  window.addEventListener("popstate", notify);
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<typeof push>) => {
    const out = push(...args);
    notify();
    return out;
  };
  history.replaceState = (...args: Parameters<typeof replace>) => {
    const out = replace(...args);
    notify();
    return out;
  };
  return () => {
    window.removeEventListener("popstate", notify);
    history.pushState = push;
    history.replaceState = replace;
  };
}

function getSearchSnapshot() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function getServerSearchSnapshot() {
  return "";
}

/**
 * Same shape as `useSearchParams()` but reads `window.location` so devtools
 * never enumerate Next’s dev-only Promise proxy around search params.
 */
export function useClientSearchParams(): ReadonlyURLSearchParams {
  const search = useSyncExternalStore(subscribe, getSearchSnapshot, getServerSearchSnapshot);
  return useMemo(() => new ReadonlyURLSearchParams(search), [search]);
}
