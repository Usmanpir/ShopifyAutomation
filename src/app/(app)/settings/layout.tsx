import { PageContainer, PageHeader } from "@/components/shared/page";
import { SettingsNav } from "@/features/settings/settings-nav";
import { requireAuth } from "@/lib/auth/session";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const auth = await requireAuth("settings.view");
  return (
    <PageContainer>
      <PageHeader title="Settings" description={`Manage ${auth.store.name}, your team, AI behaviour and security.`} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-10">
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <SettingsNav />
        </aside>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </PageContainer>
  );
}
