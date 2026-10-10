import { parseJson, parseQuery, route } from "@/lib/api";
import { createTicket, listTickets, ticketCreateSchema, ticketListQuery } from "@/services/ticket.service";

export const GET = route({ permission: "conversations.view" }, async ({ req, auth }) => listTickets(auth.store.id, parseQuery(req, ticketListQuery)));

export const POST = route({ permission: "conversations.manage" }, async ({ req, ctx }) => createTicket(ctx, await parseJson(req, ticketCreateSchema)));
