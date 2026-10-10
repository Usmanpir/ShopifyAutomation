import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeShopDomain, verifyOAuthHmac } from "@/lib/shopify/oauth";
import { verifyShopifyWebhook } from "@/lib/shopify/webhooks";
import { parseWhatsAppWebhook, verifyMetaSignature } from "@/lib/whatsapp/webhook";

describe("Shopify webhook verification", () => {
  const secret = "shpss_test";
  const body = JSON.stringify({ id: 1, name: "#1001" });
  const good = createHmac("sha256", secret).update(body).digest("base64");

  it("accepts a valid HMAC over the raw body", () => {
    expect(verifyShopifyWebhook(body, good, secret)).toBe(true);
  });
  it("rejects tampered bodies, wrong secrets and missing headers", () => {
    expect(verifyShopifyWebhook(body + " ", good, secret)).toBe(false);
    expect(verifyShopifyWebhook(body, good, "other")).toBe(false);
    expect(verifyShopifyWebhook(body, null, secret)).toBe(false);
    expect(verifyShopifyWebhook(body, good, undefined)).toBe(false);
  });
});

describe("Shopify OAuth", () => {
  it("verifies the callback hmac over sorted params", () => {
    const params = new URLSearchParams({ shop: "test.myshopify.com", code: "abc", state: "xyz", timestamp: "1700000000" });
    const message = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
    params.set("hmac", createHmac("sha256", "secret").update(message).digest("hex"));
    expect(verifyOAuthHmac(params, "secret")).toBe(true);
    params.set("code", "tampered");
    expect(verifyOAuthHmac(params, "secret")).toBe(false);
  });
  it("only accepts myshopify.com domains", () => {
    expect(normalizeShopDomain("my-store")).toBe("my-store.myshopify.com");
    expect(normalizeShopDomain("https://My-Store.myshopify.com/admin")).toBe("my-store.myshopify.com");
    expect(normalizeShopDomain("evil.com")).toBeNull();
    expect(normalizeShopDomain("a.myshopify.com.evil.com")).toBeNull();
  });
});

describe("WhatsApp / Meta webhooks", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "1234" },
              contacts: [{ wa_id: "923001234567", profile: { name: "Muhammad Ali" } }],
              messages: [{ from: "923001234567", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "Bhai black shirt available hai?" } }],
              statuses: [{ id: "wamid.out", status: "read", timestamp: "1700000001", recipient_id: "923001234567" }],
            },
          },
        ],
      },
    ],
  };

  it("verifies X-Hub-Signature-256", () => {
    const raw = JSON.stringify(payload);
    const sig = `sha256=${createHmac("sha256", "app_secret").update(raw).digest("hex")}`;
    expect(verifyMetaSignature(raw, sig, "app_secret")).toBe(true);
    expect(verifyMetaSignature(raw, sig, "wrong")).toBe(false);
    expect(verifyMetaSignature(raw, "md5=abc", "app_secret")).toBe(false);
  });

  it("parses inbound messages and delivery statuses", () => {
    const p = parseWhatsAppWebhook(payload);
    expect(p.phoneNumberId).toBe("1234");
    expect(p.messages[0]).toMatchObject({ from: "923001234567", profileName: "Muhammad Ali", text: "Bhai black shirt available hai?" });
    expect(p.statuses[0]).toMatchObject({ externalId: "wamid.out", status: "READ" });
  });
});
