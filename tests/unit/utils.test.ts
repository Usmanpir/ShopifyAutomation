import { describe, expect, it } from "vitest";
import { generateTotpSecret, totpCode, verifyTotp } from "@/lib/auth/totp";
import { cronMatches, describeCron, isValidCron } from "@/lib/cron";
import { decrypt, decryptJson, encrypt, encryptJson, maskSecret } from "@/lib/crypto";
import { computeCoverage, suggestedReorder } from "@/lib/inventory/coverage";
import { formatMoney, percentChange, toMinor } from "@/lib/money";
import { isLikelyValidMobile, normalizePhone } from "@/lib/phone";
import { can, canAssignRole } from "@/lib/rbac";
import { detectPaymentMethod, normalizeShopifyOrder } from "@/lib/shopify/mappers";

describe("inventory coverage", () => {
  it("computes coverage from average daily sales", () => {
    const r = computeCoverage({ stock: 18, dailySales: Array(14).fill(11), baselineDailyAverage: 4.6 });
    expect(r.averageDailySales).toBe(11);
    expect(r.coverageDays).toBe(1.6);
    expect(r.velocityMultiplier).toBe(2.4);
    expect(r.status).toBe("CRITICAL");
  });
  it("handles no sales and out of stock", () => {
    expect(computeCoverage({ stock: 5, dailySales: [0, 0, 0] }).status).toBe("NO_SALES");
    expect(computeCoverage({ stock: 0, dailySales: [1, 2] }).status).toBe("OUT_OF_STOCK");
    expect(suggestedReorder(18, 11, 30)).toBe(312);
  });
});

describe("cron", () => {
  it("matches in the store timezone", () => {
    // 04:00 UTC = 09:00 Asia/Karachi
    expect(cronMatches("0 9 * * *", new Date("2026-10-03T04:00:00Z"), "Asia/Karachi")).toBe(true);
    expect(cronMatches("0 9 * * *", new Date("2026-10-03T09:00:00Z"), "Asia/Karachi")).toBe(false);
    expect(cronMatches("*/30 * * * *", new Date("2026-10-03T04:30:00Z"))).toBe(true);
  });
  it("validates and describes", () => {
    expect(isValidCron("0 */6 * * *")).toBe(true);
    expect(isValidCron("61 * * * *")).toBe(false);
    expect(describeCron("0 9 * * *")).toBe("Daily at 09:00");
    expect(describeCron("*/30 * * * *")).toBe("Every 30 minutes");
  });
});

describe("RBAC", () => {
  it("restricts permissions by role", () => {
    expect(can("VIEWER", "orders.update")).toBe(false);
    expect(can("SUPPORT_AGENT", "conversations.reply")).toBe(true);
    expect(can("SUPPORT_AGENT", "ads.manage")).toBe(false);
    expect(can("MARKETING_MANAGER", "ads.manage")).toBe(true);
    expect(can("MARKETING_MANAGER", "orders.cancel")).toBe(false);
    expect(can("ADMIN", "billing.manage")).toBe(false);
    expect(can("OWNER", "billing.manage")).toBe(true);
    expect(can(undefined, "dashboard.view")).toBe(false);
  });
  it("prevents privilege escalation", () => {
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
    expect(canAssignRole("ADMIN", "MANAGER")).toBe(true);
    expect(canAssignRole("MANAGER", "MANAGER")).toBe(false);
    expect(canAssignRole("OWNER", "OWNER")).toBe(true);
  });
});

describe("crypto & 2FA", () => {
  it("round-trips encrypted credentials and detects tampering", () => {
    const enc = encrypt("shpat_secret");
    expect(enc).not.toContain("shpat_secret");
    expect(decrypt(enc)).toBe("shpat_secret");
    expect(decryptJson<{ a: number }>(encryptJson({ a: 1 }))).toEqual({ a: 1 });
    const parts = enc.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(parts.join("."))).toThrow();
    expect(maskSecret("sk-1234567890abcd")).toBe("sk-…abcd");
  });
  it("generates and verifies TOTP codes with drift tolerance", () => {
    const secret = generateTotpSecret();
    const t = Date.UTC(2026, 9, 3, 10, 0, 0);
    const code = totpCode(secret, t);
    expect(verifyTotp(secret, code, t)).toBe(true);
    expect(verifyTotp(secret, code, t + 30_000)).toBe(true);
    expect(verifyTotp(secret, code, t + 120_000)).toBe(false);
    expect(verifyTotp(secret, "abc", t)).toBe(false);
  });
});

describe("money & phone", () => {
  it("formats minor units per store currency", () => {
    expect(formatMoney(42850000, { currency: "PKR", locale: "en-PK" })).toBe("Rs. 428,500");
    expect(formatMoney(1999, { currency: "USD", locale: "en-US", showMinor: true })).toBe("$19.99");
    expect(toMinor(3990)).toBe(399000);
    expect(percentChange(118.4, 100)).toBeCloseTo(18.4);
    expect(percentChange(5, 0)).toBe(100);
  });
  it("normalizes Pakistani mobile numbers", () => {
    expect(normalizePhone("0300-1234567")).toBe("923001234567");
    expect(normalizePhone("+92 300 1234567")).toBe("923001234567");
    expect(isLikelyValidMobile("923001234567")).toBe(true);
    expect(isLikelyValidMobile(normalizePhone("12345"))).toBe(false);
  });
});

describe("Shopify order mapping", () => {
  it("maps a webhook payload to a normalized order", () => {
    const o = normalizeShopifyOrder({
      id: 5550001,
      name: "#10452",
      order_number: 10452,
      email: "ali@example.com",
      phone: null,
      currency: "PKR",
      subtotal_price: "7980.00",
      total_price: "8180.00",
      total_discounts: "0.00",
      total_shipping_price_set: { shop_money: { amount: "200.00" } },
      financial_status: "pending",
      payment_gateway_names: ["Cash on Delivery (COD)"],
      tags: "vip, winter",
      created_at: "2026-10-03T10:00:00+05:00",
      customer: { id: 77, first_name: "Muhammad", last_name: "Ali", phone: "+923001234567" },
      shipping_address: { name: "Muhammad Ali", address1: "House 1, Street 2", city: "Lahore", phone: "03001234567" },
      line_items: [{ id: 1, product_id: 10, variant_id: 20, title: "Premium Black Shirt", variant_title: "XL", sku: "UT-PBS-XL", quantity: 2, price: "3990.00" }],
    });
    expect(o).toMatchObject({ orderNumber: 10452, total: 818000, shippingTotal: 20000, paymentMethod: "COD", paymentStatus: "PENDING", customerName: "Muhammad Ali", city: "Lahore", tags: ["vip", "winter"] });
    expect(o.items[0]).toMatchObject({ externalVariantId: "20", quantity: 2, unitPrice: 399000 });
    expect(detectPaymentMethod(["JazzCash"])).toBe("WALLET");
  });
});
