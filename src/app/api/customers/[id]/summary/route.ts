import { route } from "@/lib/api";
import { generateCustomerSummary } from "@/services/customer.service";

/** Regenerates the AI customer insight. */
export const POST = route<{ id: string }>({ permission: "customers.view", rateLimit: 20 }, async ({ params, auth }) => generateCustomerSummary(auth.store.id, params.id));
