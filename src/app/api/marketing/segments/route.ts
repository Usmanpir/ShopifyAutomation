import { parseJson, route } from "@/lib/api";
import { createSegment, segmentCreateSchema } from "@/services/marketing.service";
import { listSegments } from "@/services/segment.service";

export const GET = route({ permission: "customers.view" }, async ({ auth }) => listSegments(auth.store.id));

export const POST = route({ permission: "marketing.manage" }, async ({ req, ctx }) => createSegment(ctx, await parseJson(req, segmentCreateSchema)));
