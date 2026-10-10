import { AuditLog } from "@/features/settings/audit-log";
import { PasswordForm, SessionsCard, TwoFactorCard } from "@/features/settings/security-cards";
import { SettingsHeading } from "@/features/settings/settings-skeleton";
import { requireAuth } from "@/lib/auth/session";
import { can } from "@/lib/rbac";

export const metadata = { title: "Security" };

export default async function SecuritySettingsPage() {
  const auth = await requireAuth("settings.view");
  return (
    <>
      <SettingsHeading title="Security" description="Protect your account and review everything that changes in your store." />
      <TwoFactorCard enabled={auth.user.twoFactorEnabled} />
      <PasswordForm />
      <SessionsCard />
      {can(auth.role, "audit.view") && <AuditLog />}
    </>
  );
}
