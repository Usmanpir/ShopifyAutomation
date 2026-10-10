"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/client/api";

export function OrderTags({ orderId, tags, canUpdate }: { orderId: string; tags: string[]; canUpdate: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const add = useMutation({
    mutationFn: (tag: string) => api(`/api/orders/${orderId}/tags`, { body: { tag } }),
    onSuccess: (_, tag) => {
      toast.success(`Tagged “${tag.toLowerCase()}”`);
      setValue("");
      setAdding(false);
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-3">
      {tags.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Order tags">
          {tags.map((t) => (
            <li key={t} className="inline-flex h-6 items-center gap-1 rounded-md border bg-surface-2 px-2 text-xs font-medium">
              <Tag className="size-3 text-muted-foreground" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No tags yet.</p>
      )}
      {canUpdate &&
        (adding ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) add.mutate(value.trim());
            }}
          >
            <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} placeholder="e.g. priority" aria-label="New tag" className="h-8" />
            <Button type="submit" size="sm" className="h-8" disabled={!value.trim() || add.isPending}>
              {add.isPending ? <Loader2 className="animate-spin" /> : "Add"}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Add tag
          </Button>
        ))}
    </div>
  );
}

export function OrderNoteForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const add = useMutation({
    mutationFn: () => api(`/api/orders/${orderId}/notes`, { body: { note: note.trim() } }),
    onSuccess: () => {
      toast.success("Note added to timeline");
      setNote("");
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (note.trim()) add.mutate();
      }}
    >
      <label htmlFor="order-note" className="sr-only">
        Add an internal note
      </label>
      <Textarea id="order-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="Leave an internal note for your team…" className="resize-none bg-background" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Only visible to your team.</p>
        <Button type="submit" size="sm" disabled={!note.trim() || add.isPending}>
          {add.isPending && <Loader2 className="animate-spin" />} Add note
        </Button>
      </div>
    </form>
  );
}
