import { SectionCard } from "@/components/shared/page";
import { PermissionsMatrix } from "@/features/settings/permissions-matrix";
import { SettingsHeading } from "@/features/settings/settings-skeleton";
import { InviteMemberDialog, TeamMembers } from "@/features/settings/team-members";
import { requireAuth } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listMembers } from "@/services/auth.service";

export const metadata = { title: "Team" };

export default async function TeamSettingsPage() {
  const auth = await requireAuth("settings.view");
  const members = await listMembers(auth.store.id);
  const canManage = can(auth.role, "team.manage");
  return (
    <>
      <SettingsHeading
        title="Team"
        description={`${members.length} ${members.length === 1 ? "person has" : "people have"} access to ${auth.store.name}. Roles control what each person — and the AI acting on their behalf — can do.`}
        action={canManage ? <InviteMemberDialog actorRole={auth.role} /> : null}
      />
      <TeamMembers members={JSON.parse(JSON.stringify(members))} currentUserId={auth.user.id} actorRole={auth.role} canManage={canManage} />
      <SectionCard title="Roles & permissions" description="What each role can see and do. The server enforces these on every action.">
        <PermissionsMatrix currentRole={auth.role} />
      </SectionCard>
    </>
  );
}
