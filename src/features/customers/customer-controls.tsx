"use client";

import { useMutation } from "@tanstack/react-query";
import { Ban, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/client/api";

type Patch = { notes?: string | null; tags?: string[]; status?: "ACTIVE" | "BLOCKED" };

function usePatchCustomer(customerId: string) {
  const router = useRouter();
  return useMutation({
    mutationFn: (body: Patch) => api(`/api/customers/${customerId}`, { method: "PATCH", body }),
    onSuccess: () => router.refresh(),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function BlockCustomerButton({ customerId, name, blocked }: { customerId: string; name: string; blocked: boolean }) {
  const patch = usePatchCustomer(customerId);
  return blocked ? (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="h-9">
          <ShieldCheck /> Unblock
        </Button>
      }
      title={`Unblock ${name}?`}
      description="They'll be able to place orders and receive WhatsApp messages and campaigns again."
      confirmLabel="Unblock customer"
      onConfirm={() => patch.mutateAsync({ status: "ACTIVE" }).then(() => toast.success(`${name} unblocked`))}
    />
  ) : (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="h-9 text-danger hover:text-danger">
          <Ban /> Block
        </Button>
      }
      title={`Block ${name}?`}
      description="Blocked customers are excluded from campaigns and automations, and new orders from them are flagged for review. You can unblock at any time."
      confirmLabel="Block customer"
      destructive
      onConfirm={() => patch.mutateAsync({ status: "BLOCKED" }).then(() => toast.success(`${name} blocked`))}
    />
  );
}

export function CustomerNotesTags({ customerId, notes: initialNotes, tags: initialTags, canUpdate }: { customerId: string; notes: string | null; tags: string[]; canUpdate: boolean }) {
  const patch = usePatchCustomer(customerId);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [tags, setTags] = useState(initialTags);
  const [tag, setTag] = useState("");
  const dirty = notes !== (initialNotes ?? "");

  const saveTags = (next: string[], msg: string) => {
    const prev = tags;
    setTags(next);
    patch.mutate(
      { tags: next },
      {
        onSuccess: () => toast.success(msg),
        onError: () => setTags(prev),
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">Tags</h3>
        {tags.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Customer tags">
            {tags.map((t) => (
              <li key={t} className="inline-flex h-6 items-center gap-1 rounded-md border bg-surface-2 pr-1 pl-2 text-xs font-medium">
                {t}
                {canUpdate && (
                  <button
                    type="button"
                    onClick={() => saveTags(tags.filter((x) => x !== t), `Removed “${t}”`)}
                    disabled={patch.isPending}
                    aria-label={`Remove tag ${t}`}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No tags.</p>
        )}
        {canUpdate && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = tag.trim().toLowerCase();
              if (!t) return;
              if (tags.includes(t)) return setTag("");
              saveTags([...tags, t], `Tagged “${t}”`);
              setTag("");
            }}
          >
            <Input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={40} placeholder="Add a tag…" aria-label="New tag" className="h-8" />
            <Button type="submit" size="sm" variant="outline" className="h-8" disabled={!tag.trim() || patch.isPending}>
              <Plus /> Add
            </Button>
          </form>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="customer-notes" className="text-xs font-medium text-muted-foreground">
          Internal notes
        </label>
        {canUpdate ? (
          <>
            <Textarea
              id="customer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
              rows={4}
              placeholder="Sizing preferences, delivery instructions, anything your team should know…"
              className="resize-y bg-background"
            />
            <div className="flex justify-end gap-2">
              {dirty && (
                <Button size="sm" variant="ghost" onClick={() => setNotes(initialNotes ?? "")} disabled={patch.isPending}>
                  Discard
                </Button>
              )}
              <Button
                size="sm"
                disabled={!dirty || patch.isPending}
                onClick={() => patch.mutate({ notes: notes.trim() || null }, { onSuccess: () => toast.success("Notes saved") })}
              >
                {patch.isPending && <Loader2 className="animate-spin" />} Save notes
              </Button>
            </div>
          </>
        ) : (
          <p id="customer-notes" className="text-sm whitespace-pre-wrap">
            {initialNotes || <span className="text-muted-foreground">No notes.</span>}
          </p>
        )}
      </div>
    </div>
  );
}
