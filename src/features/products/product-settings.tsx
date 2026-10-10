"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/client/api";
import { PRODUCT_STATUS } from "./product-meta";

const NONE = "__none";

/** Status + category editor → PATCH /api/products/[id]. */
export function ProductSettings({
  productId,
  status: initialStatus,
  categoryId: initialCategory,
  categories,
  canEdit,
}: {
  productId: string;
  status: string;
  categoryId: string | null;
  categories: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [category, setCategory] = useState(initialCategory ?? NONE);
  const dirty = status !== initialStatus || category !== (initialCategory ?? NONE);

  const save = useMutation({
    mutationFn: () =>
      api(`/api/products/${productId}`, {
        method: "PATCH",
        body: {
          ...(status !== initialStatus ? { status } : {}),
          ...(category !== (initialCategory ?? NONE) ? { categoryId: category === NONE ? null : category } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Product updated");
      router.refresh();
    },
    onError: (e) => toast.error("Couldn't save changes", { description: errorMessage(e) }),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) save.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="product-status">Status</Label>
        <Select value={status} onValueChange={setStatus} disabled={!canEdit || save.isPending}>
          <SelectTrigger id="product-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PRODUCT_STATUS).map(([value, m]) => (
              <SelectItem key={value} value={value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {status === "ARCHIVED" && status !== initialStatus && <p className="text-xs text-warning">Archived products are hidden from your store and inventory forecasts.</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="product-category">Category</Label>
        <Select value={category} onValueChange={setCategory} disabled={!canEdit || save.isPending}>
          <SelectTrigger id="product-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Uncategorized</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {canEdit ? (
        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatus(initialStatus);
                setCategory(initialCategory ?? NONE);
              }}
              disabled={save.isPending}
            >
              Reset
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">You have view-only access to product settings.</p>
      )}
    </form>
  );
}
