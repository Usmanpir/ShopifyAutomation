import { parseJson, route } from "@/lib/api";
import { ticketUpdateSchema, updateTicket } from "@/services/ticket.service";

export const PATCH = route<{ id: string }>({ permission: "conversations.manage" }, async ({ req, params, ctx }) => updateTicket(ctx, params.id, await parseJson(req, ticketUpdateSchema)));
