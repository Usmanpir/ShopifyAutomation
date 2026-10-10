"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MessageCircle, PackageCheck, PackageOpen, Truck, Undo2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client/api";
import type { OrderAction } from "@/services/order.service";

const META: Record<OrderAction, { label: string; icon: typeof CheckCircle2; done: string }> = {
  request_confirmation: { label: "Request WhatsApp confirmation", icon: MessageCircle, done: "WhatsApp confirmation sent" },
  confirm: { label: "Confirm order", icon: CheckCircle2, done: "Order confirmed" },
  process: { label: "Mark processing", icon: PackageOpen, done: "Order marked as processing" },
  ship: { label: "Book shipment", icon: Truck, done: "Shipment booked" },
  deliver: { label: "Mark delivered", icon: PackageCheck, done: "Order marked as delivered" },
  cancel: { label: "Cancel order", icon: XCircle, done: "Order cancelled" },
  return: { label: "Mark returned", icon: Undo2, done: "Order marked as returned" },
};

/** Status transition buttons for the order header. Only actions valid for the current status are passed in. */
export function OrderActions({
  orderId,
  orderName,
  actions,
  confirmationPending,
  canUpdate,
  canCancel,
  recommended,
}: {
  orderId: string;
  orderName: string;
  actions: OrderAction[];
  confirmationPending: boolean;
  canUpdate: boolean;
  canCancel: boolean;
  /** The next step from the AI summary; it becomes the one primary button. */
  recommended?: OrderAction | null;
}) {
  const router = useRouter();
  const run = useMutation({
    mutationFn: ({ action, reason }: { action: OrderAction; reason?: string }) =>
      action === "ship" ? api(`/api/orders/${orderId}/shipment`, { body: {} }) : api(`/api/orders/${orderId}/actions`, { body: { action, reason } }),
    onSuccess: (_, v) => {
      toast.success(META[v.action].done, { description: orderName });
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!canUpdate) return null;
  const forward = actions.filter((a) => a !== "cancel" && a !== "return");
  const primary: OrderAction | undefined = recommended === undefined ? (forward.includes("ship") ? "ship" : forward[0]) : (recommended ?? undefined);
  const busy = run.isPending;

  return (
    <>
      {forward.map((a) => {
        const m = META[a];
        const pending = busy && run.variables?.action === a;
        const label = a === "request_confirmation" && confirmationPending ? "Resend confirmation" : m.label;
        return (
          <Button key={a} variant={a === primary ? "default" : "outline"} className="h-9" disabled={busy} onClick={() => run.mutate({ action: a })}>
            {pending ? <Loader2 className="animate-spin" /> : <m.icon />}
            {label}
          </Button>
        );
      })}
      {(actions.includes("return") || (actions.includes("cancel") && canCancel)) && forward.length > 0 && <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-border sm:block" />}
      {actions.includes("return") && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" className="h-9" disabled={busy}>
              <Undo2 /> Mark returned
            </Button>
          }
          title={`Mark ${orderName} as returned?`}
          description="Use this when the parcel came back to you. Customer metrics and risk history will be updated."
          confirmLabel="Mark returned"
          reason={{ label: "Reason (optional)", placeholder: "e.g. Refused at door, wrong size" }}
          onConfirm={(reason) => run.mutateAsync({ action: "return", reason })}
        />
      )}
      {actions.includes("cancel") && canCancel && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" className="h-9 text-danger hover:bg-danger-soft hover:text-danger" disabled={busy}>
              <XCircle /> Cancel
            </Button>
          }
          title={`Cancel order ${orderName}?`}
          description="The cancellation syncs to Shopify, restocks the items and can't be undone."
          confirmLabel="Cancel order"
          destructive
          reason={{ label: "Cancellation reason", placeholder: "e.g. Customer unreachable after 3 attempts", required: true }}
          onConfirm={(reason) => run.mutateAsync({ action: "cancel", reason })}
        />
      )}
    </>
  );
}
