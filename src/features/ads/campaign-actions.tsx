"use client";

import { useMutation } from "@tanstack/react-query";
import { Info, Loader2, Pause, Play, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useFormat } from "@/components/store-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/client/api";

type Props = { id: string; name: string; status: string; dailyBudget: number | null; approvalPercent: number; roas: number };

function BudgetDialog({ id, name, dailyBudget, approvalPercent, roas }: Omit<Props, "status">) {
  const f = useFormat();
  const router = useRouter();
  const fid = useId();
  const current = dailyBudget ? dailyBudget / 100 : 0;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ? String(current) : "");
  const n = Number(value);
  const valid = Number.isFinite(n) && n >= 100 && n <= 10_000_000;
  const delta = current && valid ? ((n - current) / current) * 100 : null;
  const presets = current ? [-20, -10, 10, 20] : [];

  const save = useMutation({
    mutationFn: () => api(`/api/meta/campaigns/${id}`, { method: "PATCH", body: { dailyBudgetMajor: n } }),
    onSuccess: () => {
      toast.success("Daily budget updated", { description: `${name}: ${f.money(Math.round(n * 100))} per day` });
      setOpen(false);
      router.refresh();
    },
    onError: (e) => toast.error("Couldn't change budget", { description: errorMessage(e) }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(current ? String(current) : "");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 bg-card">
          <Wallet /> Change budget
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change daily budget</DialogTitle>
          <DialogDescription>
            {name} · currently {dailyBudget ? f.money(dailyBudget) : "no daily budget"} per day
          </DialogDescription>
        </DialogHeader>
        <form
          id={`${fid}-form`}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && n !== current) save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${fid}-amount`}>New daily budget ({f.currencySymbol})</Label>
            <Input id={`${fid}-amount`} type="number" inputMode="decimal" min={100} step={100} value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={value !== "" && !valid} autoFocus className="tabular" />
            {value !== "" && !valid ? (
              <p className="text-xs text-danger" role="alert">
                Enter at least {f.money(10000)}.
              </p>
            ) : delta !== null && Math.abs(delta) >= 0.5 ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {delta > 0 ? "+" : "−"}
                  {Math.abs(delta).toFixed(0)}%
                </span>{" "}
                vs current{roas > 0 && delta > 0 ? ` · ≈ ${f.money(Math.round((n - current) * 100 * roas))} extra daily revenue if ROAS holds at ${roas.toFixed(2)}×` : ""}
              </p>
            ) : null}
          </div>
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick adjustments">
              {presets.map((p) => (
                <Button key={p} type="button" size="xs" variant="outline" onClick={() => setValue(String(Math.max(100, Math.round((current * (1 + p / 100)) / 100) * 100)))}>
                  {p > 0 ? "+" : "−"}
                  {Math.abs(p)}%
                </Button>
              ))}
            </div>
          )}
          <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2.5 text-[12.5px] text-info">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Your change applies immediately on Meta and is recorded in the audit log. AI-initiated budget changes above {approvalPercent}% need approval in the Approval Center.
            </span>
          </p>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={`${fid}-form`} disabled={!valid || n === current || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Save budget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CampaignActions(props: Props) {
  const router = useRouter();
  const setStatus = useMutation({
    mutationFn: (status: "ACTIVE" | "PAUSED") => api(`/api/meta/campaigns/${props.id}`, { method: "PATCH", body: { status } }),
    onSuccess: (_d, status) => {
      toast.success(status === "PAUSED" ? "Campaign paused" : "Campaign activated", { description: props.name });
      router.refresh();
    },
    onError: (e) => toast.error("Couldn't update campaign", { description: errorMessage(e) }),
  });
  if (props.status === "ARCHIVED") return null;
  return (
    <>
      {props.status === "ACTIVE" ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline" className="h-9 bg-card">
              <Pause /> Pause
            </Button>
          }
          title={`Pause “${props.name}”?`}
          description="Delivery stops on Meta right away. You can reactivate it at any time; learning may reset if it stays paused for long."
          confirmLabel="Pause campaign"
          onConfirm={() => setStatus.mutateAsync("PAUSED")}
        />
      ) : (
        <Button className="h-9" onClick={() => setStatus.mutate("ACTIVE")} disabled={setStatus.isPending}>
          {setStatus.isPending ? <Loader2 className="animate-spin" /> : <Play />} Activate
        </Button>
      )}
      <BudgetDialog id={props.id} name={props.name} dailyBudget={props.dailyBudget} approvalPercent={props.approvalPercent} roas={props.roas} />
    </>
  );
}
