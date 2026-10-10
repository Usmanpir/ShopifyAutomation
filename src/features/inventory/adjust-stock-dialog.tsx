"use client";

import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/client/api";

export type AdjustTarget = {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  stock: number;
  /** Optional AI context shown in the dialog. */
  reorder?: number;
  averageDailySales?: number;
};

type Mode = "adjust" | "set";

const REASONS = ["Restock received", "Stock count correction", "Damaged / defective", "Returned to stock"];

/**
 * Set or adjust a variant's on-hand stock with a required reason (audited server-side).
 * Controlled: render once per list and pass the selected `target` (null = closed).
 */
export function AdjustStockDialog({ target, onClose }: { target: AdjustTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed so the form resets for each variant. */}
        {target && <AdjustForm key={target.variantId} target={target} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({ target, onDone }: { target: AdjustTarget; onDone: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("adjust");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");

  const n = qty.trim() === "" || qty.trim() === "-" ? NaN : Number(qty);
  const valid = Number.isInteger(n) && (mode === "set" ? n >= 0 : n !== 0);
  const next = valid ? (mode === "set" ? n : target.stock + n) : null;
  const canSubmit = valid && next !== null && next >= 0 && reason.trim().length >= 2;

  const save = useMutation({
    mutationFn: () => api<{ quantity: number }>(`/api/inventory/${target.variantId}`, { method: "PATCH", body: { mode, quantity: n, reason: reason.trim() } }),
    onSuccess: (r) => {
      toast.success(`Stock updated to ${r.quantity}`, { description: `${target.productTitle} · ${target.variantTitle}` });
      onDone();
      router.refresh();
    },
    onError: (e) => toast.error("Couldn't update stock", { description: errorMessage(e) }),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit && !save.isPending) save.mutate();
      }}
      className="space-y-5"
    >
      <DialogHeader>
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogDescription>
          {target.productTitle} · <span className="font-medium text-foreground">{target.variantTitle}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-3 items-center gap-2 rounded-lg border bg-surface-2 p-3 text-center">
        <div>
          <p className="text-[11px] text-muted-foreground">Current</p>
          <p className="tabular text-lg font-semibold">{target.stock}</p>
        </div>
        <ArrowRight className="mx-auto size-4 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-[11px] text-muted-foreground">New stock</p>
          <p className={cn("tabular text-lg font-semibold", next !== null && next < 0 && "text-danger", next === null && "text-muted-foreground")} aria-live="polite">
            {next ?? "—"}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <span id="adjust-mode" className="text-sm font-medium">
          Mode
        </span>
        <div role="radiogroup" aria-labelledby="adjust-mode" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ["adjust", "Add / remove"],
              ["set", "Set exact count"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn("h-8 rounded-md text-[13px] font-medium transition", mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="adjust-qty">{mode === "set" ? "New on-hand quantity" : "Quantity change"}</Label>
        <Input
          id="adjust-qty"
          inputMode="numeric"
          autoFocus
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^\d-]/g, ""))}
          placeholder={mode === "set" ? "e.g. 40" : "e.g. 24 or -3"}
          aria-describedby="adjust-qty-hint"
          aria-invalid={qty !== "" && (!valid || (next ?? 0) < 0)}
        />
        <p id="adjust-qty-hint" className="text-xs text-muted-foreground">
          {mode === "adjust" ? "Use a negative number to remove units." : "Replaces the current on-hand count."}
          {next !== null && next < 0 && <span className="text-danger"> Stock can&apos;t go below zero.</span>}
        </p>
        {!!target.reorder && target.reorder > 0 && (
          <button
            type="button"
            onClick={() => {
              setMode("adjust");
              setQty(String(target.reorder));
              if (!reason) setReason("Restock received");
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-ai-soft px-2 py-1 text-xs font-medium text-ai hover:opacity-90"
          >
            <Sparkles className="size-3.5" aria-hidden /> Use AI suggestion: +{target.reorder} units (30 days of cover)
          </button>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="adjust-reason">
          Reason <span className="text-danger">*</span>
        </Label>
        <Textarea id="adjust-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why is stock changing?" required maxLength={200} />
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn("rounded-full border px-2.5 py-0.5 text-xs transition", reason === r ? "border-foreground/20 bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Recorded in the audit log with your name.</p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit || save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Save stock
        </Button>
      </DialogFooter>
    </form>
  );
}
