import type { ActorType, Role } from "@/generated/prisma/enums";
import type { AuthContext } from "@/lib/auth/session";

/**
 * Framework-independent context passed to every service call. Services run in
 * route handlers, server components, background workers and AI tools alike.
 */
export type Actor = {
  type: ActorType;
  id?: string | null;
  name: string;
  role?: Role;
  ip?: string | null;
  userAgent?: string | null;
};

export type ServiceContext = {
  storeId: string;
  actor: Actor;
};

export function contextFromAuth(auth: AuthContext, meta?: { ip?: string | null; userAgent?: string | null }): ServiceContext {
  return {
    storeId: auth.store.id,
    actor: {
      type: "USER",
      id: auth.user.id,
      name: auth.user.name,
      role: auth.role,
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    },
  };
}

export const systemContext = (storeId: string, name = "System"): ServiceContext => ({
  storeId,
  actor: { type: "SYSTEM", name },
});

export const aiContext = (storeId: string, agentName: string, agentId?: string): ServiceContext => ({
  storeId,
  actor: { type: "AI", name: agentName, id: agentId ?? null },
});
