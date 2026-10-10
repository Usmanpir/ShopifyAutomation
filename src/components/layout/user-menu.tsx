"use client";

import { LogOut, Settings, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/components/store-context";
import { api } from "@/lib/client/api";
import { initials } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/rbac";

export function UserMenu() {
  const { user, role, store } = useStore();
  const router = useRouter();
  const signOut = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      toast.success("Signed out");
      router.replace("/login");
      router.refresh();
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="grid size-8 place-items-center rounded-full bg-primary/12 text-[12px] font-semibold text-primary ring-offset-2 ring-offset-background outline-none hover:ring-2 hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
        {initials(user.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {ROLE_LABELS[role]} · {store.name}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/settings/account">
              <User /> Account
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings/security">
              <ShieldCheck /> Security
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings /> Store settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} variant="destructive">
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
