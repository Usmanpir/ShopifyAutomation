"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

/** Explains why the user landed here after requireAuth() redirected them (?denied=<permission>). */
export function AccessDeniedToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const denied = params.get("denied");
  useEffect(() => {
    if (!denied) return;
    toast.warning("You don't have access to that page", { description: `Your role is missing the “${denied}” permission. Ask an owner or admin if you need it.` });
    router.replace(pathname, { scroll: false });
  }, [denied, pathname, router]);
  return null;
}
