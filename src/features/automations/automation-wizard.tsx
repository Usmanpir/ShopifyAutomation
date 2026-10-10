"use client";

import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowLeft, ArrowRight, Check, Loader2, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { nodeVerb, orderedNodes } from "@/lib/automation/describe";
import { RECIPES, RECIPES_BY_KEY } from "@/lib/automation/recipes";
import { api, errorMessage } from "@/lib/client/api";

const STEPS = ["What", "When", "AI does", "Review", "Turn on"] as const;

/** 5-step automation wizard: what → when → what AI does → review → turn on. */
export function AutomationWizardButton({ label = "Create automation" }: { label?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(params.get("create") === "1");
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o && params.get("create")) router.replace(pathname, { scroll: false });
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Sparkles /> {label}
      </Button>
      {open && <Wizard open={open} onOpenChange={onOpenChange} />}
    </>
  );
}

function Wizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [recipeKey, setRecipeKey] = useState<string>(RECIPES[0]!.key);
  const recipe = RECIPES_BY_KEY.get(recipeKey)!;
  const [opts, setOpts] = useState<Record<string, string>>({});
  const values = useMemo(() => Object.fromEntries([...recipe.timing, ...recipe.actions].map((c) => [c.id, opts[c.id] ?? c.default])), [recipe, opts]);
  const built = useMemo(() => recipe.build(values), [recipe, values]);

  const create = useMutation({
    mutationFn: (activate: boolean) => api<{ id: string; active: boolean }>("/api/automations/recipes", { body: { recipe: recipeKey, options: values, activate } }),
    onSuccess: (r) => {
      onOpenChange(false);
      if (r.active) {
        toast.success(`“${built.name}” is on`, { description: "You'll see each run under Activity." });
        router.refresh();
      } else router.push(`/automations/${r.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const choice = (c: { id: string; label: string; options: { value: string; label: string }[] }) => (
    <fieldset key={c.id} className="space-y-2">
      <legend className="text-sm font-medium">{c.label}</legend>
      <RadioGroup value={values[c.id]} onValueChange={(v) => setOpts((o) => ({ ...o, [c.id]: v }))} className="grid gap-2 sm:grid-cols-3">
        {c.options.map((o) => (
          <label key={o.value} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition", values[c.id] === o.value ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
            <RadioGroupItem value={o.value} />
            {o.label}
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="border-b px-5 pt-5 pb-4">
          <DialogTitle className="text-base">New automation</DialogTitle>
          <DialogDescription className="mt-0.5 text-[13px]">Answer a few questions — no workflow building needed.</DialogDescription>
          <ol className="mt-4 flex items-center gap-1.5" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 items-center gap-1.5">
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold", i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
                  {i < step ? <Check className="size-3" /> : i + 1}
                </span>
                <span className={cn("hidden text-xs sm:inline", i === step ? "font-medium" : "text-muted-foreground")}>{s}</span>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
              </li>
            ))}
          </ol>
        </div>

        <div className="scrollbar-thin max-h-[60dvh] overflow-y-auto px-5 py-5">
          {step === 0 && (
            <fieldset>
              <legend className="mb-3 text-sm font-medium">What do you want to automate?</legend>
              <RadioGroup value={recipeKey} onValueChange={(v) => {
                  setRecipeKey(v);
                  setOpts({});
                }} className="grid gap-2 sm:grid-cols-2">
                {RECIPES.map((r) => (
                  <label key={r.key} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3.5 transition", recipeKey === r.key ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                    <RadioGroupItem value={r.key} className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-semibold">{r.goal}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{r.description}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          )}
          {step === 1 && (
            <div className="space-y-5">
              <div className="rounded-lg bg-surface-2 px-3.5 py-3 text-sm">
                <span className="font-semibold">When</span> {recipe.when.charAt(0).toLowerCase() + recipe.when.slice(1)}
              </div>
              {recipe.timing.length ? recipe.timing.map(choice) : <p className="text-sm text-muted-foreground">This one runs right away — nothing to set.</p>}
            </div>
          )}
          {step === 2 && <div className="space-y-5">{recipe.actions.length ? recipe.actions.map(choice) : <p className="text-sm text-muted-foreground">The steps are fixed for this automation — you can fine-tune them later in the Advanced editor.</p>}</div>}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <p className="text-[15px] font-semibold">{built.name}</p>
                <p className="text-[13px] text-muted-foreground">{built.description}</p>
              </div>
              <ol className="space-y-1.5">
                {orderedNodes(built.graph).map(({ node, depth, via }) => (
                  <li key={node.key} className="flex items-baseline gap-2 text-sm" style={{ paddingLeft: Math.min(depth, 4) * 12 }}>
                    <span className="w-16 shrink-0 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{nodeVerb(node)}</span>
                    <span>
                      {node.label}
                      {via && via.handle !== "next" && <span className="ml-1.5 text-xs text-muted-foreground">(if {via.handle.replace(/_/g, " ")})</span>}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="flex items-start gap-2 rounded-lg bg-success-soft/60 px-3 py-2.5 text-[13px]">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {recipe.safety}
              </p>
            </div>
          )}
          {step === 4 && (
            <div className="flex flex-col items-center py-6 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-ai-soft text-ai">
                <Workflow className="size-6" />
              </span>
              <p className="mt-3 text-[15px] font-semibold">Ready to turn on “{built.name}”</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">It starts with the next matching event. You can pause it any time, and every run is logged.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-surface-2/50 px-5 py-3">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={create.isPending}>
              <ArrowLeft /> Back
            </Button>
          ) : (
            <Button variant="ghost" asChild>
              <Link href="/automations/new" prefetch={false}>
                Advanced editor
              </Link>
            </Button>
          )}
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => create.mutate(false)} disabled={create.isPending}>
                Open in editor
              </Button>
              <Button onClick={() => create.mutate(true)} disabled={create.isPending}>
                {create.isPending ? <Loader2 className="animate-spin" /> : <Check />} Turn on
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
