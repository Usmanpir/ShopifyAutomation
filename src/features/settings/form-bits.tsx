"use client";

import { cn } from "cn";
import { Check, Copy, Loader2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/client/api";

/** Label + control + hint/error, stacked. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
  aside,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A toggle row: title + description on the left, switch on the right. */
export function SwitchRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  icon,
}: {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 gap-3">
        {icon && <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-medium">
            {title}
          </label>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-1" />
    </div>
  );
}

/** Sticky-feeling footer for a settings card: dirty hint + save. */
export function FormFooter({ dirty, pending, readOnly, onReset, label = "Save changes" }: { dirty: boolean; pending: boolean; readOnly?: boolean; onReset?: () => void; label?: string }) {
  if (readOnly) return null;
  return (
    <div className="-mx-5 mt-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-surface-2/50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {dirty ? "You have unsaved changes" : "All changes saved"}
      </p>
      <div className="flex gap-2">
        {onReset && dirty && (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onReset} disabled={pending}>
            Discard
          </Button>
        )}
        <Button type="submit" size="sm" className="h-8 min-w-28" disabled={!dirty || pending}>
          {pending && <Loader2 className="animate-spin" />}
          {label}
        </Button>
      </div>
    </div>
  );
}

export function ReadOnlyNotice({ children = "You have view-only access to these settings. Ask an owner or admin to make changes." }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-[13px] text-muted-foreground">
      <Lock className="size-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

/** PATCH/POST a settings payload with toast + refresh. Returns a submit fn and pending flag. */
export function useSaver(path: string, { method = "PATCH", success = "Settings saved" }: { method?: "PATCH" | "POST"; success?: string } = {}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const save = async (body: unknown): Promise<boolean> => {
    setPending(true);
    try {
      await api(path, { method, body });
      toast.success(success);
      router.refresh();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setPending(false);
    }
  };
  return { save, pending };
}

export function CopyButton({ value, label = "Copy", className, size = "sm", variant = "outline" }: { value: string; label?: string; className?: string; size?: "sm" | "xs" | "icon-sm"; variant?: "outline" | "ghost" | "secondary" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
    }
  };
  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={copy} aria-label={size === "icon-sm" ? `${label}` : undefined}>
      {copied ? <Check className="text-success" /> : <Copy />}
      {size !== "icon-sm" && (copied ? "Copied" : label)}
    </Button>
  );
}

/** Read-only value with a copy button (URLs, secrets shown once, etc.). */
export function CopyField({ value, label, mono = true }: { value: string; label: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-surface-2/60 py-1 pr-1 pl-3">
      <code aria-label={label} className={cn("min-w-0 flex-1 truncate text-[13px]", mono ? "font-mono" : "")} title={value}>
        {value}
      </code>
      <CopyButton value={value} label={`Copy ${label}`} size="icon-sm" variant="ghost" />
    </div>
  );
}

/** Number input that keeps RHF happy with empty strings. */
export const numberField = { setValueAs: (v: unknown) => (v === "" || v === null || v === undefined ? undefined : Number(v)) };
