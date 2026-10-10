import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreProvider } from "@/components/store-context";
import { requireAuth } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const auth = await requireAuth();
  if (!auth.store.onboardingCompleted) redirect("/onboarding");
  return (
    <StoreProvider
      value={{
        store: {
          id: auth.store.id,
          name: auth.store.name,
          currency: auth.store.currency,
          locale: auth.store.locale,
          timezone: auth.store.timezone,
          demoMode: auth.store.demoMode,
          logoUrl: auth.store.logoUrl,
        },
        user: { id: auth.user.id, name: auth.user.name, email: auth.user.email, avatarUrl: auth.user.avatarUrl },
        role: auth.role,
      }}
    >
      <AppShell>{children}</AppShell>
    </StoreProvider>
  );
}
