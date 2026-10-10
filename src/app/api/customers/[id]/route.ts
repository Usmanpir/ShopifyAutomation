import { parseJson, route } from "@/lib/api";
import { customerUpdateSchema, getCustomerProfile, updateCustomer } from "@/services/customer.service";

export const GET = route<{ id: string }>({ permission: "customers.view" }, async ({ params, auth }) => getCustomerProfile(auth.store.id, params.id));

export const PATCH = route<{ id: string }>({ permission: "customers.update" }, async ({ req, params, ctx }) => updateCustomer(ctx, params.id, await parseJson(req, customerUpdateSchema)));
