import { parseJson, route } from "@/lib/api";
import { segmentRulesSchema } from "@/schemas/segment";
import { previewSegment } from "@/services/segment.service";

export const POST = route({ permission: "customers.view", rateLimit: 60 }, async ({ req, auth }) => previewSegment(auth.store.id, await parseJson(req, segmentRulesSchema)));
