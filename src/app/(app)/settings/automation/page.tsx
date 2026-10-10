import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { InventoryForm, LimitsForm, RiskForm, SchedulesForm } from "@/features/settings/automation-settings";
import { ReadOnlyNotice } from "@/features/settings/form-bits";
import { SettingsHeading } from "@/features/settings/settings-skeleton";
import { requireAuth } from "@/lib/auth/session";
import { can } from "@/lib/rbac";

export const metadata = { title: "Automation settings" };

export default async function AutomationSettingsPage() {
  const auth = await requireAuth("settings.view");
  const readOnly = !can(auth.role, "settings.manage");
  const s = auth.store.settings;
  return (
    <>
      <SettingsHeading
        title="Automation"
        description="When background jobs run, how much they're allowed to do, and how orders are risk-scored."
        action={
          can(auth.role, "automations.view") ? (
            <Link href="/automations" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
              Manage workflows <ArrowUpRight className="size-3.5" />
            </Link>
          ) : null
        }
      />
      {readOnly && <ReadOnlyNotice />}
      <SchedulesForm initial={s.schedules} timezone={auth.store.timezone} readOnly={readOnly} />
      <LimitsForm initial={s.automation} readOnly={readOnly} />
      <RiskForm initial={s.risk} readOnly={readOnly} />
      <InventoryForm initial={s.inventory} readOnly={readOnly} />
    </>
  );
}
