/**
 * Product branding. Change the name here (or via NEXT_PUBLIC_APP_NAME)
 * and it propagates through the entire UI, emails and reports.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "CommerceAI",
  tagline: "Your AI-powered Ecommerce Operations Command Center",
  shortDescription:
    "Orders, customers, WhatsApp, inventory, Meta ads and AI automation in one command center.",
  supportEmail: "support@commerceai.app",
} as const;
