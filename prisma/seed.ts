/**
 * Demo seed: a realistic Pakistani menswear store with 90 days of history.
 *   npm run db:seed            (idempotent: wipes and recreates the demo store)
 * Demo login: usman@demo.commerceai.app / Demo@12345
 */
import "dotenv/config";
process.env.INLINE_JOBS = "true"; // run any side-effect jobs in-process during seeding

import { randomUUID } from "node:crypto";
import type { Prisma } from "../src/generated/prisma/client";
import type { OrderStatus, PaymentMethod, ShipmentStatus } from "../src/generated/prisma/enums";
import { hashPassword } from "../src/lib/auth/password";
import { db } from "../src/lib/db";
import { dayKey, startOfDayTz } from "../src/lib/dates";
import { scoreOrderRisk } from "../src/lib/risk/score";
import { defaultStoreSettings } from "../src/schemas/store-settings";
import { bootstrapStore } from "../src/services/bootstrap.service";
import { recordAITask } from "../src/services/agent.service";
import { createDecision } from "../src/services/decision.service";
import { generateInsights } from "../src/services/insight.service";
import { generateDailyReport } from "../src/services/report.service";
import { recomputeAllSegments } from "../src/services/segment.service";
import { AREAS, CITIES, COLORS, FIRST_NAMES, FIXED_STOCK, LAST_NAMES, PRODUCTS, STREETS } from "./seed-data";

// ───────────── deterministic randomness ─────────────
let seed = 20261003;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
}
const minor = (pkr: number) => Math.round(pkr * 100);
const TZ = "Asia/Karachi";
const NOW = new Date();
const DAY = 86_400_000;
const TODAY = startOfDayTz(NOW, TZ);
const at = (daysAgo: number, hour: number, minute = 0) => new Date(TODAY.getTime() - daysAgo * DAY + (hour * 60 + minute) * 60_000);

const STORE_SLUG = "urban-threads";
const PASSWORD = "Demo@12345";

async function wipe() {
  const store = await db.store.findUnique({ where: { slug: STORE_SLUG } });
  if (store) {
    await db.store.delete({ where: { id: store.id } }); // cascades to all store data
    console.log("  removed existing demo store");
  }
  await db.user.deleteMany({ where: { email: { endsWith: "@demo.commerceai.app" } } });
}

async function main() {
  const t0 = Date.now();
  console.log("🌱 Seeding CommerceAI demo data…");
  await wipe();

  // ───────────── Store & team ─────────────
  const passwordHash = await hashPassword(PASSWORD);
  const store = await db.store.create({
    data: {
      name: "Urban Threads",
      slug: STORE_SLUG,
      currency: "PKR",
      locale: "en-PK",
      timezone: TZ,
      demoMode: true,
      onboardingCompleted: true,
      settings: defaultStoreSettings() as unknown as Prisma.InputJsonValue,
    },
  });
  const storeId = store.id;
  const team = [
    { name: "Usman Khan", email: "usman@demo.commerceai.app", role: "OWNER" as const },
    { name: "Areeba Malik", email: "areeba@demo.commerceai.app", role: "ADMIN" as const },
    { name: "Hamza Qureshi", email: "hamza@demo.commerceai.app", role: "MANAGER" as const },
    { name: "Ayesha Siddiqui", email: "ayesha@demo.commerceai.app", role: "SUPPORT_AGENT" as const },
    { name: "Sana Javed", email: "sana@demo.commerceai.app", role: "MARKETING_MANAGER" as const },
    { name: "Bilal Ahmed", email: "bilal@demo.commerceai.app", role: "VIEWER" as const },
  ];
  const users = [];
  for (const m of team) {
    const u = await db.user.create({ data: { name: m.name, email: m.email, passwordHash, lastLoginAt: at(int(0, 3), int(9, 20)), memberships: { create: { storeId, role: m.role } } } });
    users.push({ ...u, role: m.role });
  }
  const owner = users[0];
  const support = users[3];
  await bootstrapStore(storeId, { withTemplates: true });
  await db.integration.updateMany({ where: { storeId }, data: { status: "DEMO", lastSyncAt: new Date(NOW.getTime() - 9 * 60_000) } });
  console.log("  ✓ store, team, agents, automations");

  // ───────────── Catalog ─────────────
  const categories = await db.productCategory.findMany({ where: { storeId } });
  type V = { id: string; productId: string; title: string; size: string; price: number; cost: number; product: (typeof PRODUCTS)[number]; stock: number };
  const variants: V[] = [];
  const productRows: Prisma.ProductCreateManyInput[] = [];
  const variantRows: Prisma.ProductVariantCreateManyInput[] = [];
  const productIds = new Map<string, string>();
  for (const [pi, p] of PRODUCTS.entries()) {
    const id = randomUUID();
    productIds.set(p.title, id);
    const handle = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const costRatio = 0.4 + rand() * 0.12;
    productRows.push({
      id,
      storeId,
      externalId: `${7000000000 + pi}`,
      title: p.title,
      handle,
      description: `${p.title} from the Urban Threads ${categories.find((c) => c.slug === p.category)?.name} line. Premium fabric, tailored fit, made in Pakistan.`,
      categoryId: categories.find((c) => c.slug === p.category)!.id,
      vendor: "Urban Threads",
      imageUrl: `swatch:${p.shape}:${COLORS[p.color]}`,
      status: p.title.includes("Velour") ? "DRAFT" : "ACTIVE",
      tags: p.tags,
      price: minor(p.price),
      compareAtPrice: p.compareAt ? minor(p.compareAt) : null,
      costPrice: minor(Math.round(p.price * costRatio)),
      sessions: 0,
    });
    for (const [si, size] of p.sizes.entries()) {
      const vid = randomUUID();
      const fixed = FIXED_STOCK[p.title]?.[size];
      const sizeWeight = size === "M" || size === "L" || size === "32" || size === "34" ? 1.5 : size === "XXL" || size === "38" ? 0.5 : 1;
      const stock = fixed ?? Math.max(0, Math.round((rand() < 0.08 ? int(0, 4) : int(8, 70)) * sizeWeight));
      const title = size === "One Size" ? "Default" : size;
      variantRows.push({
        id: vid,
        storeId,
        productId: id,
        externalId: `${8000000000 + pi * 10 + si}`,
        inventoryItemId: `${9000000000 + pi * 10 + si}`,
        title,
        sku: `UT-${handle.split("-").map((w) => w[0]).join("").toUpperCase().slice(0, 5)}-${size.replace(" ", "")}`,
        size: size === "One Size" ? null : size,
        color: p.color,
        price: minor(p.price),
        compareAtPrice: p.compareAt ? minor(p.compareAt) : null,
        costPrice: minor(Math.round(p.price * costRatio)),
        inventoryQuantity: stock,
        lowStockThreshold: 10,
        position: si,
      });
      variants.push({ id: vid, productId: id, title, size, price: minor(p.price), cost: minor(Math.round(p.price * costRatio)), product: p, stock });
    }
  }
  await db.product.createMany({ data: productRows });
  await db.productVariant.createMany({ data: variantRows });
  console.log(`  ✓ ${productRows.length} products, ${variantRows.length} variants`);

  // ───────────── Customers ─────────────
  type C = { id: string; name: string; phone: string; city: string; address: Record<string, string>; persona: "vip" | "regular" | "oneoff" | "risky" | "inactive" | "returner" };
  const customers: C[] = [];
  const usedNames = new Set<string>();
  const personaWeights: [C["persona"], number][] = [["vip", 4], ["regular", 18], ["oneoff", 64], ["risky", 4], ["inactive", 8], ["returner", 2]];
  while (customers.length < 360) {
    const name = customers.length === 0 ? "Muhammad Ali" : `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    const city = weighted(CITIES);
    const persona = customers.length === 0 ? "vip" : weighted(personaWeights);
    customers.push({
      id: randomUUID(),
      name,
      phone: `923${int(0, 4)}${int(10000000, 99999999)}`,
      city,
      address: { address1: `House ${int(1, 350)}, Street ${int(1, 45)}, ${pick(AREAS[city])}`, address2: pick(STREETS), city, country: "Pakistan" },
      persona,
    });
  }
  const firstSeen = (c: C) => (c.persona === "inactive" ? int(75, 89) : c.persona === "oneoff" ? int(0, 89) : int(55, 89));
  const joinDay = new Map<string, number>();
  for (const c of customers) joinDay.set(c.id, c.name === "Muhammad Ali" ? 89 : firstSeen(c));
  await db.customer.createMany({
    data: customers.map((c, i) => ({
      id: c.id,
      storeId,
      externalId: `${6000000000 + i}`,
      name: c.name,
      email: rand() < 0.6 ? `${c.name.toLowerCase().replace(/[^a-z]+/g, ".")}${int(1, 99)}@gmail.com` : null,
      phone: c.phone,
      city: c.city,
      address: c.address,
      tags: c.persona === "vip" ? ["vip"] : [],
      acceptsMarketing: rand() < 0.85,
      createdAt: at(joinDay.get(c.id)!, 9),
    })),
  });
  console.log(`  ✓ ${customers.length} customers`);

  // ───────────── Orders ─────────────
  const orders: Prisma.OrderCreateManyInput[] = [];
  const items: Prisma.OrderItemCreateManyInput[] = [];
  const events: Prisma.OrderEventCreateManyInput[] = [];
  const shipments: Prisma.ShipmentCreateManyInput[] = [];
  const tracking: Prisma.TrackingEventCreateManyInput[] = [];
  const history = new Map<string, { total: number; delivered: number; cancelled: number; returned: number; cities: Set<string> }>();
  let orderNumber = 10000;
  const orderedVariantsByCustomer = new Map<string, string[]>();
  const customerPool: [C, number][] = customers.map((c) => [c, c.persona === "vip" ? 7 : c.persona === "regular" ? 2.5 : c.persona === "risky" ? 2 : c.persona === "returner" ? 3 : c.persona === "inactive" ? 3 : 1.2]);

  for (let d = 89; d >= 0; d--) {
    const dayDate = new Date(TODAY.getTime() - d * DAY);
    const weekday = new Date(dayDate.getTime() + 12 * 3_600_000).getUTCDay();
    const growth = (0.7 + ((89 - d) / 89) * 0.55) * (d < 7 ? 1.3 : 1); // business grew over the quarter
    const weekendBoost = weekday === 5 || weekday === 6 || weekday === 0 ? 1.18 : 1;
    let count = Math.round((9.5 * growth * weekendBoost + (rand() - 0.5) * 4) * (d === 1 ? 0.82 : 1));
    if (d === 0) count = Math.max(4, Math.round(count * Math.min(1, (NOW.getTime() - TODAY.getTime()) / DAY) * 1.1));

    for (let n = 0; n < count; n++) {
      orderNumber++;
      // Inactive customers stop buying after day 60; one-off customers rarely repeat.
      const joiningToday = customers.filter((x) => joinDay.get(x.id) === d && !orderedVariantsByCustomer.has(x.id));
      // Only customers who have already "joined" can order; new joiners place their first order on their join day.
      const dayPool = customerPool.filter(([x]) => joinDay.get(x.id)! >= d && !(x.persona === "inactive" && d < 62));
      let c = joiningToday[0] ?? weighted(dayPool);
      for (let tries = 0; tries < 6 && c.persona === "oneoff" && orderedVariantsByCustomer.has(c.id) && rand() < 0.85; tries++) c = weighted(dayPool);
      const hour = weighted<number>([[9, 1], [11, 2], [13, 3], [15, 3], [17, 3], [19, 4], [21, 5], [22, 4], [23, 2]]);
      const placedAt = new Date(dayDate.getTime() + (hour * 60 + int(0, 59)) * 60_000);
      if (placedAt > NOW) continue;
      const lineCount = weighted<number>([[1, 62], [2, 28], [3, 10]]);
      const lines: { v: V; qty: number }[] = [];
      for (let l = 0; l < lineCount; l++) {
        const recentFactor = (p: (typeof PRODUCTS)[number]) => (d < 14 ? (p.trend ?? 1) : d < 30 ? 1 + ((p.trend ?? 1) - 1) * 0.4 : 1);
        const prod = weighted(PRODUCTS.filter((p) => !p.title.includes("Velour")).map((p) => [p, p.popularity * recentFactor(p)] as [typeof p, number]));
        const pv = variants.filter((v) => v.product === prod);
        const v = weighted(pv.map((x) => [x, x.size === "M" || x.size === "L" || x.size === "32" || x.size === "34" ? 3 : x.size === "XXL" ? 0.6 : 1.4] as [V, number]));
        if (lines.some((x) => x.v.id === v.id)) continue;
        lines.push({ v, qty: rand() < 0.9 ? 1 : 2 });
      }
      const subtotal = lines.reduce((s, l) => s + l.v.price * l.qty, 0);
      const discount = rand() < 0.12 ? Math.round(subtotal * 0.1) : 0;
      const shippingTotal = subtotal - discount >= minor(5000) ? 0 : minor(200);
      const total = subtotal - discount + shippingTotal;
      const payment: PaymentMethod = c.persona === "risky" ? "COD" : weighted<PaymentMethod>([["COD", 80], ["CARD", 9], ["BANK_TRANSFER", 6], ["WALLET", 5]]);

      const h = history.get(c.id) ?? { total: 0, delivered: 0, cancelled: 0, returned: 0, cities: new Set<string>() };
      const risk = scoreOrderRisk(
        {
          orderTotal: total,
          paymentMethod: payment,
          customer: h.total ? { totalOrders: h.total, deliveredCount: h.delivered, cancelledCount: h.cancelled, returnedCount: h.returned } : null,
          phone: { normalized: c.phone, distinctNames: 1, cancelledOrders: h.cancelled },
          address: { line: `${c.address.address1} ${c.address.address2}`, city: c.city, previousCities: [...h.cities] },
          recentOrdersSamePhone: c.persona === "risky" && rand() < 0.4 ? 1 : 0,
        },
        defaultStoreSettings().risk,
      );

      // Lifecycle depends on age and persona
      let status: OrderStatus;
      const cancelChance = c.persona === "risky" ? 0.45 : risk.level === "HIGH" ? 0.3 : 0.08;
      const returnChance = c.persona === "returner" ? 0.4 : 0.05;
      if (d >= 7) status = rand() < cancelChance ? "CANCELLED" : rand() < returnChance ? "RETURNED" : rand() < 0.97 ? "DELIVERED" : "SHIPPED";
      else if (d >= 4) status = rand() < cancelChance ? "CANCELLED" : weighted<OrderStatus>([["DELIVERED", 55], ["SHIPPED", 35], ["PROCESSING", 6], ["RETURNED", 4]]);
      else if (d >= 2) status = rand() < cancelChance ? "CANCELLED" : weighted<OrderStatus>([["SHIPPED", 55], ["PROCESSING", 20], ["CONFIRMED", 15], ["DELIVERED", 10]]);
      else if (d === 1) status = rand() < cancelChance * 1.6 ? "CANCELLED" : weighted<OrderStatus>([["CONFIRMED", 35], ["PROCESSING", 25], ["SHIPPED", 15], ["PENDING_CONFIRMATION", 25]]);
      else status = payment === "COD" ? weighted<OrderStatus>([["PENDING_CONFIRMATION", 45], ["CONFIRMED", 30], ["NEW", 25]]) : weighted<OrderStatus>([["CONFIRMED", 60], ["NEW", 40]]);

      const id = randomUUID();
      const t = (mins: number) => new Date(Math.min(placedAt.getTime() + mins * 60_000, NOW.getTime() - 60_000));
      const confirmedAt = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "RETURNED"].includes(status) ? t(int(8, 180)) : null;
      const shippedAt = ["SHIPPED", "DELIVERED", "RETURNED"].includes(status) ? t(int(18, 30) * 60) : null;
      const deliveredAt = ["DELIVERED", "RETURNED"].includes(status) ? t(int(50, 96) * 60) : null;
      const cancelledAt = status === "CANCELLED" ? t(int(30, 900)) : null;
      const returnedAt = status === "RETURNED" ? t(int(120, 168) * 60) : null;
      const confirmationStatus =
        payment !== "COD" ? "NOT_REQUIRED" : status === "PENDING_CONFIRMATION" ? "PENDING" : status === "NEW" ? "NOT_REQUIRED" : status === "CANCELLED" ? (rand() < 0.5 ? "DECLINED" : "NO_RESPONSE") : "CONFIRMED";
      const tags = [...(risk.level === "HIGH" ? ["high-risk"] : []), ...(status === "CANCELLED" && confirmationStatus === "NO_RESPONSE" ? ["no-response"] : [])];

      orders.push({
        id,
        storeId,
        externalId: `${5000000000 + orderNumber}`,
        orderNumber,
        name: `#${orderNumber}`,
        customerId: c.id,
        customerName: c.name,
        email: null,
        phone: c.phone,
        city: c.city,
        shippingAddress: c.address,
        currency: "PKR",
        subtotal,
        shippingTotal,
        discountTotal: discount,
        total,
        paymentMethod: payment,
        paymentStatus: payment === "COD" ? (status === "DELIVERED" ? "PAID" : status === "RETURNED" ? "REFUNDED" : "PENDING") : status === "RETURNED" ? "REFUNDED" : "PAID",
        status,
        fulfillmentStatus: shippedAt ? "FULFILLED" : "UNFULFILLED",
        confirmationStatus,
        riskScore: risk.score,
        riskLevel: risk.level,
        riskSignals: risk as unknown as Prisma.InputJsonValue,
        source: weighted<string>([["web", 55], ["instagram", 25], ["facebook", 15], ["whatsapp", 5]]),
        tags,
        placedAt,
        confirmedAt,
        shippedAt,
        deliveredAt,
        cancelledAt,
        cancelReason: status === "CANCELLED" ? (confirmationStatus === "DECLINED" ? "Customer declined on WhatsApp" : pick(["No response to confirmation", "Customer changed mind", "Fake order — unreachable", "Out of stock"])) : null,
        returnedAt,
        createdAt: placedAt,
        updatedAt: returnedAt ?? deliveredAt ?? cancelledAt ?? shippedAt ?? confirmedAt ?? placedAt,
      });
      for (const l of lines) {
        items.push({ id: randomUUID(), orderId: id, productId: l.v.productId, variantId: l.v.id, title: l.v.product.title, variantTitle: l.v.title === "Default" ? null : l.v.title, sku: null, imageUrl: `swatch:${l.v.product.shape}:${COLORS[l.v.product.color]}`, quantity: l.qty, unitPrice: l.v.price, unitCost: l.v.cost, total: l.v.price * l.qty });
      }
      orderedVariantsByCustomer.set(c.id, [...(orderedVariantsByCustomer.get(c.id) ?? []), ...lines.map((l) => l.v.id)]);

      // Timeline
      const ev = (type: string, title: string, when: Date, actorType: "SYSTEM" | "AI" | "USER" | "CUSTOMER" | "WEBHOOK" = "SYSTEM", actorName?: string, description?: string) =>
        events.push({ id: randomUUID(), storeId, orderId: id, type, title, createdAt: when, actorType, actorName: actorName ?? null, description: description ?? null });
      ev("placed", "Order placed", placedAt, "WEBHOOK", "Shopify", `${lines.reduce((s, l) => s + l.qty, 0)} item(s)`);
      ev("risk_analyzed", `AI risk analyzed · ${risk.level.toLowerCase()} risk (${risk.score}/100)`, t(1), "AI", "Order Agent", risk.signals.filter((s) => s.points > 0).slice(0, 2).map((s) => s.detail).join(" · "));
      if (payment === "COD" && status !== "NEW") {
        ev("confirmation_sent", "WhatsApp confirmation sent", t(2), "AI", "Order Agent");
        if (confirmationStatus === "CONFIRMED") ev("customer_confirmed", "Customer confirmed", t(int(5, 170)), "CUSTOMER", c.name, "“Yes”");
        if (confirmationStatus === "DECLINED") ev("customer_declined", "Customer declined", t(int(10, 300)), "CUSTOMER", c.name, "“No, cancel it”");
      }
      if (confirmedAt) ev("confirmed", "Order confirmed", confirmedAt, payment === "COD" ? "AI" : "SYSTEM", payment === "COD" ? "WhatsApp Agent" : undefined);
      if (["PROCESSING", "SHIPPED", "DELIVERED", "RETURNED"].includes(status)) ev("processing", "Order processed", t(int(4, 16) * 60), "USER", pick(["Hamza Qureshi", "Ayesha Siddiqui"]));
      if (shippedAt) {
        const sid = randomUUID();
        const tn = `DX${(placedAt.getTime() / 1000).toString(36).toUpperCase().slice(-6)}${int(10, 99)}`;
        const shipStatus: ShipmentStatus = status === "DELIVERED" ? "DELIVERED" : status === "RETURNED" ? "RETURNED" : weighted<ShipmentStatus>([["IN_TRANSIT", 60], ["OUT_FOR_DELIVERY", 25], ["PICKED_UP", 15]]);
        shipments.push({ id: sid, storeId, orderId: id, courier: "demo", trackingNumber: tn, status: shipStatus, codAmount: payment === "COD" ? total : 0, estimatedDelivery: new Date(shippedAt.getTime() + 2 * DAY), lastSyncedAt: new Date(NOW.getTime() - int(5, 60) * 60_000), createdAt: shippedAt });
        ev("shipment_created", "Shipment created", shippedAt, "SYSTEM", "Demo Express", `Demo Express · ${tn}`);
        ev("shipped", "Order shipped", shippedAt, "SYSTEM", "Demo Express");
        const flow: ShipmentStatus[] = ["BOOKED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];
        const upto = shipStatus === "RETURNED" ? 5 : flow.indexOf(shipStatus) + 1;
        for (let i = 0; i < upto; i++) {
          const when = new Date(Math.min(shippedAt.getTime() + i * 10 * 3_600_000, (deliveredAt ?? NOW).getTime()));
          tracking.push({ id: randomUUID(), shipmentId: sid, status: flow[i], description: ["Shipment booked", "Picked up from warehouse", `In transit to ${c.city}`, "Out for delivery with rider", "Delivered to consignee"][i], location: i < 2 ? "Lahore hub" : c.city, occurredAt: when });
          if (flow[i] === "OUT_FOR_DELIVERY") ev("out_for_delivery", "Out for delivery", when, "SYSTEM", "Demo Express");
        }
        if (shipStatus === "RETURNED") tracking.push({ id: randomUUID(), shipmentId: sid, status: "RETURNED", description: "Returned to origin", location: "Lahore hub", occurredAt: returnedAt ?? NOW });
      }
      if (deliveredAt) ev("delivered", "Delivered", deliveredAt, "SYSTEM", "Demo Express");
      if (cancelledAt) ev("cancelled", "Order cancelled", cancelledAt, confirmationStatus === "DECLINED" ? "AI" : "USER", confirmationStatus === "DECLINED" ? "WhatsApp Agent" : "Hamza Qureshi", orders[orders.length - 1].cancelReason ?? undefined);
      if (returnedAt) ev("returned", "Order returned", returnedAt, "USER", "Ayesha Siddiqui", pick(["Size too small", "Size too large", "Colour different from picture", "Changed mind"]));

      h.total++;
      if (status === "DELIVERED") h.delivered++;
      if (status === "CANCELLED") h.cancelled++;
      if (status === "RETURNED") h.returned++;
      h.cities.add(c.city);
      history.set(c.id, h);
    }
  }
  // The example order from the spec, made confirmed & recent.
  const showcase = orders.find((o) => o.orderNumber === 10452);
  if (showcase) {
    showcase.customerId = customers[0].id;
    showcase.customerName = customers[0].name;
    showcase.phone = customers[0].phone;
    showcase.city = customers[0].city;
  }
  for (let i = 0; i < orders.length; i += 500) await db.order.createMany({ data: orders.slice(i, i + 500) });
  for (let i = 0; i < items.length; i += 1000) await db.orderItem.createMany({ data: items.slice(i, i + 1000) });
  for (let i = 0; i < events.length; i += 2000) await db.orderEvent.createMany({ data: events.slice(i, i + 2000) });
  await db.shipment.createMany({ data: shipments });
  for (let i = 0; i < tracking.length; i += 2000) await db.trackingEvent.createMany({ data: tracking.slice(i, i + 2000) });
  console.log(`  ✓ ${orders.length} orders, ${items.length} items, ${shipments.length} shipments`);

  // Denormalized metrics (customers, products, variants)
  await db.$executeRaw`
    UPDATE "Customer" c SET
      "totalOrders" = s.total, "totalSpent" = s.spent, "avgOrderValue" = CASE WHEN s.valid > 0 THEN s.spent / s.valid ELSE 0 END,
      "deliveredCount" = s.delivered, "cancelledCount" = s.cancelled, "returnedCount" = s.returned,
      "firstOrderAt" = s.first, "lastOrderAt" = s.last,
      "riskScore" = LEAST(100, s.cancelled * 25 + s.returned * 15 + CASE WHEN s.delivered = 0 THEN 15 ELSE 0 END),
      "riskLevel" = (CASE WHEN LEAST(100, s.cancelled * 25 + s.returned * 15) >= 60 THEN 'HIGH' WHEN LEAST(100, s.cancelled * 25 + s.returned * 15) >= 30 THEN 'MEDIUM' ELSE 'LOW' END)::"RiskLevel"
    FROM (
      SELECT "customerId" id, COUNT(*) total,
        COALESCE(SUM(total) FILTER (WHERE status NOT IN ('CANCELLED','RETURNED')), 0) spent,
        COUNT(*) FILTER (WHERE status <> 'CANCELLED') valid,
        COUNT(*) FILTER (WHERE status = 'DELIVERED') delivered,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') cancelled,
        COUNT(*) FILTER (WHERE status = 'RETURNED') returned,
        MIN("placedAt") first, MAX("placedAt") last
      FROM "Order" WHERE "storeId" = ${storeId} GROUP BY "customerId"
    ) s WHERE c.id = s.id`;
  await db.$executeRaw`
    UPDATE "ProductVariant" v SET "unitsSold" = s.units
    FROM (SELECT i."variantId" id, SUM(i.quantity) units FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" WHERE o."storeId" = ${storeId} AND o.status <> 'CANCELLED' GROUP BY 1) s
    WHERE v.id = s.id`;
  await db.$executeRaw`
    UPDATE "Product" p SET "unitsSold" = s.units, revenue = s.revenue,
      "returnRate" = CASE WHEN s.units > 0 THEN (s.returned::float / s.units) * 100 ELSE 0 END,
      "totalInventory" = (SELECT COALESCE(SUM(GREATEST("inventoryQuantity", 0)), 0) FROM "ProductVariant" WHERE "productId" = p.id),
      sessions = (s.units * (30 + floor(random() * 30)))::int
    FROM (SELECT i."productId" id, SUM(i.quantity) units, SUM(i.total) revenue, COALESCE(SUM(i.quantity) FILTER (WHERE o.status = 'RETURNED'), 0) returned
          FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" WHERE o."storeId" = ${storeId} AND o.status <> 'CANCELLED' GROUP BY 1) s
    WHERE p.id = s.id`;
  await db.$executeRaw`UPDATE "Product" p SET "totalInventory" = (SELECT COALESCE(SUM(GREATEST("inventoryQuantity", 0)), 0) FROM "ProductVariant" WHERE "productId" = p.id) WHERE "storeId" = ${storeId}`;

  // Store traffic → conversion rate
  const ordersPerDay = new Map<string, number>();
  for (const o of orders) ordersPerDay.set(dayKey(o.placedAt as Date, TZ), (ordersPerDay.get(dayKey(o.placedAt as Date, TZ)) ?? 0) + 1);
  const traffic: Prisma.StoreDailyMetricCreateManyInput[] = [];
  for (let d = 89; d >= 0; d--) {
    const key = dayKey(new Date(TODAY.getTime() - d * DAY + 12 * 3_600_000), TZ);
    const o = ordersPerDay.get(key) ?? 0;
    const sessions = Math.round(o / (0.016 + rand() * 0.008)) + int(20, 80);
    traffic.push({ storeId, date: new Date(key), sessions, addToCarts: Math.round(sessions * (0.06 + rand() * 0.03)), checkouts: Math.round(sessions * (0.028 + rand() * 0.01)) });
  }
  await db.storeDailyMetric.createMany({ data: traffic });

  // ───────────── Meta ads ─────────────
  const account = await db.metaAccount.create({
    data: { storeId, adAccountId: "act_204815162342", name: "Urban Threads Ads", currency: "PKR", pageId: "104820091234567", pageName: "Urban Threads", instagramId: "17841400000000000", instagramHandle: "urbanthreads.pk", lastSyncAt: new Date(NOW.getTime() - 9 * 60_000) },
  });
  const campaignDefs = [
    { name: "Winter Collection — Sales", objective: "OUTCOME_SALES", status: "ACTIVE" as const, budget: 3000, roas: 4.2, start: 40, video: 0.7, audiences: ["Lookalike 1% — Purchasers", "Interests — Winter Fashion", "Advantage+ Audience"] },
    { name: "Premium Shirts — Conversions", objective: "OUTCOME_SALES", status: "ACTIVE" as const, budget: 2400, roas: 3.4, start: 89, video: 0.35, audiences: ["Broad — Men 22-45", "Interests — Formal Wear"] },
    { name: "Retargeting — Website Visitors", objective: "OUTCOME_SALES", status: "ACTIVE" as const, budget: 1400, roas: 5.2, start: 89, video: 0.3, audiences: ["Visitors 30 days", "Add to cart 14 days"] },
    { name: "Tracksuits — Advantage+", objective: "OUTCOME_SALES", status: "ACTIVE" as const, budget: 2000, roas: 3.0, start: 30, video: 0.6, audiences: ["Advantage+ Shopping"] },
    { name: "Polo Summer Clearance", objective: "OUTCOME_SALES", status: "ACTIVE" as const, budget: 1200, roas: 0.95, start: 60, video: 0.2, audiences: ["Interests — Casual Wear", "Broad — Men 18-35"] },
    { name: "Brand Awareness — Reach", objective: "OUTCOME_AWARENESS", status: "ACTIVE" as const, budget: 800, roas: 0.8, start: 89, video: 0.9, audiences: ["Pakistan — Men 18-45"] },
    { name: "Lead Gen — WhatsApp", objective: "OUTCOME_LEADS", status: "PAUSED" as const, budget: 700, roas: 1.6, start: 75, video: 0.4, audiences: ["Lahore & Karachi — Men 20-40"] },
    { name: "Eid Collection 2026", objective: "OUTCOME_SALES", status: "ARCHIVED" as const, budget: 2800, roas: 3.8, start: 89, video: 0.5, audiences: ["Lookalike 2% — Purchasers"] },
  ];
  const headlines = ["New Winter Drop is Here ❄️", "Premium Shirts — Rs. 3,990", "Free Delivery Over Rs. 5,000", "Tracksuits Back in Stock", "Up to 30% Off Polos", "Made for Pakistani Winters", "Order on WhatsApp in 1 Tap"];
  const texts = [
    "Stay warm in style. Shop the new Winter Collection — puffer jackets, tracksuits & more. Cash on delivery nationwide 🚚",
    "Crisp, breathable, perfectly tailored. Our Premium Shirts are back in all sizes. Order now — COD available.",
    "Still thinking about it? Your cart is waiting. Free delivery on orders over Rs. 5,000.",
    "The tracksuit everyone's asking for. Limited stock in XL — shop now before it's gone!",
    "Clearance sale: Polos from Rs. 2,490. Limited time only.",
  ];
  const insightRows: Prisma.AdInsightCreateManyInput[] = [];
  for (const [ci, def] of campaignDefs.entries()) {
    const campaign = await db.campaign.create({
      data: { storeId, metaAccountId: account.id, externalId: `${238500000000 + ci}`, name: def.name, objective: def.objective, status: def.status, dailyBudget: minor(def.budget), startDate: at(def.start, 0), endDate: def.status === "ARCHIVED" ? at(55, 0) : null },
    });
    for (const [ai, audience] of def.audiences.entries()) {
      const adSet = await db.adSet.create({
        data: { storeId, campaignId: campaign.id, externalId: `${238600000000 + ci * 10 + ai}`, name: `${audience}`, status: def.status === "ARCHIVED" ? "ARCHIVED" : def.status, dailyBudget: null, optimizationGoal: def.objective === "OUTCOME_LEADS" ? "LEAD_GENERATION" : def.objective === "OUTCOME_AWARENESS" ? "REACH" : "OFFSITE_CONVERSIONS", audienceName: audience, targeting: { geo: ["PK"], age: [20, 45], genders: ["male"] } },
      });
      const adCount = int(2, 3);
      for (let k = 0; k < adCount; k++) {
        const isVideo = rand() < def.video;
        const type = isVideo ? "VIDEO" : rand() < 0.25 ? "CAROUSEL" : "IMAGE";
        const prod = pick(PRODUCTS.filter((p) => (def.name.includes("Winter") ? p.category === "winter-collection" || p.category === "tracksuits" : def.name.includes("Shirt") ? p.category === "shirts" && p.shape === "shirt" : def.name.includes("Tracksuit") ? p.category === "tracksuits" : def.name.includes("Polo") ? p.shape === "polo" : true)));
        const ad = await db.ad.create({
          data: { storeId, campaignId: campaign.id, adSetId: adSet.id, externalId: `${238700000000 + ci * 100 + ai * 10 + k}`, name: `${type === "VIDEO" ? "Video" : type === "CAROUSEL" ? "Carousel" : "Static"} — ${prod.title}`, status: campaign.status, creativeType: type, thumbnailUrl: `swatch:${prod.shape}:${COLORS[prod.color]}`, headline: pick(headlines), primaryText: pick(texts), callToAction: pick(["SHOP_NOW", "ORDER_NOW", "SEND_WHATSAPP_MESSAGE"]) },
        });
        const typeBoost = type === "VIDEO" ? 1.3 : type === "CAROUSEL" ? 1.05 : 0.85;
        const adQuality = 0.75 + rand() * 0.5;
        for (let d = def.start; d >= 0; d--) {
          if (def.status === "ARCHIVED" && d < 55) continue;
          if (def.status === "PAUSED" && d < 9) continue;
          const share = 1 / (def.audiences.length * adCount);
          const dayFactor = d === 0 ? Math.min(1, (NOW.getTime() - TODAY.getTime()) / DAY) : 1;
          const spend = Math.round(minor(def.budget) * share * (0.85 + rand() * 0.3) * dayFactor);
          if (spend <= 0) continue;
          const cpm = minor(110 + rand() * 60);
          const impressions = Math.round((spend / cpm) * 1000);
          const ctr = (0.009 + rand() * 0.008) * typeBoost;
          const clicks = Math.round(impressions * ctr);
          const roas = def.roas * typeBoost * adQuality * (0.7 + rand() * 0.6) * (d < 3 && def.name.includes("Winter") ? 1.15 : 1);
          const revenue = Math.round(spend * roas);
          const expected = def.objective === "OUTCOME_SALES" ? revenue / minor(5200) : 0;
          const purchases = Math.floor(expected) + (rand() < expected - Math.floor(expected) ? 1 : 0);
          insightRows.push({ storeId, level: "AD", entityId: ad.id, campaignId: campaign.id, date: new Date(dayKey(new Date(TODAY.getTime() - d * DAY + 12 * 3_600_000), TZ)), spend, impressions, reach: Math.round(impressions * 0.78), clicks, purchases, revenue: purchases * minor(4600 + int(0, 1200)), leads: def.objective === "OUTCOME_LEADS" ? Math.round(clicks * 0.12) : 0 });
        }
      }
    }
  }
  // Roll AD → ADSET → CAMPAIGN
  const ads = await db.ad.findMany({ where: { storeId }, select: { id: true, adSetId: true } });
  const roll = new Map<string, Prisma.AdInsightCreateManyInput>();
  for (const r of insightRows) {
    const adSetId = ads.find((a) => a.id === r.entityId)!.adSetId;
    for (const [level, entityId] of [["ADSET", adSetId], ["CAMPAIGN", r.campaignId]] as const) {
      const key = `${level}:${entityId}:${(r.date as Date).toISOString()}`;
      const cur = roll.get(key) ?? { storeId, level, entityId, campaignId: r.campaignId, date: r.date, spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, revenue: 0, leads: 0 };
      cur.spend! += r.spend!;
      cur.impressions! += r.impressions!;
      cur.reach! += r.reach!;
      cur.clicks! += r.clicks!;
      cur.purchases! += r.purchases!;
      cur.revenue! += r.revenue!;
      cur.leads! += r.leads!;
      roll.set(key, cur);
    }
  }
  const allInsights = [...insightRows, ...roll.values()];
  for (let i = 0; i < allInsights.length; i += 2000) await db.adInsight.createMany({ data: allInsights.slice(i, i + 2000) });
  console.log(`  ✓ ${campaignDefs.length} campaigns, ${ads.length} ads, ${allInsights.length} insight rows`);

  // ───────────── Conversations ─────────────
  type Msg = { from: "c" | "ai" | "agent" | "sys"; text: string; minsAgo: number; template?: string };
  const usedHandles = new Set<string>();
  let cursor = 1;
  const freeCustomer = () => {
    while (usedHandles.has(customers[cursor].phone)) cursor++;
    return customers[cursor++];
  };
  const conv = async (customer: C | null, channel: "WHATSAPP" | "FACEBOOK" | "INSTAGRAM", name: string, handle: string, msgs: Msg[], extra: Partial<Prisma.ConversationUncheckedCreateInput> = {}) => {
    usedHandles.add(handle);
    const last = msgs[msgs.length - 1];
    const c = await db.conversation.create({
      data: { storeId, channel, externalThreadId: handle, contactHandle: handle, contactName: name, customerId: customer?.id ?? null, lastMessageAt: new Date(NOW.getTime() - last.minsAgo * 60_000), lastMessagePreview: last.text.slice(0, 140), lastMessageDirection: last.from === "c" ? "INBOUND" : "OUTBOUND", unreadCount: msgs.filter((m) => m.from === "c").length && last.from === "c" ? 1 : 0, ...extra },
    });
    await db.message.createMany({
      data: msgs.map((m) => ({
        storeId,
        conversationId: c.id,
        direction: m.from === "c" ? "INBOUND" : "OUTBOUND",
        sender: m.from === "c" ? "CUSTOMER" : m.from === "ai" ? "AI" : m.from === "agent" ? "AGENT" : "SYSTEM",
        senderUserId: m.from === "agent" ? support.id : null,
        body: m.text,
        templateName: m.template ?? null,
        status: m.from === "c" ? "RECEIVED" : m.minsAgo > 30 ? "READ" : "DELIVERED",
        aiMeta: m.from === "ai" ? { intent: "AUTO" } : undefined,
        createdAt: new Date(NOW.getTime() - m.minsAgo * 60_000),
      })),
    });
    return c;
  };
  usedHandles.add(customers[0].phone);
  const pendingOrders = orders.filter((o) => o.status === "PENDING_CONFIRMATION" && o.customerId !== customers[0].id);
  const seenPending = new Set<string>();
  for (const o of pendingOrders) {
    if (seenPending.has(o.customerId as string) || seenPending.size >= 6) continue;
    seenPending.add(o.customerId as string);
    const cust = customers.find((c) => c.id === o.customerId)!;
    const mins = Math.max(5, Math.round((NOW.getTime() - (o.placedAt as Date).getTime()) / 60_000) - 2);
    await conv(cust, "WHATSAPP", cust.name, cust.phone, [{ from: "sys", template: "order_confirmation", text: `Assalam o Alaikum ${cust.name.split(" ")[0]}! Thank you for your order ${o.name} of Rs. ${(o.total / 100).toLocaleString("en-PK")} from Urban Threads. Please reply YES to confirm or NO to cancel.`, minsAgo: mins }], { orderId: o.id as string });
  }
  const m0 = customers[0];
  await conv(m0, "WHATSAPP", m0.name, m0.phone, [
    { from: "c", text: "Bhai black shirt available hai?", minsAgo: 42 },
    { from: "ai", text: "Ji haan, Premium Black Shirt available hai! Sizes: S, M, L, XL. Price: Rs. 3,990. Kaunsa size chahiye?", minsAgo: 41 },
    { from: "c", text: "XL chahiye. Aur tracksuit bhi?", minsAgo: 35 },
    { from: "ai", text: "Ji haan! Premium Black Shirt size XL available hai — sirf 6 pieces bache hain. Black Tracksuit XL bhi available hai (6 left), Rs. 6,490. Order karna chahenge?", minsAgo: 34 },
    { from: "c", text: "Haan dono bhej do, COD", minsAgo: 30 },
    { from: "ai", text: "Zabardast! Main aap ka order bana raha hoon. Aap ko confirmation message thori der mein mil jayega ✅", minsAgo: 29 },
  ]);
  const scripted: [string, Msg[], Partial<Prisma.ConversationUncheckedCreateInput>?][] = [
    ["status", [{ from: "c", text: "Mera order kahan hai? 3 din ho gaye", minsAgo: 95 }, { from: "ai", text: "Aap ka order dispatch ho chuka hai. Tracking number: DX8K2F1A42. Usually 2–4 working days mein deliver ho jata hai.", minsAgo: 94 }, { from: "c", text: "Shukriya", minsAgo: 80 }, { from: "ai", text: "Aap ka bohat shukriya! Kuch aur chahiye ho to zaroor batayein. 😊", minsAgo: 79 }]],
    ["exchange", [{ from: "c", text: "Assalam o alaikum, I received size L but it's tight. Can I exchange for XL? It's been 9 days but I was travelling", minsAgo: 18 }, { from: "ai", text: "I'm connecting you with a member of our team — they'll reply shortly.", minsAgo: 17 }], { needsAttention: true, attentionReason: "Customer requested a special exchange exception (outside the 7-day window).", aiConfidence: 0.42 }],
    ["price", [{ from: "c", text: "What's the price of the puffer jacket?", minsAgo: 220 }, { from: "ai", text: "Puffer Jacket — Black is Rs. 9,990. Available sizes: S, M, L, XL, XXL.", minsAgo: 219 }]],
    ["delivery", [{ from: "c", text: "Delivery kitne din mein hogi Multan?", minsAgo: 300 }, { from: "ai", text: "We deliver nationwide in 2–4 working days (major cities) and 4–6 days elsewhere. Delivery is Rs. 200, free on orders above Rs. 5,000. Cash on delivery is available everywhere.", minsAgo: 299 }]],
    ["complaint", [{ from: "c", text: "Bohat bakwas service, parcel damaged aya hai. Stitching khuli hui hai", minsAgo: 64 }, { from: "ai", text: "Main aap ko hamari team ke member se connect kar raha hoon, woh jald reply karenge.", minsAgo: 63 }, { from: "agent", text: "Assalam o Alaikum, I'm really sorry about this. Could you send a picture of the damage? We'll arrange a free replacement right away.", minsAgo: 40 }, { from: "c", text: "[Image]", minsAgo: 31 }], { handler: "HUMAN", assignedToId: support.id }],
    ["available", [{ from: "c", text: "Is the Oxford shirt available in XL?", minsAgo: 1500 }, { from: "ai", text: "Yes! Oxford Shirt — Sky Blue in size XL is available. Price: Rs. 3,290. Would you like to order?", minsAgo: 1499 }]],
    ["human", [{ from: "c", text: "Can I talk to a real person please? I want to place a bulk order for my office (25 shirts)", minsAgo: 9 }, { from: "ai", text: "I'm connecting you with a member of our team — they'll reply shortly.", minsAgo: 8 }], { needsAttention: true, attentionReason: "Customer asked to speak to a person (bulk order of 25 shirts).", aiConfidence: 0.9 }],
  ];
  for (const [, msgs, extra] of scripted) {
    const cust = freeCustomer();
    await conv(cust, "WHATSAPP", cust.name, cust.phone, msgs, extra);
  }
  // A few resolved historical threads
  for (let i = 0; i < 14; i++) {
    const cust = freeCustomer();
    const ago = int(1500, 60000);
    await conv(cust, "WHATSAPP", cust.name, cust.phone, [
      { from: "c", text: pick(["Yes", "Han ji confirm", "Confirm", "ji haan"]), minsAgo: ago },
      { from: "ai", text: "Thank you! Your order is confirmed ✅ We'll dispatch it soon and share tracking details.", minsAgo: ago - 1 },
    ], { status: "RESOLVED" });
  }
  await conv(null, "FACEBOOK", "Rizwan Haider", "fb_psid_5822001", [{ from: "c", text: "Do you have this jacket in brown?", minsAgo: 140 }, { from: "ai", text: "Yes! Leather Jacket — Brown is available in M, L and XL for Rs. 18,990.", minsAgo: 139 }]);
  await conv(null, "FACEBOOK", "Kamran Yousaf", "fb_psid_5822002", [{ from: "c", text: "Price?", minsAgo: 26 }]);
  await conv(null, "INSTAGRAM", "zara.khan_", "ig_scoped_771201", [{ from: "c", text: "Is the black tracksuit available in M? 😍", minsAgo: 55 }, { from: "ai", text: "Yes, Black Tracksuit is available in M! Price: Rs. 6,490. Would you like to order?", minsAgo: 54 }]);
  await conv(null, "INSTAGRAM", "hamza.styles", "ig_scoped_771202", [{ from: "c", text: "Collab? I'm a fashion creator with 40k followers", minsAgo: 400 }], { needsAttention: true, attentionReason: "Partnership request — needs the marketing team.", aiConfidence: 0.3 });
  console.log("  ✓ conversations");

  // Tags
  const tagVip = await db.conversationTag.create({ data: { storeId, name: "VIP", color: "violet" } });
  const tagExchange = await db.conversationTag.create({ data: { storeId, name: "Exchange", color: "amber" } });
  await db.conversationTag.create({ data: { storeId, name: "Bulk order", color: "emerald" } });
  const m0conv = await db.conversation.findFirst({ where: { storeId, contactHandle: m0.phone } });
  if (m0conv) await db.conversation.update({ where: { id: m0conv.id }, data: { tags: { connect: [{ id: tagVip.id }] } } });
  const exConv = await db.conversation.findFirst({ where: { storeId, attentionReason: { contains: "exchange" } } });
  if (exConv) await db.conversation.update({ where: { id: exConv.id }, data: { tags: { connect: [{ id: tagExchange.id }] } } });

  // ───────────── Tickets ─────────────
  const ticketDefs = [
    { subject: "Exchange request — size L to XL (outside window)", category: "EXCHANGE", priority: "MEDIUM", status: "OPEN" },
    { subject: "Damaged parcel — stitching open", category: "PRODUCT", priority: "HIGH", status: "IN_PROGRESS" },
    { subject: "Bulk order inquiry — 25 office shirts", category: "OTHER", priority: "HIGH", status: "OPEN" },
    { subject: "Refund not received for returned order", category: "PAYMENT", priority: "URGENT", status: "OPEN" },
    { subject: "Wrong colour delivered", category: "PRODUCT", priority: "MEDIUM", status: "WAITING_ON_CUSTOMER" },
    { subject: "Delivery delayed to Peshawar", category: "DELIVERY", priority: "LOW", status: "RESOLVED" },
    { subject: "Manual review: customer did not confirm COD order", category: "OTHER", priority: "HIGH", status: "OPEN" },
  ] as const;
  for (const [i, t] of ticketDefs.entries()) {
    const cust = customers[i + 4];
    const order = orders.find((o) => o.customerId === cust.id);
    await db.supportTicket.create({ data: { storeId, number: 1001 + i, subject: t.subject, category: t.category, priority: t.priority, status: t.status, customerId: cust.id, orderId: (order?.id as string) ?? null, assignedToId: i % 2 ? support.id : null, createdByType: i < 3 ? "AI" : "USER", createdAt: new Date(NOW.getTime() - int(1, 72) * 3_600_000), resolvedAt: t.status === "RESOLVED" ? new Date() : null } });
  }

  // ───────────── Social: leads & comments ─────────────
  const leadNames = ["Tariq Mehmood", "Shoaib Akhtar", "Nadia Hussain", "Imran Ali", "Waleed Khan", "Rabia Noor", "Fawad Ahmed", "Yasir Iqbal", "Saima Bukhari", "Ahsan Raza", "Hina Pervaiz", "Omer Shah", "Javeria Saeed", "Kamil Butt", "Laiba Aslam"];
  await db.metaLead.createMany({
    data: leadNames.map((n, i) => ({ storeId, externalId: `lead_${880000 + i}`, platform: i % 3 === 0 ? "INSTAGRAM" : "FACEBOOK", formName: i % 2 ? "Winter Collection — Early Access" : "WhatsApp Catalogue Request", name: n, phone: `923${int(0, 4)}${int(10000000, 99999999)}`, email: rand() < 0.5 ? `${n.toLowerCase().replace(/\s/g, ".")}@gmail.com` : null, city: weighted(CITIES), status: i < 6 ? "NEW" : pick(["CONTACTED", "CONVERTED", "LOST", "CONTACTED"]), createdAt: new Date(NOW.getTime() - int(1, 240) * 3_600_000) })),
  });
  const commentBodies: [string, string, string][] = [
    ["Price please?", "NEUTRAL", "PRICE_QUESTION"],
    ["Available in XL?", "NEUTRAL", "AVAILABILITY"],
    ["Bought last month, quality is amazing 🔥", "POSITIVE", "PRAISE"],
    ["Delivery to Quetta?", "NEUTRAL", "OTHER"],
    ["Ordered 10 days ago still not received!!", "NEGATIVE", "COMPLAINT"],
    ["Need this in navy", "NEUTRAL", "AVAILABILITY"],
    ["😍😍 want this", "POSITIVE", "PRAISE"],
    ["Is COD available?", "NEUTRAL", "OTHER"],
    ["Fabric kaisa hai?", "NEUTRAL", "OTHER"],
    ["Overpriced honestly", "NEGATIVE", "COMPLAINT"],
  ];
  await db.socialComment.createMany({
    data: Array.from({ length: 24 }, (_, i) => {
      const [body, sentiment, intent] = commentBodies[i % commentBodies.length];
      return { storeId, externalId: `cmt_${990000 + i}`, platform: i % 2 ? "INSTAGRAM" : "FACEBOOK", postId: `post_${i % 4}`, postCaption: ["New Winter Drop ❄️", "Premium Shirts restocked", "Tracksuit season is here", "Polo clearance sale"][i % 4], authorName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`, body, sentiment, intent, replied: i > 9 && rand() < 0.7, replyBody: null, createdAt: new Date(NOW.getTime() - int(1, 120) * 3_600_000) };
    }),
  });

  // ───────────── Marketing ─────────────
  await recomputeAllSegments(storeId);
  const segVip = await db.customerSegment.findUniqueOrThrow({ where: { storeId_key: { storeId, key: "vip" } } });
  const segInactive = await db.customerSegment.findUniqueOrThrow({ where: { storeId_key: { storeId, key: "inactive" } } });
  const segShirt = await db.customerSegment.findUniqueOrThrow({ where: { storeId_key: { storeId, key: "shirt_buyers" } } });
  await db.marketingCampaign.createMany({
    data: [
      { storeId, name: "VIP Early Access — Winter Drop", segmentId: segVip.id, channel: "WHATSAPP", status: "SENT", message: "Hi {{name}}! As one of our VIPs, you get 24h early access to the Winter Collection ❄️", audienceSize: segVip.customerCount, sentCount: segVip.customerCount, deliveredCount: segVip.customerCount, readCount: Math.round(segVip.customerCount * 0.86), conversions: Math.round(segVip.customerCount * 0.32), revenue: minor(Math.round(segVip.customerCount * 0.32 * 8900)), sentAt: at(12, 18), createdById: users[4].id, createdAt: at(12, 15) },
      { storeId, name: "Shirt buyers — New Oxford colours", segmentId: segShirt.id, channel: "WHATSAPP", status: "SENT", message: "Hi {{name}}, our Oxford shirts now come in Pink & Grey. Same perfect fit 👔", audienceSize: segShirt.customerCount, sentCount: segShirt.customerCount, deliveredCount: Math.round(segShirt.customerCount * 0.97), readCount: Math.round(segShirt.customerCount * 0.78), conversions: Math.round(segShirt.customerCount * 0.08), revenue: minor(Math.round(segShirt.customerCount * 0.08 * 4100)), sentAt: at(26, 19), createdById: users[4].id, createdAt: at(27, 11) },
      { storeId, name: "Win-back — We miss you", segmentId: segInactive.id, channel: "WHATSAPP", status: "DRAFT", message: "Hi {{name}}! We miss you at Urban Threads 💙 Use code COMEBACK15 for 15% off this week.", audienceSize: segInactive.customerCount, createdById: users[4].id, createdAt: at(1, 11) },
    ],
  });
  await db.promotion.createMany({
    data: [
      { storeId, name: "Winter Launch 10%", code: "WINTER10", type: "PERCENTAGE", value: 10, usageCount: 64, startsAt: at(20, 0), endsAt: at(-10, 0) },
      { storeId, name: "Free delivery weekend", code: "FREESHIP", type: "FREE_SHIPPING", value: 0, minSubtotal: minor(3000), usageCount: 112, startsAt: at(45, 0), endsAt: at(38, 0), active: false },
      { storeId, name: "Win-back 15%", code: "COMEBACK15", type: "PERCENTAGE", value: 15, usageCount: 3, usageLimit: 200, startsAt: at(2, 0), endsAt: at(-28, 0) },
    ],
  });

  // ───────────── Showcase: a fresh high-risk COD order through the real pipeline ─────────────
  const riskyCustomer = [...history.entries()].filter(([id]) => customers.find((c) => c.id === id)?.persona === "risky").sort((a, b) => b[1].cancelled - a[1].cancelled)[0];
  if (riskyCustomer) {
    const rc = customers.find((c) => c.id === riskyCustomer[0])!;
    const { ingestOrder } = await import("../src/services/order.service");
    const puffer = variants.find((v) => v.product.title === "Puffer Jacket — Black" && v.size === "L")!;
    const leather = variants.find((v) => v.product.title === "Leather Jacket — Brown" && v.size === "XL")!;
    await ingestOrder(
      storeId,
      {
        externalId: `${5000000000 + orderNumber + 1}`,
        orderNumber: orderNumber + 1,
        name: `#${orderNumber + 1}`,
        currency: "PKR",
        email: null,
        phone: rc.phone,
        customerName: rc.name,
        customerExternalId: null,
        city: "Karachi",
        shippingAddress: { address1: "Near market", city: "Karachi", country: "Pakistan" },
        subtotal: puffer.price + leather.price,
        shippingTotal: 0,
        discountTotal: 0,
        total: puffer.price + leather.price,
        paymentMethod: "COD",
        paymentStatus: "PENDING",
        tags: [],
        note: null,
        source: "instagram",
        placedAt: new Date(NOW.getTime() - 25 * 60_000),
        cancelledAt: null,
        cancelReason: null,
        items: [
          { externalProductId: null, externalVariantId: String(variantRows.find((r) => r.id === puffer.id)!.externalId), title: puffer.product.title, variantTitle: puffer.title, sku: null, quantity: 1, unitPrice: puffer.price },
          { externalProductId: null, externalVariantId: String(variantRows.find((r) => r.id === leather.id)!.externalId), title: leather.product.title, variantTitle: leather.title, sku: null, quantity: 1, unitPrice: leather.price },
        ],
      },
      { source: "demo" },
    );
  }

  // ───────────── AI history ─────────────
  const agents = await db.aIAgent.findMany({ where: { storeId } });
  const agentId = (k: string) => agents.find((a) => a.key === k)!.id;
  const taskTemplates: [string, string, string][] = [
    ["ORDER", "order.risk", "Analyzed risk for order #"],
    ["ORDER", "order.confirmation", "Sent COD confirmation for #"],
    ["WHATSAPP", "whatsapp.reply", "Answered product question from "],
    ["WHATSAPP", "whatsapp.reply", "Confirmed order for "],
    ["WHATSAPP", "whatsapp.reply", "Shared tracking with "],
    ["INVENTORY", "inventory.analyze", "Detected low stock on "],
    ["ADS", "ads.analyze", "Reviewed 7-day performance of "],
    ["BUSINESS", "assistant.answer", "Answered: “"],
    ["SUPPORT", "ticket.triage", "Opened ticket for "],
    ["MARKETING", "segment.compute", "Refreshed segment "],
  ];
  const taskRows: Prisma.AITaskCreateManyInput[] = [];
  for (let i = 0; i < 220; i++) {
    const [key, type, prefix] = pick(taskTemplates);
    const subject = type.startsWith("order") ? String(int(10300, orderNumber)) : type === "ads.analyze" ? pick(campaignDefs).name : type === "inventory.analyze" ? pick(["Black Tracksuit XL", "Premium Black Shirt XL", "Puffer Jacket — Black XXL"]) : type === "assistant.answer" ? `${pick(["Which products sold the most this month?", "Show pending COD orders", "Why did revenue drop yesterday?"])}”` : type === "segment.compute" ? pick(["VIP Customers", "Inactive Customers"]) : pick(customers).name;
    const failed = rand() < 0.03;
    const when = new Date(NOW.getTime() - Math.pow(rand(), 1.6) * 30 * DAY);
    taskRows.push({ storeId, agentId: agentId(key), type, title: `${prefix}${subject}`, status: failed ? "FAILED" : "SUCCEEDED", error: failed ? "Provider timeout — retried" : null, provider: "local", model: "commerceai-rules-v1", durationMs: int(120, 2400), createdAt: when, completedAt: when });
  }
  await db.aITask.createMany({ data: taskRows });
  for (const a of agents) await db.aIAgent.update({ where: { id: a.id }, data: { lastActiveAt: new Date(NOW.getTime() - int(1, 90) * 60_000) } });
  await recordAITask(storeId, "ORDER", { type: "order.confirmation", title: "Order Agent confirmed #10452", relatedType: "order", relatedId: (orders.find((o) => o.orderNumber === 10452)?.id as string) ?? undefined });

  // Pending approvals (realistic mix)
  const highRisk = await db.order.findFirst({ where: { storeId, riskLevel: "HIGH", status: { in: ["NEW", "PENDING_CONFIRMATION"] } }, orderBy: { placedAt: "desc" } });
  if (highRisk) {
    const signals = (highRisk.riskSignals as unknown as { signals: { label: string; detail: string; points: number }[] }).signals.filter((s) => s.points > 0).slice(0, 4);
    await createDecision(storeId, { agentKey: "ORDER", title: `High-risk COD order ${highRisk.name}`, summary: `Order ${highRisk.name} from ${highRisk.customerName} scored ${highRisk.riskScore}/100.`, reasoning: "High-risk orders are more likely to be refused at the door. Request WhatsApp confirmation before dispatch.", evidence: signals.map((s) => ({ label: s.label, value: s.detail, points: s.points })), action: "requestOrderConfirmation", actionInput: { orderId: highRisk.id }, expectedImpact: "Reduces failed deliveries and return shipping costs.", riskLevel: "MEDIUM", requiresApproval: true, relatedType: "order", relatedId: highRisk.id });
  }
  const returned = await db.order.findFirst({ where: { storeId, status: "RETURNED", paymentMethod: "CARD" } }) ?? (await db.order.findFirst({ where: { storeId, status: "RETURNED" } }));
  if (returned) {
    await createDecision(storeId, { agentKey: "SUPPORT", title: `Refund Rs. ${(returned.total / 100).toLocaleString("en-PK")} on ${returned.name}`, summary: `${returned.customerName}'s return was received at the warehouse in good condition.`, reasoning: "Return is within the 7-day policy and the item passed inspection.", evidence: [{ label: "Return reason", value: "Size too small" }, { label: "Policy window", value: "Returned on day 5 of 7" }, { label: "Customer history", value: "No previous returns" }], action: "refundOrder", actionInput: { orderId: returned.id, amountMajor: returned.total / 100, reason: "Return received — size too small" }, expectedImpact: "Keeps a repeat customer happy; refund is due under policy.", riskLevel: "HIGH", requiresApproval: true, relatedType: "order", relatedId: returned.id });
  }
  const shirtVariant = await db.productVariant.findFirst({ where: { storeId, product: { title: "Premium Maroon Shirt" }, size: "M" } });
  if (shirtVariant) {
    await createDecision(storeId, { agentKey: "INVENTORY", title: "Lower Premium Maroon Shirt to Rs. 3,490", summary: "Slow seller with 30+ days of stock across sizes.", reasoning: "Maroon sells at a third of the black shirt's velocity; a modest markdown should clear stock before winter.", evidence: [{ label: "30-day units", value: "9" }, { label: "Stock", value: `${shirtVariant.inventoryQuantity} in size M` }, { label: "Black shirt velocity", value: "3.1× higher" }], action: "changeProductPrice", actionInput: { variantId: shirtVariant.id, priceMajor: 3490 }, expectedImpact: "≈ 2× sell-through at −12.5% price.", riskLevel: "MEDIUM", requiresApproval: true, relatedType: "product", relatedId: shirtVariant.productId });
  }
  const { recommendWinbackCampaign } = await import("../src/services/marketing.service");
  await recommendWinbackCampaign(storeId);
  console.log("  ✓ AI tasks & approvals");

  // ───────────── Automation run history ─────────────
  const automations = await db.automation.findMany({ where: { storeId } });
  const runRows: Prisma.AutomationRunCreateManyInput[] = [];
  for (const a of automations) {
    const n = a.templateKey === "cod-confirmation" ? 60 : a.templateKey === "delivery-notification" ? 40 : a.templateKey === "review-request" ? 25 : 8;
    for (let i = 0; i < n; i++) {
      const started = new Date(NOW.getTime() - Math.pow(rand(), 1.3) * 25 * DAY);
      const status = rand() < 0.04 ? "FAILED" : started.getTime() > NOW.getTime() - 2 * 3_600_000 && a.templateKey === "cod-confirmation" ? "WAITING" : "COMPLETED";
      runRows.push({ storeId, automationId: a.id, status, triggerEvent: a.triggerType, dedupeKey: `seed:${a.id}:${i}`, context: { event: { type: a.triggerType, payload: {} }, vars: {} }, steps: [{ nodeKey: "trigger", type: "TRIGGER", label: "Trigger", at: started.toISOString(), outcome: "triggered" }], error: status === "FAILED" ? "Send WhatsApp confirmation: Customer has no valid WhatsApp number" : null, startedAt: started, finishedAt: status === "COMPLETED" || status === "FAILED" ? new Date(started.getTime() + 2000) : null, resumeAt: status === "WAITING" ? new Date(started.getTime() + 2 * 3_600_000) : null, currentNodeKey: status === "WAITING" ? "wait_2h" : null });
    }
    await db.automation.update({ where: { id: a.id }, data: { runCount: n, lastRunAt: new Date(NOW.getTime() - int(2, 120) * 60_000) } });
  }
  await db.automationRun.createMany({ data: runRows });
  // Seed "waiting" runs must not resume against empty payloads.
  await db.automationRun.updateMany({ where: { storeId, status: "WAITING" }, data: { status: "COMPLETED", finishedAt: new Date(), resumeAt: null } });

  // ───────────── Activity feed, notifications, audit ─────────────
  const recentOrders = await db.order.findMany({ where: { storeId }, orderBy: { placedAt: "desc" }, take: 40 });
  const feed: Prisma.DomainEventCreateManyInput[] = [];
  for (const o of recentOrders) {
    feed.push({ storeId, type: "ORDER_CREATED", title: `New order ${o.name} · Rs. ${(o.total / 100).toLocaleString("en-PK")}`, tone: "success", href: `/orders/${o.id}`, payload: { orderId: o.id }, createdAt: o.placedAt });
    if (o.confirmedAt) feed.push({ storeId, type: "ORDER_CONFIRMED", title: `Order ${o.name} confirmed`, tone: "success", href: `/orders/${o.id}`, payload: { orderId: o.id }, createdAt: o.confirmedAt });
    if (o.shippedAt) feed.push({ storeId, type: "ORDER_FULFILLED", title: `Order ${o.name} shipped`, tone: "info", href: `/orders/${o.id}`, payload: { orderId: o.id }, createdAt: o.shippedAt });
    if (o.riskLevel === "HIGH") feed.push({ storeId, type: "ORDER_HIGH_RISK", title: `High-risk COD order ${o.name} detected`, tone: "danger", href: `/orders/${o.id}`, payload: { orderId: o.id }, createdAt: new Date(o.placedAt.getTime() + 60_000) });
  }
  feed.push({ storeId, type: "CUSTOMER_MESSAGE_RECEIVED", title: "WhatsApp message sent to Muhammad Ali", tone: "ai", href: "/conversations", payload: {}, createdAt: new Date(NOW.getTime() - 29 * 60_000) });
  feed.push({ storeId, type: "HUMAN_HANDOFF_REQUESTED", title: "Customer requested exchange", tone: "warning", href: "/conversations?filter=attention", payload: {}, createdAt: new Date(NOW.getTime() - 17 * 60_000) });
  await db.domainEvent.createMany({ data: feed.filter((f) => (f.createdAt as Date) <= NOW) });

  const notifDefs: [string, string, "ORDER" | "INVENTORY" | "WHATSAPP" | "ADS" | "AUTOMATION" | "AI" | "SYSTEM" | "CUSTOMER", "INFO" | "WARNING" | "CRITICAL" | "SUCCESS", string, number][] = [
    ["High-risk order detected", "Risk score 78/100 — phone used under 3 names", "ORDER", "WARNING", "/orders?tab=high_risk", 12],
    ["Black Tracksuit XL is low on stock", "6 units left · ~1.6 days of coverage", "INVENTORY", "WARNING", "/inventory?status=low", 35],
    ["Customer needs a human", "Exchange request outside the 7-day window", "WHATSAPP", "WARNING", "/conversations?filter=attention", 17],
    ["Approval needed: Increase Winter Collection budget", "ROAS 5.9× vs 4.1× account average", "AI", "INFO", "/approvals", 50],
    ["Daily report is ready", "Yesterday: revenue and orders summary", "AI", "INFO", "/reports/daily", 600],
    ["Polo Summer Clearance is underperforming", "1.05× ROAS over 7 days", "ADS", "WARNING", "/ads", 180],
    ["Automation failed: COD order confirmation", "Customer has no valid WhatsApp number", "AUTOMATION", "WARNING", "/automations", 900],
    ["New VIP customer", "Muhammad Ali crossed Rs. 40,000 lifetime spend", "CUSTOMER", "SUCCESS", "/customers?segment=vip", 1400],
    ["Shopify sync completed", "Products and inventory are up to date", "SYSTEM", "SUCCESS", "/integrations", 9],
  ];
  for (const u of users) {
    await db.notification.createMany({
      data: notifDefs.map(([title, body, type, severity, href, mins], i) => ({ storeId, userId: u.id, title, body, type, severity, href, createdAt: new Date(NOW.getTime() - mins * 60_000), readAt: i > 4 ? new Date() : null })),
    });
  }
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  for (const o of recentOrders.slice(0, 25)) {
    if (o.confirmedAt) auditRows.push({ storeId, actorType: "AI", actorName: "WhatsApp Agent", action: "order.confirm", resourceType: "order", resourceId: o.id, resourceLabel: o.name, oldValue: { status: "PENDING_CONFIRMATION" }, newValue: { status: "CONFIRMED" }, reason: 'Customer replied "Yes"', createdAt: o.confirmedAt });
    if (o.status === "PROCESSING") auditRows.push({ storeId, actorType: "USER", actorId: users[2].id, actorName: users[2].name, action: "order.process", resourceType: "order", resourceId: o.id, resourceLabel: o.name, oldValue: { status: "CONFIRMED" }, newValue: { status: "PROCESSING" }, ip: "39.45.120.18", userAgent: "Mozilla/5.0 (Macintosh)", createdAt: new Date(o.placedAt.getTime() + 5 * 3_600_000) });
  }
  auditRows.push({ storeId, actorType: "USER", actorId: owner.id, actorName: owner.name, action: "settings.approvals", resourceType: "store", resourceId: storeId, oldValue: { adBudgetChangePercent: 30 }, newValue: { adBudgetChangePercent: 20 }, ip: "39.45.120.18", createdAt: new Date(NOW.getTime() - 3 * DAY) });
  auditRows.push({ storeId, actorType: "USER", actorId: users[1].id, actorName: users[1].name, action: "ai.agent.update", resourceType: "ai_agent", resourceLabel: "WhatsApp Agent", oldValue: { autonomy: "APPROVAL_REQUIRED" }, newValue: { autonomy: "AUTONOMOUS" }, createdAt: new Date(NOW.getTime() - 6 * DAY) });
  await db.auditLog.createMany({ data: auditRows.filter((a) => (a.createdAt as Date) <= NOW) });

  // ───────────── Derived AI output ─────────────
  await generateInsights(storeId);
  for (let d = 7; d >= 1; d--) await generateDailyReport(storeId, dayKey(new Date(TODAY.getTime() - d * DAY + 12 * 3_600_000), TZ));
  // Mark the generated decisions/notifications from analysis as unread for the owner only.
  console.log("  ✓ insights, approvals, daily reports");

  const counts = await Promise.all([db.order.count({ where: { storeId } }), db.customer.count({ where: { storeId } }), db.product.count({ where: { storeId } }), db.aIDecision.count({ where: { storeId, status: "PENDING_APPROVAL" } })]);
  console.log(`\n✅ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${counts[0]} orders · ${counts[1]} customers · ${counts[2]} products · ${counts[3]} pending approvals`);
  console.log(`   Login: ${owner.email} / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    const { getRedis } = await import("../src/lib/redis");
    getRedis()?.disconnect();
  });
