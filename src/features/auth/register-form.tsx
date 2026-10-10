"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/client/api";
import { registerSchema } from "@/schemas/auth";
import type { z } from "zod";

type Values = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(registerSchema), defaultValues: { name: "", email: "", password: "", storeName: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = async (values: Values) => {
    setError(null);
    try {
      await api("/api/auth/register", { body: values });
      router.replace("/onboarding");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const field = (name: keyof Values, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} className="h-10" aria-invalid={!!errors[name]} {...props} {...form.register(name)} />
      {errors[name] && <p className="text-xs text-danger">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5 pb-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
        <p className="text-sm text-muted-foreground">Start in demo mode — connect Shopify and WhatsApp whenever you&apos;re ready.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {field("name", "Your name", { autoComplete: "name", autoFocus: true })}
      {field("storeName", "Store name", { placeholder: "e.g. Urban Threads" })}
      {field("email", "Work email", { type: "email", autoComplete: "email" })}
      {field("password", "Password", { type: "password", autoComplete: "new-password", placeholder: "At least 10 characters, with a number" })}
      <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />} Create account
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
