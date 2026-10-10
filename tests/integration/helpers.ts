import { randomUUID } from "node:crypto";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { ServiceContext } from "@/lib/service-context";
import type { NormalizedOrder } from "@/lib/shopify/mappers";
import { bootstrapStore } from "@/services/bootstrap.service";

/** Creates an isolated store with an owner, catalog and active template automations. */
export async function createTestStore() {
  const tag = randomUUID().slice(0, 8);
  const store = await db.store.create({ data: { name: `Test Store ${tag}`, slug: `test-${tag}`, demoMode: true, onboardingCompleted: true } });
  const owner = await db.user.create({ data: { email: `owner-${tag}@test.dev`, name: "Test Owner", passwordHash: "x", memberships: { create: { storeId: store.id, role: "OWNER" } } } });
  await bootstrapStore(store.id, { withTemplates: true });
  const shirts = await db.productCategory.findFirstOrThrow({ where: { storeId: store.id, slug: "shirts" } });
  const product = await db.product.create({
    data: {
      storeId: store.id,
      externalId: `p-${tag}`,
      title: "Premium Black Shirt",
      handle: `premium-black-shirt-${tag}`,
      categoryId: shirts.id,
      price: 399000,
      totalInventory: 20,
      variants: {
        create: [
          { storeId: store.id, externalId: `v-xl-${tag}`, inventoryItemId: `ii-xl-${tag}`, title: "XL", size: "XL", color: "Black", sku: `SKU-XL-${tag}`, price: 399000, costPrice: 180000, inventoryQuantity: 12, lowStockThreshold: 10 },
          { storeId: store.id, externalId: `v-m-${tag}`, inventoryItemId: `ii-m-${tag}`, title: "M", size: "M", color: "Black", sku: `SKU-M-${tag}`, price: 399000, costPrice: 180000, inventoryQuantity: 8, lowStockThreshold: 10 },
        ],
      },
    },
    include: { variants: true },
  });
  const ownerCtx: ServiceContext = { storeId: store.id, actor: { type: "USER", id: owner.id, name: owner.name, role: "OWNER" } };
  return { store, owner, product, tag, ownerCtx };
}

export function userCtx(storeId: string, role: Role, id = "user-x"): ServiceContext {
  return { storeId, actor: { type: "USER", id, name: `Test ${role}`, role } };
}

export async function destroyTestStore(storeId: string) {
  await db.user.deleteMany({ where: { memberships: { some: { storeId } } } });
  await db.store.delete({ where: { id: storeId } });
}

export function sampleOrder(tag: string, overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  const n = Math.floor(Math.random() * 900000) + 100000;
  return {
    externalId: `o-${tag}-${n}`,
    orderNumber: n,
    name: `#${n}`,
    currency: "PKR",
    email: "customer@test.dev",
    phone: "03001234567",
    customerName: "Muhammad Ali",
    customerExternalId: null,
    city: "Lahore",
    shippingAddress: { address1: "House 12, Street 4, DHA Phase 5", city: "Lahore" },
    subtotal: 399000,
    shippingTotal: 20000,
    discountTotal: 0,
    total: 419000,
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    tags: [],
    note: null,
    source: "web",
    placedAt: new Date(),
    cancelledAt: null,
    cancelReason: null,
    items: [{ externalProductId: `p-${tag}`, externalVariantId: `v-xl-${tag}`, title: "Premium Black Shirt", variantTitle: "XL", sku: null, quantity: 1, unitPrice: 399000 }],
    ...overrides,
  };
}
