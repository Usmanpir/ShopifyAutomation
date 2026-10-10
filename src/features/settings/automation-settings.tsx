"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { AlertCircle, CalendarClock, CheckCircle2, Gauge, Package, ShieldAlert } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { SectionCard } from "@/components/shared/page";
import { useFormat } from "@/components/store-context";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { describeCron, isValidCron } from "@/lib/cron";
import { toMajor, toMinor } from "@/lib/money";
import type { RiskSettings, StoreSettings } from "@/schemas/store-settings";
import { SliderField } from "./ai-settings-form";
import { Field, FormFooter, numberField, SwitchRow, useSaver } from "./form-bits";

const num = (msg = "Enter a number") => z.number({ error: msg });

// ───────────────────────── Schedules ─────────────────────────

const SCHEDULES: { key: keyof StoreSettings["schedules"]; label: string; description: string }[] = [
  { key: "dailyReport", label: "Daily report", description: "Morning summary email and in-app report." },
  { key: "inventoryAnalysis", label: "Inventory analysis", description: "Velocity, coverage and reorder suggestions." },
  { key: "customerSegmentation", label: "Customer segmentation", description: "Re-computes RFM segments and lifetime value." },
  { key: "analyticsSync", label: "Analytics sync", description: "Rolls up daily metrics for dashboards." },
  { key: "courierTracking", label: "Courier tracking", description: "Pulls shipment status updates from your courier." },
  { key: "aiInsights", label: "AI insights", description: "Generates fresh recommendations across the store." },
  { key: "abandonedFollowUp", label: "Follow-ups", description: "Abandoned checkout and pending confirmation nudges." },
];

const scheduleSchema = z.object(Object.fromEntries(SCHEDULES.map((s) => [s.key, z.string().trim().refine(isValidCron, "Use 5 fields: minute hour day month weekday")])) as Record<keyof StoreSettings["schedules"], z.ZodString>);

export function SchedulesForm({ initial, timezone, readOnly }: { initial: StoreSettings["schedules"]; timezone: string; readOnly: boolean }) {
  const form = useForm<StoreSettings["schedules"]>({ resolver: zodResolver(scheduleSchema), defaultValues: initial, mode: "onChange" });
  const { save, pending } = useSaver("/api/settings/schedules", { success: "Schedules saved" });
  const values = useWatch({ control: form.control });
  const { errors, isDirty } = form.formState;
  const onSubmit = form.handleSubmit(async (v) => {
    if (await save(v)) form.reset(v);
  });
  return (
    <form onSubmit={onSubmit} noValidate>
      <SectionCard
        title="Schedules"
        description={`Cron expressions, evaluated in your store timezone (${timezone}).`}
        icon={<CalendarClock className="size-4 text-muted-foreground" aria-hidden />}
        contentClassName="px-0 pb-0"
      >
        <fieldset disabled={readOnly}>
          <ul className="divide-y border-t">
            {SCHEDULES.map((s) => {
              const v = values[s.key] ?? "";
              const valid = isValidCron(v);
              const err = errors[s.key]?.message;
              return (
                <li key={s.key} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center sm:gap-6">
                  <div className="min-w-0">
                    <label htmlFor={`cron-${s.key}`} className="text-sm font-medium">
                      {s.label}
                    </label>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </div>
                  <div className="space-y-1">
                    <Input
                      id={`cron-${s.key}`}
                      spellCheck={false}
                      className="font-mono text-[13px]"
                      aria-invalid={!!err}
                      aria-describedby={`cron-${s.key}-desc`}
                      {...form.register(s.key)}
                    />
                    <p id={`cron-${s.key}-desc`} className={cn("flex items-center gap-1 text-xs", valid ? "text-muted-foreground" : "text-danger")} role={valid ? undefined : "alert"}>
                      {valid ? <CheckCircle2 className="size-3 text-success" aria-hidden /> : <AlertCircle className="size-3" aria-hidden />}
                      {valid ? describeCron(v) : (err ?? "Invalid expression")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
        <div className="px-5 pb-5">
          <FormFooter dirty={isDirty} pending={pending} readOnly={readOnly} onReset={() => form.reset(initial)} />
        </div>
      </SectionCard>
    </form>
  );
}

// ───────────────────────── Limits ─────────────────────────

const limitsSchema = z
  .object({
    maxRunsPerHour: num().int("Whole numbers only").min(1, "At least 1"),
    maxMessagesPerCustomerPerDay: num().int("Whole numbers only").min(1, "At least 1"),
    quietHoursStart: num().int().min(0).max(23),
    quietHoursEnd: num().int().min(0).max(23),
  });
type Limits = z.infer<typeof limitsSchema>;

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }));

export function LimitsForm({ initial, readOnly }: { initial: Limits; readOnly: boolean }) {
  const form = useForm<Limits>({ resolver: zodResolver(limitsSchema), defaultValues: initial });
  const { save, pending } = useSaver("/api/settings/automation", { success: "Automation limits saved" });
  const { errors, isDirty } = form.formState;
  const [qs, qe] = useWatch({ control: form.control, name: ["quietHoursStart", "quietHoursEnd"] });
  const onSubmit = form.handleSubmit(async (v) => {
    if (await save(v)) form.reset(v);
  });
  const hourSelect = (name: "quietHoursStart" | "quietHoursEnd", label: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Field id={name} label={label}>
          <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))} disabled={readOnly}>
            <SelectTrigger id={name} className="w-full tabular">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {HOURS.map((h) => (
                <SelectItem key={h.value} value={h.value}>
                  {h.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
  return (
    <form onSubmit={onSubmit} noValidate>
      <SectionCard title="Limits & quiet hours" description="Safety rails so automations never overwhelm customers or your systems." icon={<Gauge className="size-4 text-muted-foreground" aria-hidden />}>
        <fieldset disabled={readOnly} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="maxRunsPerHour" label="Max automation runs per hour" error={errors.maxRunsPerHour?.message} hint="Runs beyond this are queued.">
              <Input id="maxRunsPerHour" type="number" min={1} inputMode="numeric" className="tabular" aria-invalid={!!errors.maxRunsPerHour} {...form.register("maxRunsPerHour", numberField)} />
            </Field>
            <Field id="maxMessagesPerCustomerPerDay" label="Max messages per customer per day" error={errors.maxMessagesPerCustomerPerDay?.message} hint="Applies to automated WhatsApp and marketing messages.">
              <Input id="maxMessagesPerCustomerPerDay" type="number" min={1} inputMode="numeric" className="tabular" aria-invalid={!!errors.maxMessagesPerCustomerPerDay} {...form.register("maxMessagesPerCustomerPerDay", numberField)} />
            </Field>
          </div>
          <div className="rounded-xl border bg-surface-2/40 p-4">
            <p className="text-sm font-medium">Quiet hours</p>
            <p className="mb-4 text-xs text-muted-foreground">
              {qs === qe ? "Quiet hours are disabled (start equals end)." : `No automated customer messages between ${String(qs).padStart(2, "0")}:00 and ${String(qe).padStart(2, "0")}:00 — they're sent when quiet hours end. Order confirmations are exempt.`}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {hourSelect("quietHoursStart", "Starts")}
              {hourSelect("quietHoursEnd", "Ends")}
            </div>
          </div>
        </fieldset>
        <FormFooter dirty={isDirty} pending={pending} readOnly={readOnly} onReset={() => form.reset(initial)} />
      </SectionCard>
    </form>
  );
}

// ───────────────────────── Risk scoring ─────────────────────────

const WEIGHTS: { key: keyof RiskSettings["weights"]; label: string; hint: string }[] = [
  { key: "previousCancellations", label: "Previous cancellations", hint: "Past orders the customer cancelled." },
  { key: "previousReturns", label: "Previous returns", hint: "Refused or returned deliveries." },
  { key: "successfulDeliveries", label: "Successful deliveries", hint: "Lowers risk for proven customers." },
  { key: "orderFrequency", label: "Order frequency", hint: "Many orders in a short window." },
  { key: "orderAmount", label: "Order amount", hint: "Unusually large basket values." },
  { key: "phoneHistory", label: "Phone history", hint: "Invalid, new or shared phone numbers." },
  { key: "addressConsistency", label: "Address consistency", hint: "Incomplete or changing addresses." },
  { key: "codBehavior", label: "COD behaviour", hint: "Unconfirmed or refused COD orders." },
];

const riskSchema = z
  .object({
    mediumThreshold: num().int().min(1, "Min 1").max(99, "Max 99"),
    highThreshold: num().int().min(2, "Min 2").max(100, "Max 100"),
    highValueOrderAmount: num().min(0, "Can't be negative"),
    requireConfirmationForCod: z.boolean(),
    weights: z.object(Object.fromEntries(WEIGHTS.map((w) => [w.key, z.number().min(0).max(50)])) as Record<keyof RiskSettings["weights"], z.ZodNumber>),
  })
  .refine((v) => v.mediumThreshold < v.highThreshold, { path: ["highThreshold"], message: "Must be higher than the medium threshold" });
type RiskValues = z.infer<typeof riskSchema>;

export function RiskForm({ initial, readOnly }: { initial: RiskSettings; readOnly: boolean }) {
  const f = useFormat();
  const defaults: RiskValues = { ...initial, highValueOrderAmount: toMajor(initial.highValueOrderAmount) };
  const form = useForm<RiskValues>({ resolver: zodResolver(riskSchema), defaultValues: defaults });
  const { save, pending } = useSaver("/api/settings/risk", { success: "Risk scoring saved" });
  const { errors, isDirty } = form.formState;
  const [medium, high, weights] = useWatch({ control: form.control, name: ["mediumThreshold", "highThreshold", "weights"] });
  const total = Object.values(weights ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const onSubmit = form.handleSubmit(async (v) => {
    if (await save({ ...v, highValueOrderAmount: toMinor(v.highValueOrderAmount) })) form.reset(v);
  });
  const m = Number.isFinite(medium) ? medium : 0;
  const h = Number.isFinite(high) ? high : 100;

  return (
    <form onSubmit={onSubmit} noValidate>
      <SectionCard
        title="Risk scoring"
        description="Every order gets a 0–100 fraud & RTO risk score. Tune what counts and where the lines are."
        icon={
          <span className="grid size-9 place-items-center rounded-lg bg-danger-soft text-danger">
            <ShieldAlert className="size-[18px]" aria-hidden />
          </span>
        }
      >
        <fieldset disabled={readOnly} className="space-y-6">
          <div>
            <div className="mb-2 flex h-2.5 overflow-hidden rounded-full" aria-hidden>
              <div className="bg-success" style={{ width: `${m}%` }} />
              <div className="bg-warning" style={{ width: `${Math.max(0, h - m)}%` }} />
              <div className="flex-1 bg-danger" />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Low · 0–{m - 1}</span>
              <span>Medium · {m}–{h - 1}</span>
              <span>High · {h}–100</span>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field id="mediumThreshold" label="Medium risk from" error={errors.mediumThreshold?.message}>
              <Input id="mediumThreshold" type="number" min={1} max={99} className="tabular" aria-invalid={!!errors.mediumThreshold} {...form.register("mediumThreshold", numberField)} />
            </Field>
            <Field id="highThreshold" label="High risk from" error={errors.highThreshold?.message}>
              <Input id="highThreshold" type="number" min={2} max={100} className="tabular" aria-invalid={!!errors.highThreshold} {...form.register("highThreshold", numberField)} />
            </Field>
            <Field id="highValueOrderAmount" label="High-value order" hint="Orders above this add risk." error={errors.highValueOrderAmount?.message}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{f.currencySymbol}</span>
                <Input id="highValueOrderAmount" type="number" min={0} inputMode="decimal" className="pl-11 tabular" aria-invalid={!!errors.highValueOrderAmount} {...form.register("highValueOrderAmount", numberField)} />
              </div>
            </Field>
          </div>
          <div className="rounded-xl border px-4 py-3.5">
            <Controller
              control={form.control}
              name="requireConfirmationForCod"
              render={({ field }) => (
                <SwitchRow
                  id="requireConfirmationForCod"
                  title="Require WhatsApp confirmation for COD"
                  description="COD orders wait for the customer to confirm before they're dispatched."
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={readOnly}
                />
              )}
            />
          </div>
          <div>
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Signal weights</h3>
              <span className="text-xs text-muted-foreground">
                Total weight <span className="tabular font-semibold text-foreground">{total}</span> · higher = more influence
              </span>
            </div>
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {WEIGHTS.map((w) => {
                const v = weights?.[w.key] ?? 0;
                return (
                  <SliderField
                    key={w.key}
                    id={`w-${w.key}`}
                    label={w.label}
                    value={v}
                    display={String(v)}
                    hint={w.hint}
                    min={0}
                    max={50}
                    step={1}
                    disabled={readOnly}
                    onChange={(n) => form.setValue(`weights.${w.key}`, n, { shouldDirty: true })}
                  />
                );
              })}
            </div>
          </div>
        </fieldset>
        <FormFooter dirty={isDirty} pending={pending} readOnly={readOnly} onReset={() => form.reset(defaults)} />
      </SectionCard>
    </form>
  );
}

// ───────────────────────── Inventory ─────────────────────────

const inventorySchema = z.object({
  defaultLowStockThreshold: num().int("Whole numbers only").min(0, "Can't be negative"),
  coverageWarningDays: num().min(0, "Can't be negative"),
  velocityWindowDays: num().int("Whole numbers only").min(1, "At least 1 day").max(90, "Max 90 days"),
});
type InventoryValues = z.infer<typeof inventorySchema>;

export function InventoryForm({ initial, readOnly }: { initial: InventoryValues; readOnly: boolean }) {
  const form = useForm<InventoryValues>({ resolver: zodResolver(inventorySchema), defaultValues: initial });
  const { save, pending } = useSaver("/api/settings/inventory", { success: "Inventory settings saved" });
  const { errors, isDirty } = form.formState;
  const onSubmit = form.handleSubmit(async (v) => {
    if (await save(v)) form.reset(v);
  });
  const suffix = (s: string) => <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{s}</span>;
  return (
    <form onSubmit={onSubmit} noValidate>
      <SectionCard title="Inventory intelligence" description="Defaults the Inventory Agent uses when a product has no threshold of its own." icon={<Package className="size-4 text-muted-foreground" aria-hidden />}>
        <fieldset disabled={readOnly} className="grid gap-5 sm:grid-cols-3">
          <Field id="defaultLowStockThreshold" label="Low-stock threshold" hint="Alert when a variant drops below." error={errors.defaultLowStockThreshold?.message}>
            <div className="relative">
              <Input id="defaultLowStockThreshold" type="number" min={0} className="pr-14 tabular" aria-invalid={!!errors.defaultLowStockThreshold} {...form.register("defaultLowStockThreshold", numberField)} />
              {suffix("units")}
            </div>
          </Field>
          <Field id="coverageWarningDays" label="Coverage warning" hint="Warn when stock lasts fewer days." error={errors.coverageWarningDays?.message}>
            <div className="relative">
              <Input id="coverageWarningDays" type="number" min={0} step="0.5" className="pr-12 tabular" aria-invalid={!!errors.coverageWarningDays} {...form.register("coverageWarningDays", numberField)} />
              {suffix("days")}
            </div>
          </Field>
          <Field id="velocityWindowDays" label="Sales velocity window" hint="Days of sales used to forecast." error={errors.velocityWindowDays?.message}>
            <div className="relative">
              <Input id="velocityWindowDays" type="number" min={1} max={90} className="pr-12 tabular" aria-invalid={!!errors.velocityWindowDays} {...form.register("velocityWindowDays", numberField)} />
              {suffix("days")}
            </div>
          </Field>
        </fieldset>
        <FormFooter dirty={isDirty} pending={pending} readOnly={readOnly} onReset={() => form.reset(initial)} />
      </SectionCard>
    </form>
  );
}
