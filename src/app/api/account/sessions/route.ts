import { route } from "@/lib/api";
import { listSessions } from "@/services/auth.service";

export const GET = route({}, async ({ auth }) => listSessions(auth.user.id, auth.sessionId));
