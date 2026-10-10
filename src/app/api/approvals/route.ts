import { parseQuery, route } from "@/lib/api";
import { decisionListQuery, listDecisions } from "@/services/decision.service";

export const GET = route({ permission: "approvals.view" }, async ({ req, auth }) => listDecisions(auth.store.id, parseQuery(req, decisionListQuery)));
