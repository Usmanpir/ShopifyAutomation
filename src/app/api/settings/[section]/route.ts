import { z } from "zod";
import { route } from "@/lib/api";
import { forbidden } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { SETTINGS_SECTIONS, updateSettingsSection, type SettingsSection } from "@/services/settings.service";

const sectionSchema = z.enum(Object.keys(SETTINGS_SECTIONS) as [SettingsSection, ...SettingsSection[]]);

/** PATCH /api/settings/{ai|approvals|risk|notifications|schedules|automation|inventory} */
export const PATCH = route<{ section: string }>({ permission: "settings.manage" }, async ({ req, params, ctx, auth }) => {
  const section = sectionSchema.parse(params.section);
  if ((section === "ai" || section === "approvals") && !can(auth.role, "ai.agents.manage")) throw forbidden();
  return updateSettingsSection(ctx, section, await req.json());
});
