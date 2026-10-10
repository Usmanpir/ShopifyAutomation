import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { DAY_MS } from "@/lib/dates";
import { notFound } from "@/lib/errors";
import { toMinor } from "@/lib/money";
import { segmentRulesSchema, type SegmentCondition, type SegmentRules } from "@/schemas/segment";

const numericOp = (op: SegmentCondition["operator"], v: number) =>
  op === "eq" ? { equals: v } : op === "neq" ? { not: v } : { [op]: v };

/** Translates one rule into a Prisma filter. Date-relative fields invert comparisons. */
function conditionToWhere(c: SegmentCondition, now: Date): Prisma.CustomerWhereInput {
  const n = Number(c.value);
  switch (c.field) {
    case "totalOrders":
    case "returnedCount":
    case "cancelledCount":
      return { [c.field]: numericOp(c.operator, n) };
    case "totalSpent":
    case "avgOrderValue":
      return { [c.field]: numericOp(c.operator, toMinor(n)) };
    case "daysSinceLastOrder":
    case "daysSinceFirstOrder": {
      const col = c.field === "daysSinceLastOrder" ? "lastOrderAt" : "firstOrderAt";
      const at = new Date(now.getTime() - n * DAY_MS);
      // "days since > N" ⇔ "date < now - N"
      const map: Record<string, Prisma.DateTimeNullableFilter> = {
        gt: { lt: at },
        gte: { lte: at },
        lt: { gt: at },
        lte: { gte: at },
        eq: { gte: new Date(at.getTime() - DAY_MS), lte: at },
        neq: { not: at },
      };
      return { [col]: map[c.operator] };
    }
    case "riskLevel":
      return { riskLevel: c.operator === "neq" ? { not: String(c.value) as never } : (String(c.value) as never) };
    case "city":
      return c.operator === "neq"
        ? { NOT: { city: { equals: String(c.value), mode: "insensitive" } } }
        : { city: { equals: String(c.value), mode: "insensitive" } };
    case "purchasedCategory": {
      const has: Prisma.CustomerWhereInput = {
        orders: { some: { items: { some: { product: { category: { slug: String(c.value) } } } } } },
      };
      return c.operator === "neq" ? { NOT: has } : has;
    }
    case "acceptsMarketing":
      return { acceptsMarketing: c.value === true || c.value === "true" };
  }
}

export function rulesToWhere(storeId: string, rules: SegmentRules, now = new Date()): Prisma.CustomerWhereInput {
  const parts = rules.conditions.map((c) => conditionToWhere(c, now));
  const base: Prisma.CustomerWhereInput = { storeId, deletedAt: null };
  if (!parts.length) return base;
  return { ...base, ...(rules.match === "any" ? { OR: parts } : { AND: parts }) };
}

/** Recomputes membership for one segment (replace strategy, done in a transaction). */
export async function recomputeSegment(segmentId: string) {
  const segment = await db.customerSegment.findUnique({ where: { id: segmentId } });
  if (!segment) throw notFound("Segment");
  const rules = segmentRulesSchema.parse(segment.rules ?? {});
  const ids = await db.customer.findMany({ where: rulesToWhere(segment.storeId, rules), select: { id: true } });
  await db.$transaction([
    db.customerSegmentMember.deleteMany({ where: { segmentId } }),
    db.customerSegmentMember.createMany({ data: ids.map((c) => ({ segmentId, customerId: c.id })), skipDuplicates: true }),
    db.customerSegment.update({ where: { id: segmentId }, data: { customerCount: ids.length, computedAt: new Date() } }),
  ]);
  return ids.length;
}

export async function recomputeAllSegments(storeId: string) {
  const segments = await db.customerSegment.findMany({ where: { storeId }, select: { id: true } });
  let total = 0;
  for (const s of segments) total += await recomputeSegment(s.id);
  return { segments: segments.length, memberships: total };
}

export async function listSegments(storeId: string) {
  return db.customerSegment.findMany({ where: { storeId }, orderBy: [{ isSystem: "desc" }, { customerCount: "desc" }] });
}

export async function previewSegment(storeId: string, rules: SegmentRules) {
  const where = rulesToWhere(storeId, rules);
  const [count, sample] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({ where, take: 5, orderBy: { totalSpent: "desc" }, select: { id: true, name: true, totalSpent: true, totalOrders: true } }),
  ]);
  return { count, sample };
}

export async function addCustomerToSegment(storeId: string, customerId: string, segmentKey: string) {
  const segment = await db.customerSegment.findUnique({ where: { storeId_key: { storeId, key: segmentKey } } });
  if (!segment) throw notFound(`Segment "${segmentKey}"`);
  await db.customerSegmentMember.upsert({
    where: { segmentId_customerId: { segmentId: segment.id, customerId } },
    create: { segmentId: segment.id, customerId },
    update: {},
  });
  const count = await db.customerSegmentMember.count({ where: { segmentId: segment.id } });
  await db.customerSegment.update({ where: { id: segment.id }, data: { customerCount: count } });
  return segment;
}

/** Default system segments created for every store. Thresholds are editable afterwards. */
export const SYSTEM_SEGMENTS: { key: string; name: string; description: string; color: string; rules: SegmentRules }[] = [
  { key: "new", name: "New", description: "First order in the last 30 days", color: "sky", rules: { match: "all", conditions: [{ field: "totalOrders", operator: "eq", value: 1 }, { field: "daysSinceFirstOrder", operator: "lte", value: 30 }] } },
  { key: "returning", name: "Returning", description: "Ordered more than once", color: "indigo", rules: { match: "all", conditions: [{ field: "totalOrders", operator: "gte", value: 2 }] } },
  { key: "vip", name: "VIP Customers", description: "Lifetime spend above Rs. 40,000", color: "violet", rules: { match: "all", conditions: [{ field: "totalSpent", operator: "gte", value: 40000 }] } },
  { key: "high_value", name: "High AOV Customers", description: "Average order above Rs. 7,000", color: "fuchsia", rules: { match: "all", conditions: [{ field: "avgOrderValue", operator: "gte", value: 7000 }] } },
  { key: "inactive", name: "Inactive Customers", description: "No purchase in 60+ days", color: "slate", rules: { match: "all", conditions: [{ field: "daysSinceLastOrder", operator: "gt", value: 60 }] } },
  { key: "at_risk", name: "At Risk", description: "Repeat buyers quiet for 35–60 days", color: "amber", rules: { match: "all", conditions: [{ field: "totalOrders", operator: "gte", value: 2 }, { field: "daysSinceLastOrder", operator: "gt", value: 35 }, { field: "daysSinceLastOrder", operator: "lte", value: 60 }] } },
  { key: "frequent", name: "Frequent Buyers", description: "5 or more orders", color: "emerald", rules: { match: "all", conditions: [{ field: "totalOrders", operator: "gte", value: 5 }] } },
  { key: "high_return", name: "High Return Rate", description: "2 or more returned orders", color: "red", rules: { match: "all", conditions: [{ field: "returnedCount", operator: "gte", value: 2 }] } },
  { key: "recent", name: "Recent Buyers", description: "Purchased in the last 14 days", color: "teal", rules: { match: "all", conditions: [{ field: "daysSinceLastOrder", operator: "lte", value: 14 }] } },
  { key: "shirt_buyers", name: "Shirt Buyers", description: "Bought from the Shirts category", color: "blue", rules: { match: "all", conditions: [{ field: "purchasedCategory", operator: "eq", value: "shirts" }] } },
  { key: "tracksuit_buyers", name: "Tracksuit Buyers", description: "Bought from the Tracksuits category", color: "orange", rules: { match: "all", conditions: [{ field: "purchasedCategory", operator: "eq", value: "tracksuits" }] } },
];

/** Priority used to pick the single "primary" segment badge in tables. */
export const SEGMENT_PRIORITY = ["vip", "high_return", "at_risk", "frequent", "high_value", "inactive", "returning", "new", "recent"];
