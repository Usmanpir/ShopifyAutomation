"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client/api";

export type ShellCounts = { approvals: number; inbox: number; whatsapp: number; orders: number; notifications: number; attention: number };

/** Live badge counts for the sidebar/topbar (polled). */
export function useShellCounts() {
  return useQuery({
    queryKey: ["shell-counts"],
    queryFn: () => api<ShellCounts>("/api/shell/counts"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
