import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import type { ServiceContext } from "@/lib/service-context";

/** What the AI may quote to customers. Prices and stock always come live from the catalog, never from here. */
export const KNOWLEDGE_CATEGORIES = ["POLICY", "FAQ", "SHIPPING", "RETURNS", "PRODUCT", "SIZING"] as const;

export async function listKnowledge(storeId: string) {
  return db.knowledgeArticle.findMany({ where: { storeId, agentId: null }, orderBy: [{ category: "asc" }, { updatedAt: "desc" }] });
}

export const knowledgeSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.enum(KNOWLEDGE_CATEGORIES),
  content: z.string().trim().min(5).max(4000),
  active: z.boolean().default(true),
});

export async function saveKnowledge(ctx: ServiceContext, input: z.infer<typeof knowledgeSchema>, id?: string) {
  if (id) {
    const existing = await db.knowledgeArticle.findFirst({ where: { id, storeId: ctx.storeId } });
    if (!existing) throw notFound("Article");
    const a = await db.knowledgeArticle.update({ where: { id }, data: input });
    await audit(ctx, { action: "knowledge.update", resourceType: "knowledge", resourceId: id, resourceLabel: a.title, oldValue: { title: existing.title, content: existing.content, active: existing.active }, newValue: input });
    return a;
  }
  const a = await db.knowledgeArticle.create({ data: { ...input, storeId: ctx.storeId } });
  await audit(ctx, { action: "knowledge.create", resourceType: "knowledge", resourceId: a.id, resourceLabel: a.title, newValue: input });
  return a;
}

export async function deleteKnowledge(ctx: ServiceContext, id: string) {
  const a = await db.knowledgeArticle.findFirst({ where: { id, storeId: ctx.storeId } });
  if (!a) throw notFound("Article");
  await db.knowledgeArticle.delete({ where: { id } });
  await audit(ctx, { action: "knowledge.delete", resourceType: "knowledge", resourceId: id, resourceLabel: a.title, oldValue: { title: a.title, content: a.content } });
}
