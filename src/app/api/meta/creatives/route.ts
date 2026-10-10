import { parseQuery, route } from "@/lib/api";
import { rangeQuerySchema } from "@/lib/dates";
import { badRequest } from "@/lib/errors";
import { MAX_UPLOAD_BYTES, uploadCreative } from "@/services/creative.service";
import { creativePerformance } from "@/services/meta.service";

export const GET = route({ permission: "ads.view" }, async ({ req, auth }) => creativePerformance(auth.store.id, parseQuery(req, rangeQuerySchema)));

/** multipart/form-data: name, file? (image/video), copy? — analyzed by the AI creative analyst. */
export const POST = route({ permission: "ads.manage", rateLimit: 20 }, async ({ req, ctx }) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw badRequest("Expected multipart form data");
  const file = form.get("file");
  const copy = String(form.get("copy") ?? "");
  const name = String(form.get("name") ?? "").trim() || (file instanceof File ? file.name : "Ad copy");
  let upload: { buffer: Buffer; filename: string } | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) throw badRequest("Files must be 8 MB or smaller");
    upload = { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name };
  }
  return uploadCreative(ctx, { name, file: upload, copy });
});
