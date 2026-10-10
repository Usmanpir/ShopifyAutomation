import { describe, expect, it } from "vitest";
import { classifyIntentLocally, detectLanguage } from "@/lib/ai/intents";

const pending = { hasPendingConfirmation: true };
const none = { hasPendingConfirmation: false };

describe("WhatsApp intent classifier", () => {
  it.each([
    ["Yes", pending, "CONFIRM_ORDER"],
    ["Han ji confirm", pending, "CONFIRM_ORDER"],
    ["ji haan", pending, "CONFIRM_ORDER"],
    ["No, cancel it", pending, "DECLINE_ORDER"],
    ["nahi chahiye, cancel kar do", pending, "DECLINE_ORDER"],
    ["Mera order kahan hai?", none, "ORDER_STATUS"],
    ["Bhai black shirt available hai?", none, "PRODUCT_AVAILABILITY"],
    ["What's the price of the tracksuit?", none, "PRICE"],
    ["Delivery kitne din mein hogi?", none, "DELIVERY"],
    ["Can I exchange size L for XL?", none, "EXCHANGE"],
    ["I want a refund", none, "RETURN"],
    ["Can I talk to a real person?", none, "HUMAN_REQUEST"],
    ["Bakwas service, parcel damaged", none, "COMPLAINT"],
    ["Assalam o alaikum", none, "GREETING"],
  ])("%s → %s", (text, ctx, intent) => {
    expect(classifyIntentLocally(text, ctx).intent).toBe(intent);
  });

  it("does not treat 'yes' as a confirmation when nothing is pending", () => {
    expect(classifyIntentLocally("Yes", none).intent).not.toBe("CONFIRM_ORDER");
  });

  it("extracts product, size and colour", () => {
    const r = classifyIntentLocally("Bhai black shirt XL mein available hai?", none);
    expect(r.productQuery).toContain("shirt");
    expect(r.color).toBe("black");
    expect(r.size).toBe("XL");
  });

  it("escalates special exchange exceptions and complaints to humans", () => {
    expect(classifyIntentLocally("Can I exchange it? It's been 10 days, special case", none).requiresHuman).toBe(true);
    expect(classifyIntentLocally("worst quality, totally damaged", none).requiresHuman).toBe(true);
  });

  it("detects Roman Urdu vs English", () => {
    expect(detectLanguage("Bhai black shirt available hai?")).toBe("roman_urdu");
    expect(detectLanguage("Is the oxford shirt in stock?")).toBe("english");
  });
});
