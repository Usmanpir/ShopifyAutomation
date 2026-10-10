import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getAIProvider } from "@/lib/ai/factory";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { enqueue } from "@/lib/queue";
import type { ServiceContext } from "@/lib/service-context";
import { recordAITask } from "./agent.service";
import { creativePerformance } from "./meta.service";

export const ALLOWED_UPLOADS: Record<string, "IMAGE" | "VIDEO"> = {
  "image/png": "IMAGE",
  "image/jpeg": "IMAGE",
  "image/webp": "IMAGE",
  "video/mp4": "VIDEO",
};
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const creativeAnalysisSchema = z.object({
  scores: z.object({
    visualAppeal: z.number().min(0).max(10),
    productVisibility: z.number().min(0).max(10),
    offer: z.number().min(0).max(10),
    callToAction: z.number().min(0).max(10),
    messaging: z.number().min(0).max(10),
  }),
  summary: z.string(),
  strengths: z.array(z.string()).max(5),
  improvements: z.array(z.string()).max(5),
  predictedPerformance: z.enum(["BELOW_AVERAGE", "AVERAGE", "ABOVE_AVERAGE"]),
  performanceContext: z.string(),
});
export type CreativeAnalysis = z.infer<typeof creativeAnalysisSchema>;

/** Detects the real file type from magic bytes (never trust the client's MIME). */
export function sniffMime(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  return null;
}

export async function uploadCreative(ctx: ServiceContext, input: { name: string; file?: { buffer: Buffer; filename: string }; copy?: string }) {
  if (!input.file && !input.copy?.trim()) throw badRequest("Upload an image/video or paste ad copy");
  let fileId: string | null = null;
  let type: "IMAGE" | "VIDEO" | "COPY" = "COPY";
  if (input.file) {
    if (input.file.buffer.length > MAX_UPLOAD_BYTES) throw badRequest("Files must be 8 MB or smaller");
    const mime = sniffMime(input.file.buffer);
    if (!mime || !ALLOWED_UPLOADS[mime]) throw badRequest("Only PNG, JPEG, WebP images or MP4 videos are supported");
    type = ALLOWED_UPLOADS[mime];
    const blob = await db.fileBlob.create({
      data: { storeId: ctx.storeId, filename: input.file.filename.replace(/[^\w.\- ]/g, "_").slice(0, 120), mimeType: mime, size: input.file.buffer.length, data: new Uint8Array(input.file.buffer) },
    });
    fileId = blob.id;
  }
  const creative = await db.creativeAsset.create({
    data: { storeId: ctx.storeId, type, name: input.name.slice(0, 120), fileId, url: fileId ? `/api/files/${fileId}` : null, copy: input.copy?.slice(0, 3000) ?? null },
  });
  await audit(ctx, { action: "creative.upload", resourceType: "creative", resourceId: creative.id, resourceLabel: creative.name });
  await enqueue("creative.analyze", { creativeId: creative.id });
  return db.creativeAsset.findUniqueOrThrow({ where: { id: creative.id } });
}

/** Heuristic copy analysis — used by the local provider and as the LLM fallback. */
export function heuristicCopyAnalysis(copy: string, type: string, context: string): CreativeAnalysis {
  const text = copy.toLowerCase();
  const hasOffer = /(\d+\s?%|off|sale|discount|free delivery|free shipping|rs\.?\s?\d|buy \d)/.test(text);
  const hasCta = /(shop now|order now|buy now|dm|whatsapp|click|tap|visit|limited)/.test(text);
  const urgency = /(today|limited|last chance|only|ends|hurry|few left)/.test(text);
  const words = copy.split(/\s+/).filter(Boolean).length;
  const emojis = (copy.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  const offer = hasOffer ? 8 : 4;
  const cta = hasCta ? 8 : 3;
  const messaging = Math.max(3, Math.min(9, (words >= 12 && words <= 60 ? 8 : 5) + (urgency ? 1 : 0)));
  const visual = type === "VIDEO" ? 7.5 : type === "IMAGE" ? 6.5 : 5;
  const visibility = type === "COPY" ? 5 : 7;
  const avg = (offer + cta + messaging + visual + visibility) / 5;
  return {
    scores: { visualAppeal: visual, productVisibility: visibility, offer, callToAction: cta, messaging },
    summary: `${hasOffer ? "Clear offer" : "No explicit offer"}, ${hasCta ? "direct call-to-action" : "weak call-to-action"}${urgency ? " and urgency" : ""}.`,
    strengths: [hasOffer && "Mentions a concrete offer or price", hasCta && "Has a clear call to action", urgency && "Creates urgency", emojis > 0 && emojis <= 4 && "Uses emojis sparingly for scannability", type === "VIDEO" && "Video format — historically higher engagement"].filter(Boolean) as string[],
    improvements: [!hasOffer && "Lead with a concrete offer (e.g. “20% off” or “Free delivery”)", !hasCta && "End with a direct CTA like “Order on WhatsApp”", words > 60 && "Shorten the copy — keep the first line under 125 characters", !urgency && "Add a time-bound reason to act now", emojis > 6 && "Reduce emoji usage"].filter(Boolean) as string[],
    predictedPerformance: avg >= 7 ? "ABOVE_AVERAGE" : avg >= 5.5 ? "AVERAGE" : "BELOW_AVERAGE",
    performanceContext: context,
  };
}

export async function analyzeCreative(creativeId: string) {
  const started = Date.now();
  const creative = await db.creativeAsset.findUnique({ where: { id: creativeId }, include: { file: true } });
  if (!creative) throw notFound("Creative");
  const perf = await creativePerformance(creative.storeId, { range: "30d" });
  const typeMetrics = perf.byType.find((t) => t.type === (creative.type === "COPY" ? "IMAGE" : creative.type))?.metrics;
  const best = [...perf.byType].sort((a, b) => b.metrics.roas - a.metrics.roas)[0];
  const context = typeMetrics
    ? `Your ${creative.type === "VIDEO" ? "video" : "image"} ads averaged ${typeMetrics.roas.toFixed(2)}× ROAS and ${typeMetrics.ctr.toFixed(2)}% CTR over 30 days${best && best.type !== creative.type ? `; ${best.type.toLowerCase()} creatives performed best (${best.metrics.roas.toFixed(2)}× ROAS)` : ""}.`
    : "Not enough historical ad data for comparison yet.";

  const ai = await getAIProvider(creative.storeId);
  const images = creative.file && creative.file.mimeType.startsWith("image/") ? [{ mimeType: creative.file.mimeType, base64: Buffer.from(creative.file.data).toString("base64") }] : undefined;
  try {
    const { data } = await ai.generateObject({
      system:
        "You are a performance-marketing creative analyst for a fashion brand running Meta ads in Pakistan. Score the creative 0–10 on each dimension and give specific, actionable feedback. Use the performance context provided; do not invent metrics.",
      prompt: JSON.stringify({ creativeType: creative.type, name: creative.name, adCopy: creative.copy ?? "(none)", performanceContext: context }),
      schema: creativeAnalysisSchema,
      schemaName: "creative_analysis",
      images,
      fallback: () => heuristicCopyAnalysis(creative.copy ?? creative.name, creative.type, context),
    });
    await db.creativeAsset.update({ where: { id: creativeId }, data: { analysis: { ...data, performanceContext: context } as Prisma.InputJsonValue, status: "ANALYZED" } });
    await recordAITask(creative.storeId, "ADS", { type: "creative.analyze", title: `Analyzed creative “${creative.name}”`, output: data, provider: ai.name, model: ai.model, durationMs: Date.now() - started, relatedType: "creative", relatedId: creativeId });
    return data;
  } catch (err) {
    await db.creativeAsset.update({ where: { id: creativeId }, data: { status: "FAILED" } });
    throw err;
  }
}
