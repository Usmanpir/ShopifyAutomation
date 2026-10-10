import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";

/** Serves an uploaded file to members of the owning store only. */
export const GET = route<{ id: string }>({}, async ({ params, auth }) => {
  const file = await db.fileBlob.findFirst({ where: { id: params.id, storeId: auth.store.id } });
  if (!file) throw notFound("File");
  return new Response(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
    },
  });
});
