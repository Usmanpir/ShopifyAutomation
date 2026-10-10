import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";
import { db } from "@/lib/db";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Pre-fill demo credentials only when the seeded demo store exists.
  const demo = !!(await db.user.findUnique({ where: { email: "usman@demo.commerceai.app" }, select: { id: true } }));
  return (
    <Suspense>
      <LoginForm demo={demo} />
    </Suspense>
  );
}
