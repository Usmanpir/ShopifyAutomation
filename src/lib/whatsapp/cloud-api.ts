import { env } from "@/lib/env";
import type { MessagingProvider, SendResult, TemplateMessage } from "./types";

export class WhatsAppApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: number) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

/** Meta WhatsApp Cloud API implementation. Credentials stay server-side. */
export class WhatsAppCloudProvider implements MessagingProvider {
  readonly key = "meta_cloud";
  readonly isDemo = false;

  constructor(private readonly creds: { accessToken: string; phoneNumberId: string }) {}

  private async post(path: string, body: Record<string, unknown>) {
    const url = `https://graph.facebook.com/${env().META_GRAPH_VERSION}/${this.creds.phoneNumberId}/${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.creds.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message: string; code?: number };
    };
    if (!res.ok || json.error) {
      throw new WhatsAppApiError(json.error?.message ?? `WhatsApp API error (${res.status})`, res.status, json.error?.code);
    }
    return json;
  }

  async sendText(to: string, body: string): Promise<SendResult> {
    const json = await this.post("messages", { recipient_type: "individual", to, type: "text", text: { body, preview_url: false } });
    return { externalId: json.messages?.[0]?.id ?? "", status: "SENT" };
  }

  async sendTemplate(to: string, template: TemplateMessage): Promise<SendResult> {
    const json = await this.post("messages", {
      to,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        components: template.variables.length
          ? [{ type: "body", parameters: template.variables.map((text) => ({ type: "text", text })) }]
          : [],
      },
    });
    return { externalId: json.messages?.[0]?.id ?? "", status: "SENT" };
  }

  async sendMedia(to: string, media: { url: string; type: "image" | "video" | "document"; caption?: string }): Promise<SendResult> {
    const json = await this.post("messages", { to, type: media.type, [media.type]: { link: media.url, caption: media.caption } });
    return { externalId: json.messages?.[0]?.id ?? "", status: "SENT" };
  }

  async markRead(externalMessageId: string): Promise<void> {
    await this.post("messages", { status: "read", message_id: externalMessageId });
  }
}
