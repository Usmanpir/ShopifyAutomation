/**
 * Messaging provider abstraction. The app only depends on this interface, so
 * WhatsApp Cloud API can be swapped for a BSP (360dialog, Twilio…) without
 * touching services or UI.
 */
export type SendResult = { externalId: string; status: "SENT" | "DELIVERED" | "QUEUED" };

export type TemplateMessage = {
  name: string;
  language: string;
  /** Positional body variables ({{1}}, {{2}}, …). */
  variables: string[];
};

export interface MessagingProvider {
  readonly key: string;
  readonly isDemo: boolean;
  sendText(to: string, body: string): Promise<SendResult>;
  sendTemplate(to: string, template: TemplateMessage): Promise<SendResult>;
  sendMedia(to: string, media: { url: string; type: "image" | "video" | "document"; caption?: string }): Promise<SendResult>;
  markRead(externalMessageId: string): Promise<void>;
}

export type InboundMessage = {
  externalId: string;
  from: string;
  profileName: string | null;
  timestamp: Date;
  type: string;
  text: string;
  mediaId?: string;
  mediaType?: string;
};

export type StatusUpdate = {
  externalId: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  timestamp: Date;
  recipient: string;
  error?: string;
};

export type ParsedWebhook = {
  phoneNumberId: string | null;
  messages: InboundMessage[];
  statuses: StatusUpdate[];
};
