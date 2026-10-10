"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2, ShieldCheck, ShieldOff, Trash2, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/states";
import { StatusPill } from "@/components/shared/status";
import { useFormat } from "@/components/store-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Role } from "@/generated/prisma/enums";
import { api, errorMessage } from "@/lib/client/api";
import { initials, timeAgo } from "@/lib/format";
import { canAssignRole, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/rbac";
import { CopyField, Field } from "./form-bits";

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
  role: Role;
  joinedAt: string;
};

const ROLES = Object.keys(ROLE_LABELS) as Role[];

function RoleSelect({ member, actorRole, isSelf, canManage }: { member: MemberRow; actorRole: Role; isSelf: boolean; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const editable = canManage && !isSelf && canAssignRole(actorRole, member.role);
  if (!editable) return <StatusPill tone={member.role === "OWNER" ? "brand" : "neutral"} dot={false}>{ROLE_LABELS[member.role]}</StatusPill>;
  const change = async (role: string) => {
    setBusy(true);
    try {
      await api(`/api/team/${member.id}`, { method: "PATCH", body: { role } });
      toast.success(`${member.name} is now ${ROLE_LABELS[role as Role]}`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Select value={member.role} onValueChange={change} disabled={busy}>
      <SelectTrigger size="sm" className="h-8 w-44" aria-label={`Role for ${member.name}`}>
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.filter((r) => canAssignRole(actorRole, r)).map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RemoveButton({ member, actorRole, isSelf, canManage }: { member: MemberRow; actorRole: Role; isSelf: boolean; canManage: boolean }) {
  const router = useRouter();
  if (!canManage || isSelf || !canAssignRole(actorRole, member.role)) return null;
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.name}`} className="text-muted-foreground hover:text-danger">
          <Trash2 />
        </Button>
      }
      title={`Remove ${member.name}?`}
      description={`${member.email} will lose access to this store immediately and be signed out of all sessions. Their account and past activity in the audit log are kept.`}
      confirmLabel="Remove member"
      destructive
      onConfirm={async () => {
        try {
          await api(`/api/team/${member.id}`, { method: "DELETE" });
          toast.success(`${member.name} removed`);
          router.refresh();
        } catch (e) {
          toast.error(errorMessage(e));
        }
      }}
    />
  );
}

function Person({ m, isSelf }: { m: MemberRow; isSelf: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9">
        {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt="" />}
        <AvatarFallback className="bg-brand-soft text-xs font-semibold text-brand">{initials(m.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">
          {m.name} {isSelf && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">You</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{m.email}</p>
      </div>
    </div>
  );
}

function TwoFactor({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
      <ShieldCheck className="size-3.5" aria-hidden /> Enabled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ShieldOff className="size-3.5" aria-hidden /> Off
    </span>
  );
}

export function TeamMembers({ members, currentUserId, actorRole, canManage }: { members: MemberRow[]; currentUserId: string; actorRole: Role; canManage: boolean }) {
  const f = useFormat();
  const columns: Column<MemberRow>[] = [
    { key: "person", header: "Member", cell: (m) => <Person m={m} isSelf={m.userId === currentUserId} /> },
    { key: "role", header: "Role", cell: (m) => <RoleSelect member={m} actorRole={actorRole} isSelf={m.userId === currentUserId} canManage={canManage} /> },
    { key: "2fa", header: "2FA", cell: (m) => <TwoFactor on={m.twoFactorEnabled} />, hideBelow: "lg" },
    { key: "login", header: "Last login", cell: (m) => <span className="text-[13px] text-muted-foreground" title={m.lastLoginAt ? f.dateTime(m.lastLoginAt) : undefined}>{m.lastLoginAt ? timeAgo(m.lastLoginAt) : "Never"}</span> },
    { key: "joined", header: "Joined", cell: (m) => <span className="text-[13px] text-muted-foreground">{f.date(m.joinedAt)}</span>, hideBelow: "xl" },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", cell: (m) => <RemoveButton member={m} actorRole={actorRole} isSelf={m.userId === currentUserId} canManage={canManage} /> },
  ];
  return (
    <DataTable
      caption="Team members"
      columns={columns}
      rows={members}
      empty={<EmptyState icon={<Users />} title="No teammates yet" description="Invite your team so support, marketing and operations can work from one place." />}
      mobileCard={(m) => (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <Person m={m} isSelf={m.userId === currentUserId} />
            <RemoveButton member={m} actorRole={actorRole} isSelf={m.userId === currentUserId} canManage={canManage} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <RoleSelect member={m} actorRole={actorRole} isSelf={m.userId === currentUserId} canManage={canManage} />
            <TwoFactor on={m.twoFactorEnabled} />
            <span className="text-xs text-muted-foreground">Last login {m.lastLoginAt ? timeAgo(m.lastLoginAt) : "never"}</span>
          </div>
        </div>
      )}
    />
  );
}

const inviteSchema = z.object({
  name: z.string().trim().min(2, "Enter their full name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "SUPPORT_AGENT", "MARKETING_MANAGER", "VIEWER"]),
});
type InviteValues = z.infer<typeof inviteSchema>;

export function InviteMemberDialog({ actorRole }: { actorRole: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ email: string; temporaryPassword: string | null } | null>(null);
  const form = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { name: "", email: "", role: "SUPPORT_AGENT" } });
  const { errors, isSubmitting } = form.formState;
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit(async (v) => {
    setServerError(null);
    try {
      const res = await api<{ membershipId: string; temporaryPassword: string | null }>("/api/team", { body: v });
      toast.success(`${v.name} added to the team`);
      setResult({ email: v.email, temporaryPassword: res.temporaryPassword });
      router.refresh();
    } catch (e) {
      setServerError(errorMessage(e));
    }
  });

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setTimeout(() => {
        setResult(null);
        setServerError(null);
        form.reset();
      }, 200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button className="h-9">
          <UserPlus /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Member added</DialogTitle>
              <DialogDescription>
                {result.temporaryPassword ? `Share these sign-in details with ${result.email} securely. They should change the password after signing in.` : `${result.email} already has an account and can sign in with their existing password.`}
              </DialogDescription>
            </DialogHeader>
            {result.temporaryPassword && (
              <div role="status" className="space-y-3 rounded-xl border border-warning/30 bg-warning-soft/50 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="size-4 text-warning" aria-hidden /> Temporary password
                </p>
                <CopyField value={result.temporaryPassword} label="temporary password" />
                <p className="text-xs text-muted-foreground">This is shown only once — we don&apos;t store it in plain text.</p>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>They&apos;ll get access to this store with the role you choose.</DialogDescription>
            </DialogHeader>
            {serverError && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {serverError}
              </p>
            )}
            <Field id="invite-name" label="Full name" error={errors.name?.message}>
              <Input id="invite-name" autoFocus placeholder="Ayesha Khan" aria-invalid={!!errors.name} {...form.register("name")} />
            </Field>
            <Field id="invite-email" label="Email" error={errors.email?.message}>
              <Input id="invite-email" type="email" placeholder="ayesha@yourstore.pk" aria-invalid={!!errors.email} {...form.register("email")} />
            </Field>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Field id="invite-role" label="Role" hint={ROLE_DESCRIPTIONS[field.value]}>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="invite-role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.filter((r) => canAssignRole(actorRole, r)).map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                Add member
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
