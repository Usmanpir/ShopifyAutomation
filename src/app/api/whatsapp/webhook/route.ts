import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { parseWhatsAppWebhook, verifyMetaSignature } from "@/lib/whatsapp/webhook";
import { recordWebhook, storeForWhatsAppPhone } from "@/services/webhook.service";

/** Meta webhook verification handshake (hub.challenge). */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = env().META_WEBHOOK_VERIFY_TOKEN;
  if (p.get("hub.mode") === "subscribe" && token && p.get("hub.verify_token") === token) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * WhatsApp Cloud API events. Verify the X-Hub-Signature-256 against the RAW
 * body, store the event (idempotent), ACK fast; processing happens in the queue.
 */
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`wh:whatsapp:${req.headers.get("x-forwarded-for") ?? "ip"}`, 600, 60);
  if (!rl.allowed) return new NextResponse("Too many requests", { status: 429 });

  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), env().META_APP_SECRET)) {
    return NextResponse.json({ error: { message: "Invalid signature" } }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON" } }, { status: 400 });
  }
  let parsed;
  try {
    parsed = parseWhatsAppWebhook(payload);
  } catch {
    return NextResponse.json({ data: { ignored: true } }); // not a messages payload
  }
  const storeId = await storeForWhatsAppPhone(parsed.phoneNumberId);
  // Delivery id: first message/status id (Meta retries resend the same ids).
  const externalId = parsed.messages[0]?.externalId ?? (parsed.statuses[0] ? `${parsed.statuses[0].externalId}:${parsed.statuses[0].status}` : randomUUID());
  await recordWebhook({ provider: "WHATSAPP", topic: parsed.messages.length ? "messages" : "statuses", externalId, payload, storeId });
  return NextResponse.json({ data: { received: true } });
}
