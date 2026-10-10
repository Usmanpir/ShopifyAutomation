"use client";

import { ExternalLink, Plus, Sparkles } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Drawer } from "@/components/shared/drawer";
import { Button } from "@/components/ui/button";
import { CodConfirmDrawer } from "./cod-confirm-drawer";
import { SimulateOrderButton } from "./simulate-order-button";

export function LetAiConfirmButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="bg-ai text-white hover:bg-ai/90 dark:text-zinc-950">
        <Sparkles /> Let AI confirm {count} COD order{count === 1 ? "" : "s"}
      </Button>
      <CodConfirmDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * "Create order". Orders are created in Shopify (the source of truth) and
 * arrive here by webhook; in demo mode a simulated order runs the real pipeline.
 * Opens automatically for /orders?create=1 (command palette, + menu).
 */
export function NewOrderButton({ demo, shopDomain }: { demo: boolean; shopDomain: string | null }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(params.get("create") === "1");
  const close = (o: boolean) => {
    setOpen(o);
    if (!o && params.get("create")) {
      const next = new URLSearchParams(params.toString());
      next.delete("create");
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  };
  return (
    <>
      <Button variant="outline" className="bg-card" onClick={() => setOpen(true)}>
        <Plus /> New order
      </Button>
      <Drawer open={open} onOpenChange={close} icon={<Plus />} title="Create an order" description="Orders are created in Shopify so stock, payments and fulfilment stay in sync. New orders appear here within seconds.">
        <div className="space-y-4 text-sm">
          {shopDomain ? (
            <Button asChild className="w-full">
              <a href={`https://${shopDomain}/admin/draft_orders/new`} target="_blank" rel="noreferrer">
                Create draft order in Shopify <ExternalLink />
              </a>
            </Button>
          ) : (
            <p className="rounded-lg border bg-surface-2/60 px-3 py-2.5 text-muted-foreground">Connect your Shopify store in Settings → Integrations to create orders from here.</p>
          )}
          {demo && (
            <div className="rounded-lg border p-3">
              <p className="font-medium">Demo mode</p>
              <p className="mt-0.5 mb-3 text-[13px] text-muted-foreground">Simulate a realistic new order — it goes through risk scoring, automations and WhatsApp confirmation like a real one.</p>
              <SimulateOrderButton label="Simulate a new order" />
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}
