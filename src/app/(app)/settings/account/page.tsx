import { ArrowUpRight, ShieldCheck, ShieldOff } from "lucide-react";
import Link from "next/link";
import { DefinitionList, SectionCard } from "@/components/shared/page";
import { StatusPill } from "@/components/shared/status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SettingsHeading } from "@/features/settings/settings-skeleton";
import { SignOutButton } from "@/features/settings/sign-out-button";
import { requireAuth } from "@/lib/auth/session";
import { initials } from "@/lib/format";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/rbac";

export const metadata = { title: "Account" };

export default async function AccountSettingsPage() {
  const auth = await requireAuth("settings.view");
  const { user, store, role } = auth;
  return (
    <>
      <SettingsHeading title="Account" description="Your personal profile and sign-in." />
      <SectionCard>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar className="size-16">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
            <AvatarFallback className="bg-brand-soft text-lg font-semibold text-brand">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold tracking-tight">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill tone="brand" dot={false}>
                {ROLE_LABELS[role]}
              </StatusPill>
              {user.twoFactorEnabled ? (
                <StatusPill tone="success" dot={false}>
                  <ShieldCheck className="size-3" aria-hidden /> 2FA on
                </StatusPill>
              ) : (
                <StatusPill tone="warning" dot={false}>
                  <ShieldOff className="size-3" aria-hidden /> 2FA off
                </StatusPill>
              )}
            </div>
          </div>
          <SignOutButton />
        </div>
      </SectionCard>
      <SectionCard title="Workspace">
        <DefinitionList
          items={[
            { label: "Store", value: store.name },
            { label: "Store handle", value: <span className="font-mono text-[13px]">{store.slug}</span> },
            { label: "Your role", value: <span title={ROLE_DESCRIPTIONS[role]}>{ROLE_LABELS[role]}</span> },
            { label: "Currency · timezone", value: `${store.currency} · ${store.timezone}` },
            { label: "Mode", value: store.demoMode ? <StatusPill tone="warning">Demo data</StatusPill> : <StatusPill tone="success">Live</StatusPill> },
          ]}
        />
        <p className="mt-4 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
      </SectionCard>
      {!user.twoFactorEnabled && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted-foreground">Protect your account with two-factor authentication.</p>
          <Link href="/settings/security" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
            Set up 2FA <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      )}
    </>
  );
}
