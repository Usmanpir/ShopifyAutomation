import { ReadOnlyNotice } from "@/features/settings/form-bits";
import { NotificationsForm } from "@/features/settings/notifications-form";
import { SettingsHeading } from "@/features/settings/settings-skeleton";
import { requireAuth } from "@/lib/auth/session";
import { can } from "@/lib/rbac";

export const metadata = { title: "Notifications" };

export default async function NotificationSettingsPage() {
  const auth = await requireAuth("settings.view");
  const readOnly = !can(auth.role, "settings.manage");
  return (
    <>
      <SettingsHeading title="Notifications" description="Choose how your team hears about what needs attention. These apply store-wide." />
      {readOnly && <ReadOnlyNotice />}
      <NotificationsForm initial={auth.store.settings.notifications} readOnly={readOnly} />
    </>
  );
}
