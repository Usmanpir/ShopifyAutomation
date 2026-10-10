"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/client/api";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
  code: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: demo ? "usman@demo.commerceai.app" : "", password: demo ? "Demo@12345" : "", code: "" } });

  const onSubmit = async (values: Values) => {
    setError(null);
    try {
      const res = await api<{ requires2fa: boolean }>("/api/auth/login", { body: values });
      if (res.requires2fa) {
        setNeeds2fa(true);
        return;
      }
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const { errors, isSubmitting } = form.formState;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{needs2fa ? "Two-factor verification" : "Welcome back"}</h1>
        <p className="text-sm text-muted-foreground">{needs2fa ? "Enter the 6-digit code from your authenticator app." : "Sign in to your command center."}</p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {!needs2fa ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" autoFocus className="h-10" aria-invalid={!!errors.email} {...form.register("email")} />
            {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" className="h-10" aria-invalid={!!errors.password} {...form.register("password")} />
            {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
          </div>
        </>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="code">Authentication code</Label>
          <Input id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} placeholder="123456" className="h-11 text-center text-lg tracking-[0.5em]" {...form.register("code")} />
        </div>
      )}
      <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" /> : needs2fa ? <ShieldCheck /> : null}
        {needs2fa ? "Verify" : "Sign in"}
      </Button>
      {demo && !needs2fa && (
        <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
          Demo credentials are pre-filled · <span className="font-medium text-foreground">usman@demo.commerceai.app</span>
        </p>
      )}
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
