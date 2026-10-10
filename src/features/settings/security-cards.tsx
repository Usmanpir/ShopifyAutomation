"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { KeyRound, Laptop, Loader2, LogOut, ShieldCheck, ShieldOff, Smartphone, Tablet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SectionCard } from "@/components/shared/page";
import { Bone } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/states";
import { StatusPill } from "@/components/shared/status";
import { useFormat } from "@/components/store-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";
import { timeAgo } from "@/lib/format";
import { changePasswordSchema } from "@/schemas/auth";
import { CopyButton, CopyField, Field } from "./form-bits";

// ───────────────────────── Password ─────────────────────────

const passwordFormSchema = changePasswordSchema
  .extend({ confirmPassword: z.string().min(1, "Confirm your new password") })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a password different from your current one" });
type PasswordValues = z.infer<typeof passwordFormSchema>;

export function PasswordForm() {
  const form = useForm<PasswordValues>({ resolver: zodResolver(passwordFormSchema), defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const { errors, isSubmitting } = form.formState;
  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    setServerError(null);
    try {
      await api("/api/account/password", { body: { currentPassword, newPassword } });
      toast.success("Password updated", { description: "Other devices have been signed out." });
      form.reset();
      void qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (e) {
      setServerError(errorMessage(e));
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate>
      <SectionCard title="Password" description="Changing your password signs you out everywhere else." icon={<KeyRound className="size-4 text-muted-foreground" aria-hidden />}>
        <div className="space-y-4">
          {serverError && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {serverError}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="currentPassword" label="Current password" error={errors.currentPassword?.message}>
              <Input id="currentPassword" type="password" autoComplete="current-password" aria-invalid={!!errors.currentPassword} {...form.register("currentPassword")} />
            </Field>
            <Field id="newPassword" label="New password" hint="10+ characters with a letter and a number." error={errors.newPassword?.message}>
              <Input id="newPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...form.register("newPassword")} />
            </Field>
            <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
              <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...form.register("confirmPassword")} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" className="h-8" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Update password
            </Button>
          </div>
        </div>
      </SectionCard>
    </form>
  );
}

// ───────────────────────── Two-factor ─────────────────────────

function groupSecret(secret: string) {
  return secret.replace(/\s+/g, "").match(/.{1,4}/g)?.join(" ") ?? secret;
}

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      setSetup(await api<{ secret: string; uri: string }>("/api/account/2fa", { body: {} }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      await api("/api/account/2fa", { body: { code } });
      toast.success("Two-factor authentication enabled");
      setSetup(null);
      setCode("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <SectionCard
      title="Two-factor authentication"
      description="Require a code from an authenticator app when signing in."
      icon={
        <span className={cn("grid size-9 place-items-center rounded-lg", enabled ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>
          {enabled ? <ShieldCheck className="size-[18px]" aria-hidden /> : <ShieldOff className="size-[18px]" aria-hidden />}
        </span>
      }
      action={<StatusPill tone={enabled ? "success" : "neutral"}>{enabled ? "Enabled" : "Off"}</StatusPill>}
    >
      {enabled ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted-foreground">Your account is protected. You&apos;ll be asked for a code each time you sign in on a new device.</p>
          <DisableTwoFactorDialog />
        </div>
      ) : !setup ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted-foreground">Recommended for owners and admins — it stops anyone with your password from signing in.</p>
          <Button size="sm" className="h-8 shrink-0" onClick={start} disabled={starting}>
            {starting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Enable 2FA
          </Button>
        </div>
      ) : (
        <form onSubmit={verify} className="animate-fade-in space-y-5">
          <ol className="space-y-5">
            <li className="flex gap-3">
              <Step n={1} />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium">Add CommerceAI to your authenticator app</p>
                <p className="text-[13px] text-muted-foreground">Open Google Authenticator, 1Password, Authy or similar and choose “Enter a setup key”. Paste this key:</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code aria-label="Setup key" className="rounded-lg border bg-surface-2 px-3 py-2 font-mono text-[15px] font-semibold tracking-wider break-all">
                    {groupSecret(setup.secret)}
                  </code>
                  <CopyButton value={setup.secret} label="Copy key" />
                </div>
                <details className="group text-[13px]">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Using a password manager? Copy the otpauth:// link instead</summary>
                  <div className="mt-2">
                    <CopyField value={setup.uri} label="otpauth URI" />
                  </div>
                </details>
              </div>
            </li>
            <li className="flex gap-3">
              <Step n={2} />
              <div className="min-w-0 flex-1 space-y-2">
                <label htmlFor="totp" className="text-sm font-medium">
                  Enter the 6-digit code it shows
                </label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="totp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    aria-invalid={!!error}
                    className="h-10 w-40 text-center font-mono text-lg tracking-[0.4em]"
                  />
                  <Button type="submit" className="h-10" disabled={verifying || code.length !== 6}>
                    {verifying && <Loader2 className="animate-spin" />}
                    Verify & enable
                  </Button>
                  <Button type="button" variant="ghost" className="h-10" onClick={() => setSetup(null)}>
                    Cancel
                  </Button>
                </div>
                {error && (
                  <p role="alert" className="text-xs text-danger">
                    {error}
                  </p>
                )}
              </div>
            </li>
          </ol>
        </form>
      )}
    </SectionCard>
  );
}

function Step({ n }: { n: number }) {
  return <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>;
}

function DisableTwoFactorDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Enter your password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/account/2fa", { method: "DELETE", body: { password } });
      toast.success("Two-factor authentication disabled");
      setOpen(false);
      setPassword("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setPassword("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 shrink-0">
          Disable 2FA
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication?</DialogTitle>
            <DialogDescription>Your account will only be protected by your password. Confirm your password to continue.</DialogDescription>
          </DialogHeader>
          <Field id="disable-2fa-password" label="Password" error={error ?? undefined}>
            <Input id="disable-2fa-password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Disable 2FA
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Sessions ─────────────────────────

type SessionRow = { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string; current: boolean };

export function describeUserAgent(ua: string | null) {
  if (!ua) return { label: "Unknown device", kind: "desktop" as const };
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /curl|node|undici|Playwright/i.test(ua) ? "API client" : "Browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  const kind = /iPad|Tablet/.test(ua) ? ("tablet" as const) : /iPhone|Android.*Mobile|Mobile/.test(ua) ? ("mobile" as const) : ("desktop" as const);
  return { label: os ? `${browser} on ${os}` : browser, kind };
}

export function SessionsCard() {
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sessions"], queryFn: () => api<SessionRow[]>("/api/account/sessions") });
  const [showAll, setShowAll] = useState(false);
  const others = q.data?.filter((s) => !s.current) ?? [];
  const visible = q.data ? (showAll ? q.data : q.data.slice(0, 5)) : [];
  const revokeOthers = async () => {
    let failed = 0;
    for (const s of others) {
      try {
        await api(`/api/account/sessions/${s.id}`, { method: "DELETE" });
      } catch {
        failed++;
      }
    }
    if (failed) toast.error(`${failed} session${failed === 1 ? "" : "s"} couldn't be signed out`);
    else toast.success(`Signed out ${others.length} other session${others.length === 1 ? "" : "s"}`);
    await qc.invalidateQueries({ queryKey: ["sessions"] });
  };
  const revoke = async (id: string) => {
    try {
      await api(`/api/account/sessions/${id}`, { method: "DELETE" });
      toast.success("Session signed out");
      await qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <SectionCard
      title="Active sessions"
      description={q.data ? `${q.data.length} device${q.data.length === 1 ? "" : "s"} signed in to your account.` : "Devices currently signed in to your account."}
      contentClassName="px-0 pb-0"
      action={
        others.length > 0 ? (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" className="h-8">
                <LogOut /> Sign out others
              </Button>
            }
            title={`Sign out ${others.length} other session${others.length === 1 ? "" : "s"}?`}
            description="Every device except this one will need to sign in again."
            confirmLabel="Sign out others"
            destructive
            onConfirm={revokeOthers}
          />
        ) : null
      }
    >
      {q.isPending ? (
        <ul className="divide-y border-t">
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3.5">
              <Bone className="size-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Bone className="h-3.5 w-40" />
                <Bone className="h-3 w-56" />
              </div>
            </li>
          ))}
        </ul>
      ) : q.isError ? (
        <ErrorState description="We couldn't load your sessions." onRetry={() => q.refetch()} className="border-t py-8" />
      ) : (
        <ul className="divide-y border-t">
          {visible.map((s) => {
            const d = describeUserAgent(s.userAgent);
            const Icon = d.kind === "mobile" ? Smartphone : d.kind === "tablet" ? Tablet : Laptop;
            return (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", s.current ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {d.label}
                    {s.current && <StatusPill tone="success">This device</StatusPill>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground" title={s.userAgent ?? undefined}>
                    {s.ip ?? "Unknown IP"} · Last active {s.current ? "now" : timeAgo(s.lastSeenAt)} · Signed in {f.date(s.createdAt)}
                  </p>
                </div>
                {!s.current && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm" className="h-8 shrink-0 text-muted-foreground hover:text-danger">
                        <LogOut /> <span className="hidden sm:inline">Sign out</span>
                      </Button>
                    }
                    title="Sign out this device?"
                    description={`${d.label} (${s.ip ?? "unknown IP"}) will need to sign in again.`}
                    confirmLabel="Sign out device"
                    destructive
                    onConfirm={() => revoke(s.id)}
                  />
                )}
              </li>
            );
          })}
          {q.data.length > 5 && (
            <li>
              <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full px-5 py-3 text-center text-[13px] font-medium text-primary hover:bg-muted/30">
                {showAll ? "Show fewer" : `Show all ${q.data.length} sessions`}
              </button>
            </li>
          )}
        </ul>
      )}
    </SectionCard>
  );
}
