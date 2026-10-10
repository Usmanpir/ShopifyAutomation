"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Store } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { SectionCard } from "@/components/shared/page";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FormFooter, useSaver } from "./form-bits";

const CURRENCIES = [
  { value: "PKR", label: "PKR — Pakistani Rupee" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "AED", label: "AED — UAE Dirham" },
  { value: "SAR", label: "SAR — Saudi Riyal" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "INR", label: "INR — Indian Rupee" },
  { value: "BDT", label: "BDT — Bangladeshi Taka" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
];

const LOCALES = [
  { value: "en-PK", label: "English (Pakistan)" },
  { value: "ur-PK", label: "اردو (Pakistan)" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-AE", label: "English (UAE)" },
  { value: "ar-AE", label: "العربية (UAE)" },
  { value: "en-IN", label: "English (India)" },
];

const TIMEZONES = [
  { group: "Asia", items: ["Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata", "Asia/Dhaka", "Asia/Singapore"] },
  { group: "Europe", items: ["Europe/London", "Europe/Berlin", "Europe/Istanbul"] },
  { group: "Americas", items: ["America/New_York", "America/Chicago", "America/Los_Angeles", "America/Toronto"] },
  { group: "Other", items: ["Australia/Sydney", "UTC"] },
];

function tzOffset(tz: string) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName");
    return part?.value.replace("GMT", "UTC") ?? "";
  } catch {
    return "";
  }
}

const schema = z.object({
  name: z.string().trim().min(2, "Store name must be at least 2 characters").max(80, "Keep it under 80 characters"),
  logoUrl: z.union([z.literal(""), z.string().trim().url("Enter a full URL starting with https://")]),
  currency: z.string().length(3),
  locale: z.string().min(2),
  timezone: z.string().min(1),
});
type Values = z.infer<typeof schema>;

export function GeneralForm({ initial, readOnly }: { initial: { name: string; logoUrl: string | null; currency: string; locale: string; timezone: string }; readOnly: boolean }) {
  const defaults: Values = { ...initial, logoUrl: initial.logoUrl ?? "" };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { save, pending } = useSaver("/api/settings/general", { success: "Store details saved" });
  const { errors, isDirty } = form.formState;
  const [logo, tz, currency, locale] = useWatch({ control: form.control, name: ["logoUrl", "timezone", "currency", "locale"] });

  const withCurrent = <T extends { value: string }>(list: T[], v: string, make: (v: string) => T) => (list.some((i) => i.value === v) ? list : [make(v), ...list]);
  const currencies = withCurrent(CURRENCIES, currency, (v) => ({ value: v, label: v }));
  const locales = withCurrent(LOCALES, locale, (v) => ({ value: v, label: v }));
  const allTz = TIMEZONES.flatMap((g) => g.items);

  let preview = "";
  try {
    preview = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(4250);
  } catch {
    preview = `${currency} 4,250`;
  }

  const onSubmit = form.handleSubmit(async (v) => {
    const ok = await save({ ...v, logoUrl: v.logoUrl || null });
    if (ok) form.reset(v);
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <SectionCard title="Store details" description="Shown across the app, in reports and in customer-facing messages.">
        <fieldset disabled={readOnly} className="space-y-5">
          <div className="flex items-start gap-4">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-surface-2 text-muted-foreground">
              {logo && /^https?:\/\//.test(logo) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Store logo preview" className="size-full object-cover" />
              ) : (
                <Store className="size-6" aria-hidden />
              )}
            </div>
            <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
              <Field id="name" label="Store name" error={errors.name?.message}>
                <Input id="name" aria-invalid={!!errors.name} {...form.register("name")} />
              </Field>
              <Field id="logoUrl" label="Logo URL" hint="Square PNG or SVG works best." error={errors.logoUrl?.message}>
                <Input id="logoUrl" type="url" placeholder="https://cdn.shopify.com/…/logo.png" aria-invalid={!!errors.logoUrl} {...form.register("logoUrl")} />
              </Field>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="currency" label="Currency" hint={`Preview: ${preview}`}>
              <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                    <SelectTrigger id="currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field id="locale" label="Locale" hint="Number and date formatting.">
              <Controller
                control={form.control}
                name="locale"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                    <SelectTrigger id="locale" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {locales.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field id="timezone" label="Timezone" hint={`Schedules and reports run in ${tz} (${tzOffset(tz)}).`}>
              <Controller
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                    <SelectTrigger id="timezone" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {!allTz.includes(field.value) && <SelectItem value={field.value}>{field.value}</SelectItem>}
                      {TIMEZONES.map((g) => (
                        <SelectGroup key={g.group}>
                          <SelectLabel>{g.group}</SelectLabel>
                          {g.items.map((t) => (
                            <SelectItem key={t} value={t}>
                              <span>{t.replace("_", " ")}</span>
                              <span className="ml-auto pl-3 text-xs text-muted-foreground">{tzOffset(t)}</span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
        </fieldset>
        <FormFooter dirty={isDirty} pending={pending} readOnly={readOnly} onReset={() => form.reset(defaults)} />
      </SectionCard>
    </form>
  );
}
