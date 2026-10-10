"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import type { Role } from "@/generated/prisma/enums";
import { makeFormatter } from "@/lib/formatter";
import { ROLE_PERMISSIONS, type Permission } from "@/lib/rbac";

export type StoreContextValue = {
  store: { id: string; name: string; currency: string; locale: string; timezone: string; demoMode: boolean; logoUrl: string | null };
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  role: Role;
};

const Ctx = createContext<StoreContextValue | null>(null);

/** Client-side store/session context (no secrets — only display data and the user's role). */
export function StoreProvider({ value, children }: { value: StoreContextValue; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside <StoreProvider>");
  return v;
}

/** Permission check for hiding UI. The server enforces the same rules. */
export function useCan() {
  const { role } = useStore();
  return useCallback((p: Permission) => ROLE_PERMISSIONS[role].has(p), [role]);
}

/** Store-aware money/number/date formatting for client components. */
export function useFormat() {
  const { store } = useStore();
  return useMemo(() => makeFormatter(store), [store]);
}
