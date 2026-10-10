import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { parseStoreSettings, type StoreSettings } from "@/schemas/store-settings";

export type StoreInfo = {
  id: string;
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  demoMode: boolean;
  settings: StoreSettings;
};

/** Loads a store with typed settings. Used by services running outside a request (workers, tools). */
export async function getStore(storeId: string): Promise<StoreInfo> {
  const s = await db.store.findUnique({ where: { id: storeId } });
  if (!s) throw notFound("Store");
  return {
    id: s.id,
    name: s.name,
    currency: s.currency,
    locale: s.locale,
    timezone: s.timezone,
    demoMode: s.demoMode,
    settings: parseStoreSettings(s.settings),
  };
}

export async function listStoreIds(): Promise<{ id: string; timezone: string; settings: StoreSettings; demoMode: boolean }[]> {
  const stores = await db.store.findMany({ select: { id: true, timezone: true, settings: true, demoMode: true } });
  return stores.map((s) => ({ ...s, settings: parseStoreSettings(s.settings) }));
}
