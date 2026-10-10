import { z } from "zod";

/** Shared (client + server) auth validation. */
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Password is too long")
  .regex(/[a-z]/i, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: passwordSchema,
  storeName: z.string().trim().min(2, "Enter your store name").max(80),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password").max(128),
  code: z.string().trim().max(10).optional(),
});

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1, "Enter your current password"), newPassword: passwordSchema });
