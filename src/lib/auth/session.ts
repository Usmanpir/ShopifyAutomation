import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { can, type Permission } from "@/lib/rbac";
import { parseStoreSettings, type StoreSettings } from "@/schemas/store-settings";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000; // extend at most once a day

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-cai_session" : "cai_session";

export type AuthContext = {
  sessionId: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null; twoFactorEnabled: boolean };
  store: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    currency: string;
    locale: string;
    timezone: string;
    demoMode: boolean;
    onboardingCompleted: boolean;
    settings: StoreSettings;
  };
  role: Role;
};

export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function createSession(userId: string, storeId: string | null) {
  const token = randomToken(32);
  const meta = await requestMeta();
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      storeId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Resolves the current session. Memoized per request. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { memberships: { include: { store: true }, orderBy: { createdAt: "asc" } } } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.deletedAt) return null;

  const membership =
    session.user.memberships.find((m) => m.storeId === session.storeId) ?? session.user.memberships[0];
  if (!membership) return null;

  if (Date.now() - session.lastSeenAt.getTime() > SESSION_REFRESH_MS) {
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
  }

  const store = membership.store;
  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      avatarUrl: session.user.avatarUrl,
      twoFactorEnabled: session.user.twoFactorEnabled,
    },
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      logoUrl: store.logoUrl,
      currency: store.currency,
      locale: store.locale,
      timezone: store.timezone,
      demoMode: store.demoMode,
      onboardingCompleted: store.onboardingCompleted,
      settings: parseStoreSettings(store.settings),
    },
    role: membership.role,
  };
});

/** For Server Components / pages: redirects to login when unauthenticated. */
export async function requireAuth(permission?: Permission): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (permission && !can(auth.role, permission)) redirect("/dashboard?denied=" + encodeURIComponent(permission));
  return auth;
}
