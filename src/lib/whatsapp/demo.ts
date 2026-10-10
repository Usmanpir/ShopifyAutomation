import { randomToken } from "@/lib/crypto";
import type { MessagingProvider, SendResult } from "./types";

/**
 * Demo provider: behaves like the real API (ids, statuses) without sending
 * anything. Used when WhatsApp credentials are not configured.
 */
export class DemoWhatsAppProvider implements MessagingProvider {
  readonly key = "demo";
  readonly isDemo = true;

  private result(): SendResult {
    return { externalId: `wamid.demo.${randomToken(12)}`, status: "DELIVERED" };
  }
  async sendText(): Promise<SendResult> {
    return this.result();
  }
  async sendTemplate(): Promise<SendResult> {
    return this.result();
  }
  async sendMedia(): Promise<SendResult> {
    return this.result();
  }
  async markRead(): Promise<void> {}
}
