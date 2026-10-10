import { db } from "@/lib/db";

const STOP = new Set(["the", "a", "an", "is", "are", "do", "you", "have", "available", "bhai", "hai", "kya", "in", "of", "for", "me", "please", "size", "color", "colour"]);

function stem(w: string) {
  return w.replace(/(es|s)$/, "");
}

export type CatalogMatch = {
  productId: string;
  title: string;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  status: string;
  score: number;
  totalStock: number;
  variants: { id: string; title: string; size: string | null; color: string | null; stock: number; price: number }[];
};

/**
 * Grounded product lookup for the AI agents: ranks catalog products by token
 * overlap and returns live variant stock. The agent answers ONLY from this.
 */
export async function searchCatalog(storeId: string, input: { query: string; size?: string | null; color?: string | null; limit?: number }): Promise<CatalogMatch[]> {
  const tokens = input.query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
  if (!tokens.length) return [];

  const products = await db.product.findMany({
    where: {
      storeId,
      deletedAt: null,
      status: { not: "ARCHIVED" },
      OR: tokens.map((t) => ({ OR: [{ title: { contains: t, mode: "insensitive" as const } }, { tags: { has: t } }, { variants: { some: { color: { equals: t, mode: "insensitive" as const } } } }] })),
    },
    include: { variants: { orderBy: { position: "asc" } }, category: true },
    take: 40,
  });

  const scored = products
    .map((p) => {
      // Whole-word matching: "shirt" must not match "sweatshirt". Title words weigh most.
      const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem));
      const titleWords = words(p.title);
      const otherWords = words(`${p.category?.name ?? ""} ${p.tags.join(" ")} ${p.variants.map((v) => v.color).join(" ")}`);
      const score = tokens.reduce((s, t) => s + (titleWords.has(t) ? 2 : otherWords.has(t) ? 1 : 0), 0);
      let variants = p.variants;
      if (input.color) variants = variants.filter((v) => !v.color || v.color.toLowerCase() === input.color!.toLowerCase());
      if (input.size) variants = variants.filter((v) => !v.size || v.size.toLowerCase() === input.size!.toLowerCase());
      return {
        productId: p.id,
        title: p.title,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        imageUrl: p.imageUrl,
        status: p.status,
        score,
        totalStock: variants.reduce((s, v) => s + Math.max(0, v.inventoryQuantity), 0),
        variants: variants.map((v) => ({ id: v.id, title: v.title, size: v.size, color: v.color, stock: v.inventoryQuantity, price: v.price })),
      };
    })
    .filter((p) => p.score >= Math.max(1, Math.ceil(tokens.length / 2)))
    .sort((a, b) => b.score - a.score || b.totalStock - a.totalStock);

  return scored.slice(0, input.limit ?? 3);
}

export async function searchKnowledge(storeId: string, query: string, category?: string | string[]) {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const cats = category ? (Array.isArray(category) ? category : [category]) : null;
  const articles = await db.knowledgeArticle.findMany({ where: { storeId, active: true, ...(cats ? { category: { in: cats } } : {}) } });
  return articles
    .map((a) => ({ ...a, score: words.reduce((s, w) => s + (`${a.title} ${a.content}`.toLowerCase().includes(w) ? 1 : 0), 0) + (category ? 1 : 0) }))
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
