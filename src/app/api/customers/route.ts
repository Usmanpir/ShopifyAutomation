import { parseQuery, route } from "@/lib/api";
import { customerListQuery, listCustomers } from "@/services/customer.service";

export const GET = route({ permission: "customers.view" }, async ({ req, auth }) => listCustomers(auth.store.id, parseQuery(req, customerListQuery)));
