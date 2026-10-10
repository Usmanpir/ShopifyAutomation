import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number; pageCount: number };

export function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export const idParam = z.object({ id: z.string().min(1).max(64) });

export const sortDir = z.enum(["asc", "desc"]).default("desc");
