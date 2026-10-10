import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { brand } from "@/config/brand";
import { audit } from "@/lib/audit";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/auth/totp";
import { decrypt, encrypt, randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { AppError, badRequest, conflict, forbidden, notFound, tooManyRequests } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { canAssignRole } from "@/lib/rbac";
import type { ServiceContext } from "@/lib/service-context";
import { bootstrapStore } from "./bootstrap.service";

export { changePasswordSchema, loginSchema, registerSchema } from "@/schemas/auth";
import { changePasswordSchema, loginSchema, registerSchema } from "@/schemas/auth";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "store";
}

export async function register(input: z.infer<typeof registerSchema>, ip: string | null) {
  const rl = await rateLimit(`register:${ip ?? "unknown"}`, 5, 3600);
  if (!rl.allowed) throw tooManyRequests(rl.retryAfter);
  const exists = await db.user.findUnique({ where: { email: input.email } });
  if (exists) throw conflict("An account with this email already exists");

  let slug = slugify(input.storeName);
  if (await db.store.findUnique({ where: { slug } })) slug = `${slug}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;

  const user = await db.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      memberships: { create: { role: "OWNER", store: { create: { name: input.storeName, slug, demoMode: true } } } },
    },
    include: { memberships: true },
  });
  const storeId = user.memberships[0].storeId;
  await bootstrapStore(storeId);
  await createSession(user.id, storeId);
  await audit({ storeId, actor: { type: "USER", id: user.id, name: user.name, ip } }, { action: "auth.register", resourceType: "user", resourceId: user.id, resourceLabel: user.email });
  return { userId: user.id, storeId };
}

export async function login(input: z.infer<typeof loginSchema>, meta: { ip: string | null; userAgent: string | null }) {
  // Strict in production; relaxed in development so automated QA can log in repeatedly.
  const rl = await rateLimit(`login:${meta.ip ?? "unknown"}:${input.email}`, process.env.NODE_ENV === "production" ? 8 : 200, 300);
  if (!rl.allowed) throw tooManyRequests(rl.retryAfter);

  const user = await db.user.findUnique({ where: { email: input.email }, include: { memberships: { orderBy: { createdAt: "asc" } } } });
  if (!user || user.deletedAt) {
    await burnPasswordCheck(input.password);
    throw new AppError("Incorrect email or password", 401, "invalid_credentials");
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) throw new AppError("Incorrect email or password", 401, "invalid_credentials");

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    if (!input.code) return { requires2fa: true as const };
    if (!verifyTotp(decrypt(user.twoFactorSecret), input.code)) throw new AppError("That code isn't valid. Try the latest code from your app.", 401, "invalid_2fa");
  }
  const storeId = user.memberships[0]?.storeId ?? null;
  await createSession(user.id, storeId);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  if (storeId) {
    await audit({ storeId, actor: { type: "USER", id: user.id, name: user.name, ip: meta.ip, userAgent: meta.userAgent } }, { action: "auth.login", resourceType: "user", resourceId: user.id, resourceLabel: user.email });
  }
  return { requires2fa: false as const };
}

export async function logout() {
  await destroySession();
}

// ───────────────────────── Password & 2FA ─────────────────────────


export async function changePassword(ctx: ServiceContext, sessionId: string, input: z.infer<typeof changePasswordSchema>) {
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.actor.id! } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) throw badRequest("Current password is incorrect");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
  // Sign out every other session.
  await db.session.deleteMany({ where: { userId: user.id, id: { not: sessionId } } });
  await audit(ctx, { action: "auth.password_change", resourceType: "user", resourceId: user.id, resourceLabel: user.email });
}

export async function startTwoFactor(ctx: ServiceContext) {
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.actor.id! } });
  if (user.twoFactorEnabled) throw conflict("Two-factor authentication is already enabled");
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { twoFactorSecret: encrypt(secret) } });
  return { secret, uri: totpUri(secret, user.email, brand.name) };
}

export async function confirmTwoFactor(ctx: ServiceContext, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.actor.id! } });
  if (!user.twoFactorSecret) throw badRequest("Start two-factor setup first");
  if (!verifyTotp(decrypt(user.twoFactorSecret), code)) throw badRequest("That code isn't valid");
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
  await audit(ctx, { action: "auth.2fa_enable", resourceType: "user", resourceId: user.id, resourceLabel: user.email });
}

export async function disableTwoFactor(ctx: ServiceContext, password: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.actor.id! } });
  if (!(await verifyPassword(password, user.passwordHash))) throw badRequest("Password is incorrect");
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
  await audit(ctx, { action: "auth.2fa_disable", resourceType: "user", resourceId: user.id, resourceLabel: user.email });
}

export async function listSessions(userId: string, currentId: string) {
  const sessions = await db.session.findMany({ where: { userId, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } });
  return sessions.map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === currentId }));
}

export async function revokeSession(ctx: ServiceContext, sessionId: string) {
  const { count } = await db.session.deleteMany({ where: { id: sessionId, userId: ctx.actor.id! } });
  if (!count) throw notFound("Session");
  await audit(ctx, { action: "auth.session_revoke", resourceType: "session", resourceId: sessionId });
}

// ───────────────────────── Team ─────────────────────────

const roleEnum = z.enum(["OWNER", "ADMIN", "MANAGER", "SUPPORT_AGENT", "MARKETING_MANAGER", "VIEWER"]);
export const addMemberSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(), role: roleEnum });
export const updateMemberSchema = z.object({ role: roleEnum });

export async function listMembers(storeId: string) {
  const members = await db.membership.findMany({
    where: { storeId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, lastLoginAt: true, twoFactorEnabled: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({ ...m.user, userId: m.user.id, id: m.id, role: m.role, joinedAt: m.createdAt }));
}

/**
 * Adds a teammate. New users get a one-time temporary password (returned
 * once, never stored in plain text) which they change after first login.
 */
export async function addMember(ctx: ServiceContext, input: z.infer<typeof addMemberSchema>) {
  if (!ctx.actor.role || !canAssignRole(ctx.actor.role, input.role)) throw forbidden("You can't assign a role higher than your own");
  let user = await db.user.findUnique({ where: { email: input.email } });
  let temporaryPassword: string | null = null;
  if (!user) {
    temporaryPassword = `${randomToken(6)}9a`;
    user = await db.user.create({ data: { email: input.email, name: input.name, passwordHash: await hashPassword(temporaryPassword) } });
  }
  const existing = await db.membership.findUnique({ where: { userId_storeId: { userId: user.id, storeId: ctx.storeId } } });
  if (existing) throw conflict("This person is already on the team");
  const membership = await db.membership.create({ data: { userId: user.id, storeId: ctx.storeId, role: input.role } });
  await audit(ctx, { action: "team.add", resourceType: "membership", resourceId: membership.id, resourceLabel: input.email, newValue: { role: input.role } });
  return { membershipId: membership.id, temporaryPassword };
}

async function ownerCount(storeId: string) {
  return db.membership.count({ where: { storeId, role: "OWNER" } });
}

export async function updateMemberRole(ctx: ServiceContext, membershipId: string, role: Role) {
  const m = await db.membership.findFirst({ where: { id: membershipId, storeId: ctx.storeId }, include: { user: true } });
  if (!m) throw notFound("Team member");
  if (!ctx.actor.role || !canAssignRole(ctx.actor.role, role) || !canAssignRole(ctx.actor.role, m.role)) throw forbidden("You can't change this member's role");
  if (m.role === "OWNER" && role !== "OWNER" && (await ownerCount(ctx.storeId)) <= 1) throw conflict("A store needs at least one owner");
  const updated = await db.membership.update({ where: { id: membershipId }, data: { role } });
  await audit(ctx, { action: "team.role_change", resourceType: "membership", resourceId: membershipId, resourceLabel: m.user.email, oldValue: { role: m.role }, newValue: { role } });
  return updated;
}

export async function removeMember(ctx: ServiceContext, membershipId: string) {
  const m = await db.membership.findFirst({ where: { id: membershipId, storeId: ctx.storeId }, include: { user: true } });
  if (!m) throw notFound("Team member");
  if (m.userId === ctx.actor.id) throw conflict("You can't remove yourself");
  if (!ctx.actor.role || !canAssignRole(ctx.actor.role, m.role)) throw forbidden("You can't remove this member");
  if (m.role === "OWNER" && (await ownerCount(ctx.storeId)) <= 1) throw conflict("A store needs at least one owner");
  await db.membership.delete({ where: { id: membershipId } });
  await db.session.deleteMany({ where: { userId: m.userId, storeId: ctx.storeId } });
  await audit(ctx, { action: "team.remove", resourceType: "membership", resourceId: membershipId, resourceLabel: m.user.email });
}
