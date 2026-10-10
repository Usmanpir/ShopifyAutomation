"use client";

import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      toast.success("Signed out");
      router.replace("/login");
      router.refresh();
    }
  };
  return (
    <Button variant="outline" className="h-9" onClick={signOut} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <LogOut />}
      Sign out
    </Button>
  );
}
