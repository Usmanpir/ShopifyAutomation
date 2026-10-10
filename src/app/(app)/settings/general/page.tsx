import { DemoModeCard } from "@/features/settings/demo-mode-card";
import { ReadOnlyNotice } from "@/features/settings/form-bits";
import { GeneralForm } from "@/features/settings/general-form";
import { SettingsHeading } from "@/features/settings/settings-skeleton";
import { requireAuth } from "@/lib/auth/session";
import { can } from "@/lib/rbac";

export const metadata = { title: "General settings" };

export default async function GeneralSettingsPage() {
  const auth = await requireAuth("settings.view");
  const readOnly = !can(auth.role, "settings.manage");
  const s = auth.store;
  return (
    <>
      <SettingsHeading title="General" description="Your store's identity, currency and regional formatting." />
      {readOnly && <ReadOnlyNotice />}
      <GeneralForm initial={{ name: s.name, logoUrl: s.logoUrl, currency: s.currency, locale: s.locale, timezone: s.timezone }} readOnly={readOnly} />
      <DemoModeCard enabled={s.demoMode} readOnly={readOnly} />
    </>
  );
}
