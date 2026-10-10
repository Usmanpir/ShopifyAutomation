import { route } from "@/lib/api";
import { listThreads } from "@/services/assistant.service";

export const GET = route({ permission: "ai.use" }, async ({ ctx }) => listThreads(ctx));
