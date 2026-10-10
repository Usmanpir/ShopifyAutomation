import { z } from "zod";

export const SEGMENT_FIELDS = [
  { key: "totalOrders", label: "Total orders", type: "number" },
  { key: "totalSpent", label: "Total spent (major units)", type: "money" },
  { key: "avgOrderValue", label: "Average order value (major units)", type: "money" },
  { key: "daysSinceLastOrder", label: "Days since last order", type: "number" },
  { key: "daysSinceFirstOrder", label: "Days since first order", type: "number" },
  { key: "returnedCount", label: "Returned orders", type: "number" },
  { key: "cancelledCount", label: "Cancelled orders", type: "number" },
  { key: "riskLevel", label: "Risk level", type: "enum", options: ["LOW", "MEDIUM", "HIGH"] },
  { key: "city", label: "City", type: "string" },
  { key: "purchasedCategory", label: "Purchased category (slug)", type: "string" },
  { key: "acceptsMarketing", label: "Accepts marketing", type: "boolean" },
] as const;

export type SegmentField = (typeof SEGMENT_FIELDS)[number]["key"];

export const segmentConditionSchema = z.object({
  field: z.enum(SEGMENT_FIELDS.map((f) => f.key) as [SegmentField, ...SegmentField[]]),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte"]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const segmentRulesSchema = z.object({
  match: z.enum(["all", "any"]).default("all"),
  conditions: z.array(segmentConditionSchema).default([]),
});

export type SegmentRules = z.infer<typeof segmentRulesSchema>;
export type SegmentCondition = z.infer<typeof segmentConditionSchema>;
