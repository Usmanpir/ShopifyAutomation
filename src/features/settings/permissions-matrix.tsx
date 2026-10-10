import { cn } from "cn";
import { Check, ChevronDown, Minus } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS, type Permission } from "@/lib/rbac";

const AREA_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  orders: "Orders",
  customers: "Customers",
  products: "Products",
  inventory: "Inventory",
  conversations: "Conversations",
  marketing: "Marketing",
  ads: "Meta Ads",
  automations: "Automations",
  ai: "AI",
  approvals: "Approvals",
  analytics: "Analytics",
  reports: "Reports",
  integrations: "Integrations",
  settings: "Settings",
  team: "Team",
  audit: "Audit log",
  billing: "Billing",
};

const ACTION_LABELS: Record<string, string> = {
  view: "View",
  update: "Edit",
  cancel: "Cancel",
  refund: "Refund",
  reply: "Reply",
  manage: "Manage",
  send: "Send campaigns",
  use: "Use assistant",
  "agents.manage": "Configure agents",
  decide: "Approve / reject",
  export: "Export",
};

const ROLES = Object.keys(ROLE_LABELS) as Role[];

function groupPermissions() {
  const groups = new Map<string, Permission[]>();
  for (const p of PERMISSIONS) {
    const area = p.split(".")[0];
    groups.set(area, [...(groups.get(area) ?? []), p]);
  }
  return [...groups.entries()];
}

/** Read-only matrix of what each role can do — mirrors ROLE_PERMISSIONS exactly. */
export function PermissionsMatrix({ currentRole }: { currentRole: Role }) {
  const groups = groupPermissions();
  return (
    <div className="space-y-5">
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {ROLES.map((r) => (
          <li key={r} className={cn("rounded-lg border px-3 py-2.5", r === currentRole && "border-primary/40 bg-primary/[0.04]")}>
            <p className="text-sm font-medium">
              {ROLE_LABELS[r]}
              {r === currentRole && <span className="ml-1.5 text-[11px] font-medium text-primary">Your role</span>}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
          </li>
        ))}
      </ul>
      <details className="group -mx-5 -mb-5 border-t">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-[13px] font-medium text-primary hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Show full permission matrix ({PERMISSIONS.length} permissions)</span>
          <span className="hidden group-open:inline">Hide permission matrix</span>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
      <div className="scrollbar-thin overflow-x-auto border-t">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">Permissions by role</caption>
          <thead className="sticky top-0">
            <tr className="border-b bg-surface-2/60 text-[12px] text-muted-foreground">
              <th scope="col" className="py-2.5 pl-5 text-left font-medium">
                Permission
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className={cn("px-2 py-2.5 text-center font-medium whitespace-nowrap", r === currentRole && "text-primary")}>
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map(([area, perms]) => (
            <tbody key={area} className="border-b last:border-0">
              <tr>
                <th scope="rowgroup" colSpan={ROLES.length + 1} className="bg-muted/30 py-1.5 pl-5 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {AREA_LABELS[area] ?? area}
                </th>
              </tr>
              {perms.map((p) => {
                const action = p.slice(area.length + 1);
                return (
                  <tr key={p} className="hover:bg-muted/30">
                    <th scope="row" className="py-2 pl-5 text-left font-normal">
                      {ACTION_LABELS[action] ?? action}
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground/70">{p}</span>
                    </th>
                    {ROLES.map((r) => (
                      <td key={r} className={cn("px-2 py-2 text-center", r === currentRole && "bg-primary/[0.03]")}>
                        {ROLE_PERMISSIONS[r].has(p) ? (
                          <Check className="mx-auto size-4 text-success" aria-label="Allowed" />
                        ) : (
                          <Minus className="mx-auto size-4 text-muted-foreground/40" aria-label="Not allowed" />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      </details>
    </div>
  );
}
