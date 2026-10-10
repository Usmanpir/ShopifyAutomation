"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { ArrowUpRight, Check, Cpu, KeyRound, Sparkles } from "lucide-react";
import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { SectionCard } from "@/components/shared/page";
import { StatusPill } from "@/components/shared/status";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormFooter, useSaver } from "./form-bits";

export type ProviderOption = { key: "local" | "openai" | "anthropic" | "gemini"; name: string; defaultModel: string; configured: boolean; source: "builtin" | "integration" | "env" | null };

const PROVIDER_BLURB: Record<ProviderOption["key"], string> = {
  local: "Deterministic rules engine. Free, instant, no API key — great to start.",
  anthropic: "Claude models — strong reasoning and careful, on-brand replies.",
  openai: "GPT models — broad general knowledge and tool use.",
  gemini: "Gemini models — fast and cost-efficient at high volume.",
};

const LANGUAGES = [
  { value: "auto", label: "Match the customer (recommended)" },
  { value: "english", label: "English" },
  { value: "roman_urdu", label: "Roman Urdu" },
  { value: "urdu", label: "Urdu (اردو)" },
];

const schema = z.object({
  provider: z.enum(["local", "openai", "anthropic", "gemini"]),
  model: z.string().trim().max(100, "Model name is too long"),
  temperature: z.number().min(0).max(1),
  handoffConfidence: z.number().min(0).max(1),
  replyLanguage: z.enum(["auto", "english", "roman_urdu", "urdu"]),
  brandVoice: z.string().trim().max(500, "Keep the brand voice under 500 characters"),
});
type Values = z.infer<typeof schema>;

export function AISettingsForm({ initial, providers, readOnly }: { initial: Values; providers: ProviderOption[]; readOnly: boolean }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const { save, pending } = useSaver("/api/settings/ai", { success: "AI settings saved" });
  const { errors, isDirty } = form.formState;
  const [providerKey, temperature, handoff, voice] = useWatch({ control: form.control, name: ["provider", "temperature", "handoffConfidence", "brandVoice"] });
  const provider = providers.find((p) => p.key === providerKey) ?? providers[0];

  const onSubmit = form.handleSubmit(async (v) => {
    if (await save(v)) form.reset(v);
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <SectionCard title="AI provider" description="The model behind the assistant, agents and WhatsApp replies. Without a key, the app falls back to the built-in engine so nothing breaks.">
        <fieldset disabled={readOnly} className="space-y-6">
          <legend className="sr-only">AI provider</legend>
          <Controller
            control={form.control}
            name="provider"
            render={({ field }) => (
              <div role="radiogroup" aria-label="AI provider" className="grid gap-3 sm:grid-cols-2">
                {providers.map((p) => {
                  const active = field.value === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        field.onChange(p.key);
                        if (p.key !== initial.provider) form.setValue("model", "", { shouldDirty: true });
                      }}
                      className={cn(
                        "relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed",
                        active ? "border-primary bg-primary/[0.04] ring-1 ring-primary" : "hover:border-foreground/20 hover:bg-muted/30",
                      )}
                    >
                      <div className="flex w-full items-center gap-2.5">
                        <span className={cn("grid size-8 place-items-center rounded-lg", p.key === "local" ? "bg-brand-soft text-brand" : "bg-ai-soft text-ai")}>
                          {p.key === "local" ? <Cpu className="size-4" /> : <Sparkles className="size-4" />}
                        </span>
                        <span className="text-sm font-semibold">{p.name}</span>
                        <span className={cn("ml-auto grid size-5 place-items-center rounded-full border", active ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                          {active && <Check className="size-3" />}
                        </span>
                      </div>
                      <p className="text-[13px] text-muted-foreground">{PROVIDER_BLURB[p.key]}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {p.key === "local" ? (
                          <StatusPill tone="brand">Always available</StatusPill>
                        ) : p.configured ? (
                          <StatusPill tone="success">Key configured{p.source === "env" ? " · server" : ""}</StatusPill>
                        ) : (
                          <StatusPill tone="warning">No API key</StatusPill>
                        )}
                        <span className="font-mono text-[11px] text-muted-foreground">{p.defaultModel}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          />
          {provider.key !== "local" && !provider.configured && (
            <div role="status" className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-[13px]">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  Add a {provider.name} API key in Integrations to use it. Until then, requests use the built-in engine.
                </span>
              </p>
              <Link href="/integrations#ai" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                Add API key <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="model" label="Model" hint={provider.key === "local" ? "The built-in engine has a single model." : `Leave empty to use ${provider.defaultModel}.`} error={errors.model?.message}>
              <Input id="model" placeholder={provider.defaultModel} className="font-mono text-[13px]" disabled={readOnly || provider.key === "local"} {...form.register("model")} />
            </Field>
            <Controller
              control={form.control}
              name="replyLanguage"
              render={({ field }) => (
                <Field id="replyLanguage" label="Reply language" hint="Language for customer-facing replies.">
                  <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                    <SelectTrigger id="replyLanguage" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <SliderField
              id="temperature"
              label="Creativity (temperature)"
              value={temperature}
              display={temperature.toFixed(2)}
              hint={temperature <= 0.3 ? "Precise and consistent — best for operations." : temperature <= 0.6 ? "Balanced." : "More varied wording — best for marketing copy."}
              onChange={(v) => form.setValue("temperature", v, { shouldDirty: true })}
              disabled={readOnly}
            />
            <SliderField
              id="handoff"
              label="Human handoff confidence"
              value={handoff}
              display={`${Math.round(handoff * 100)}%`}
              hint={`WhatsApp agent hands the chat to a person when it's less than ${Math.round(handoff * 100)}% sure.`}
              onChange={(v) => form.setValue("handoffConfidence", v, { shouldDirty: true })}
              disabled={readOnly}
            />
          </div>

          <Field id="brandVoice" label="Brand voice" aside={<span className="tabular text-xs text-muted-foreground">{voice.length}/500</span>} hint="How the AI should sound when talking to customers." error={errors.brandVoice?.message}>
            <Textarea id="brandVoice" rows={3} placeholder="Friendly, concise and respectful…" aria-invalid={!!errors.brandVoice} {...form.register("brandVoice")} />
          </Field>
        </fieldset>
        <FormFooter dirty={isDirty} pending={pending} readOnly={readOnly} onReset={() => form.reset(initial)} />
      </SectionCard>
    </form>
  );
}

export function SliderField({
  id,
  label,
  value,
  display,
  hint,
  onChange,
  disabled,
  min = 0,
  max = 1,
  step = 0.05,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  hint?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span id={`${id}-label`} className="text-sm font-medium">
          {label}
        </span>
        <span className="tabular rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold">{display}</span>
      </div>
      <Slider aria-labelledby={`${id}-label`} value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} disabled={disabled} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
