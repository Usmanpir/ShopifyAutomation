"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { SectionCard } from "@/components/shared/page";
import { useFormat } from "@/components/store-context";
import { Input } from "@/components/ui/input";
import { toMajor, toMinor } from "@/lib/money";
import type { ApprovalRules } from "@/schemas/store-settings";
import { Field, FormFooter, numberField, SwitchRow, useSaver } from "./form-bits";

const num = (msg = "Enter a number") => z.number({ error: msg });
const schema = z.object({
  refundAutoApproveLimit: num().min(0, "Can't be negative"),
  bulkCancellationThreshold: num().int("Whole numbers only").min(1, "At least 1"),
  adBudgetChangePercent: num().min(0, "Can't be negative").max(500, "Max 500%"),
  massMessageThreshold: num().int("Whole numbers only").min(1, "At least 1"),
  priceChangeRequiresApproval: z.boolean(),
  deleteRequiresApproval: z.boolean(),
  decisionExpiryHours: num().int("Whole numbers only").min(1, "At least 1 hour").max(720, "Max 30 days (720 hours)"),
});
type Values = z.infer<typeof schema>;

/** Guardrails for the AI. Money is shown in major units and stored in minor units. */
export function ApprovalRulesForm({ initial, readOnly }: { initial: ApprovalRules; readOnly: boolean }) {
  const f = useFormat();
  const defaults: Values = { ...initial, refundAutoApproveLimit: toMajor(initial.refundAutoApproveLimit) };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { save, pending } = useSaver("/api/settings/approvals", { success: "Approval rules saved" });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    if (await save({ ...v, refundAutoApproveLimit: toMinor(v.refundAutoApproveLimit) })) form.reset(v);
  });

  const n = (name: keyof Values) => ({ ...form.register(name, numberField), "aria-invalid": !!errors[name] });

  return (
    <form onSubmit={onSubmit} noValidate>
      <SectionCard
        title="Approval rules"
        description="AI never takes these actions on its own above the limits below — it asks a manager first."
        icon={
          <span className="grid size-9 place-items-center rounded-lg bg-success-soft text-success">
            <ShieldCheck className="size-[18px]" aria-hidden />
          </span>
        }
        action={
          <Link href="/ai" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
            Agent permissions <ArrowUpRight className="size-3.5" />
          </Link>
        }
      >
        <fieldset disabled={readOnly} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="refundAutoApproveLimit" label="Refund auto-approve limit" hint="Refunds up to this amount can be issued without approval. 0 = always ask." error={errors.refundAutoApproveLimit?.message}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{f.currencySymbol}</span>
                <Input id="refundAutoApproveLimit" type="number" inputMode="decimal" min={0} step="1" className="pl-11 tabular" {...n("refundAutoApproveLimit")} />
              </div>
            </Field>
            <Field id="bulkCancellationThreshold" label="Bulk cancellation threshold" hint="Cancelling this many orders at once needs approval." error={errors.bulkCancellationThreshold?.message}>
              <Input id="bulkCancellationThreshold" type="number" inputMode="numeric" min={1} className="tabular" {...n("bulkCancellationThreshold")} />
            </Field>
            <Field id="adBudgetChangePercent" label="Ad budget change limit" hint="Budget changes larger than this need approval." error={errors.adBudgetChangePercent?.message}>
              <div className="relative">
                <Input id="adBudgetChangePercent" type="number" inputMode="decimal" min={0} max={500} className="pr-8 tabular" {...n("adBudgetChangePercent")} />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </Field>
            <Field id="massMessageThreshold" label="Mass message threshold" hint="Messaging more customers than this at once needs approval." error={errors.massMessageThreshold?.message}>
              <Input id="massMessageThreshold" type="number" inputMode="numeric" min={1} className="tabular" {...n("massMessageThreshold")} />
            </Field>
            <Field id="decisionExpiryHours" label="Decision expiry" hint="Pending approvals expire after this many hours." error={errors.decisionExpiryHours?.message}>
              <div className="relative">
                <Input id="decisionExpiryHours" type="number" inputMode="numeric" min={1} max={720} className="pr-14 tabular" {...n("decisionExpiryHours")} />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">hours</span>
              </div>
            </Field>
          </div>
          <div className="divide-y rounded-xl border px-4 py-3.5">
            <Controller
              control={form.control}
              name="priceChangeRequiresApproval"
              render={({ field }) => <SwitchRow id="priceChangeRequiresApproval" title="Price changes require approval" description="AI can suggest new prices but a person applies them." checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} />}
            />
            <Controller
              control={form.control}
              name="deleteRequiresApproval"
              render={({ field }) => <SwitchRow id="deleteRequiresApproval" title="Deletions require approval" description="Deleting products, customers or campaigns always waits for a person." checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} />}
            />
          </div>
        </fieldset>
        <FormFooter dirty={isDirty} pending={pending} readOnly={readOnly} onReset={() => form.reset(defaults)} />
      </SectionCard>
    </form>
  );
}
