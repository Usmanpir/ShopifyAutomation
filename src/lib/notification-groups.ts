/**
 * Smart notification grouping (browser-safe): Urgent / Important / Info, with
 * similar notifications ("Low stock: A", "Low stock: B"…) collapsed into one.
 */
export type NotificationLike = { id: string; type: string; severity: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string };
export type Priority = "urgent" | "important" | "info";
export type NotificationGroup<T extends NotificationLike = NotificationLike> = {
  key: string;
  priority: Priority;
  title: string;
  /** "12 products", "3 orders"… when collapsed. */
  countLabel: string | null;
  items: T[];
  unread: number;
  latest: string;
  href: string | null;
};

export function priorityOf(n: Pick<NotificationLike, "type" | "severity" | "title">): Priority {
  if (n.severity === "CRITICAL") return "urgent";
  if (n.severity === "WARNING" && (n.type === "ORDER" || n.type === "WHATSAPP")) return "urgent";
  if (n.severity === "WARNING" || /approval needed|needs your approval/i.test(n.title)) return "important";
  return "info";
}

const NOUN: Record<string, [string, string]> = {
  INVENTORY: ["product", "products"],
  AUTOMATION: ["item", "items"],
  ORDER: ["order", "orders"],
  WHATSAPP: ["customer", "customers"],
  CUSTOMER: ["customer", "customers"],
  ADS: ["campaign", "campaigns"],
  AI: ["item", "items"],
  SYSTEM: ["item", "items"],
};

/** Family = the part of the title before the specific subject. */
export function familyOf(title: string): string {
  const t = title.trim();
  const colon = t.indexOf(":");
  if (colon > 2 && colon < 40) return t.slice(0, colon).trim();
  const lowStock = t.match(/^(.*) is low on stock$/i);
  if (lowStock) return "Low stock";
  const needs = t.match(/^(.+?) needs a human$/i);
  if (needs) return "Customers need a human";
  const hash = t.search(/#\d+/);
  if (hash > 2) return t.slice(0, hash).trim();
  return t;
}

const LABEL: Record<string, string> = { "Customers need a human": "Customers waiting for a person", "Low stock": "Low stock" };

export function groupNotifications<T extends NotificationLike>(items: T[]): Record<Priority, NotificationGroup<T>[]> {
  const map = new Map<string, NotificationGroup<T>>();
  for (const n of items) {
    const fam = familyOf(n.title);
    const priority = priorityOf(n);
    const key = `${priority}|${n.type}|${fam}`;
    const g = map.get(key) ?? { key, priority, title: n.title, countLabel: null, items: [], unread: 0, latest: n.createdAt, href: n.href };
    g.items.push(n);
    if (!n.readAt) g.unread++;
    if (n.createdAt > g.latest) g.latest = n.createdAt;
    map.set(key, g);
  }
  const out: Record<Priority, NotificationGroup<T>[]> = { urgent: [], important: [], info: [] };
  for (const g of map.values()) {
    if (g.items.length > 1) {
      const fam = familyOf(g.items[0]!.title);
      const distinct = new Set(g.items.map((i) => i.title)).size;
      const [one, many] = NOUN[g.items[0]!.type] ?? ["item", "items"];
      g.title = LABEL[fam] ?? fam;
      g.countLabel = distinct > 1 ? `${distinct} ${distinct === 1 ? one : many}` : `${g.items.length} times`;
      // A collapsed group links to the list page for that type rather than one item.
      g.href = distinct > 1 ? null : g.items[0]!.href;
    }
    out[g.priority].push(g);
  }
  for (const p of Object.keys(out) as Priority[]) out[p].sort((a, b) => (a.latest < b.latest ? 1 : -1));
  return out;
}

export const PRIORITY_LABEL: Record<Priority, string> = { urgent: "Urgent", important: "Important", info: "For your information" };
