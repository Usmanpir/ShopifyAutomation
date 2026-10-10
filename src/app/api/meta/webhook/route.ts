import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { verifyMetaSignature } from "@/lib/whatsapp/webhook";
import { recordWebhook, storeForMetaPage } from "@/services/webhook.service";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = env().META_WEBHOOK_VERIFY_TOKEN;
  if (p.get("hub.mode") === "subscribe" && token && p.get("hub.verify_token") === token) return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  return new NextResponse("Forbidden", { status: 403 });
}

/** Facebook Page / Instagram events: messages, comments, lead forms. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), env().META_APP_SECRET)) {
    return NextResponse.json({ error: { message: "Invalid signature" } }, { status: 401 });
  }
  let payload: { object?: string; entry?: { id: string; time?: number; messaging?: { message?: { mid?: string } }[]; changes?: { field: string; value: { leadgen_id?: string; comment_id?: string } }[] }[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON" } }, { status: 400 });
  }
  const entry = payload.entry?.[0];
  const storeId = await storeForMetaPage(entry?.id ?? null);
  const externalId = entry?.messaging?.[0]?.message?.mid ?? entry?.changes?.[0]?.value?.leadgen_id ?? entry?.changes?.[0]?.value?.comment_id ?? `${entry?.id}:${entry?.time ?? randomUUID()}`;
  await recordWebhook({ provider: "META", topic: `${payload.object}:${entry?.changes?.[0]?.field ?? "messaging"}`, externalId, payload, storeId });
  return NextResponse.json({ data: { received: true } });
}
