import { z } from "zod";
import { hmacSha256, safeEqual } from "@/lib/crypto";
import type { InboundMessage, ParsedWebhook, StatusUpdate } from "./types";

/** Meta signs webhook payloads: X-Hub-Signature-256: sha256=<hex HMAC(raw body, app secret)>. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!header || !appSecret || !header.startsWith("sha256=")) return false;
  return safeEqual(`sha256=${hmacSha256(appSecret, rawBody, "hex")}`, header);
}

const messageSchema = z
  .object({
    from: z.string(),
    id: z.string(),
    timestamp: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    button: z.object({ text: z.string() }).optional(),
    interactive: z
      .object({
        button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
        list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      })
      .optional(),
    image: z.object({ id: z.string(), caption: z.string().optional() }).optional(),
    video: z.object({ id: z.string(), caption: z.string().optional() }).optional(),
    audio: z.object({ id: z.string() }).optional(),
    document: z.object({ id: z.string(), caption: z.string().optional() }).optional(),
  })
  .passthrough();

const statusSchema = z
  .object({
    id: z.string(),
    status: z.enum(["sent", "delivered", "read", "failed"]),
    timestamp: z.string(),
    recipient_id: z.string(),
    errors: z.array(z.object({ title: z.string().optional(), message: z.string().optional() })).optional(),
  })
  .passthrough();

const payloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z
            .object({
              metadata: z.object({ phone_number_id: z.string() }).partial().optional(),
              contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).partial().optional() })).optional(),
              messages: z.array(messageSchema).optional(),
              statuses: z.array(statusSchema).optional(),
            })
            .passthrough(),
        }),
      ),
    }),
  ),
});

function textOf(m: z.infer<typeof messageSchema>): { text: string; mediaId?: string; mediaType?: string } {
  if (m.text) return { text: m.text.body };
  if (m.button) return { text: m.button.text };
  if (m.interactive?.button_reply) return { text: m.interactive.button_reply.title };
  if (m.interactive?.list_reply) return { text: m.interactive.list_reply.title };
  if (m.image) return { text: m.image.caption ?? "[Image]", mediaId: m.image.id, mediaType: "image" };
  if (m.video) return { text: m.video.caption ?? "[Video]", mediaId: m.video.id, mediaType: "video" };
  if (m.audio) return { text: "[Voice message]", mediaId: m.audio.id, mediaType: "audio" };
  if (m.document) return { text: m.document.caption ?? "[Document]", mediaId: m.document.id, mediaType: "document" };
  return { text: `[${m.type}]` };
}

export function parseWhatsAppWebhook(raw: unknown): ParsedWebhook {
  const payload = payloadSchema.parse(raw);
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  let phoneNumberId: string | null = null;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const v = change.value;
      phoneNumberId = v.metadata?.phone_number_id ?? phoneNumberId;
      const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const m of v.messages ?? []) {
        messages.push({
          externalId: m.id,
          from: m.from,
          profileName: names.get(m.from) ?? null,
          timestamp: new Date(Number(m.timestamp) * 1000),
          type: m.type,
          ...textOf(m),
        });
      }
      for (const s of v.statuses ?? []) {
        statuses.push({
          externalId: s.id,
          status: s.status.toUpperCase() as StatusUpdate["status"],
          timestamp: new Date(Number(s.timestamp) * 1000),
          recipient: s.recipient_id,
          error: s.errors?.map((e) => e.message ?? e.title).filter(Boolean).join("; ") || undefined,
        });
      }
    }
  }
  return { phoneNumberId, messages, statuses };
}
