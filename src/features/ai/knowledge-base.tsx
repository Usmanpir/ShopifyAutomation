"use client";

import { useMutation } from "@tanstack/react-query";
import { BookOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Drawer } from "@/components/shared/drawer";
import { SectionCard } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/client/api";

export type Article = { id: string; title: string; category: string; content: string; active: boolean; updatedAt: string };

const GROUPS: { label: string; categories: string[]; hint: string }[] = [
  { label: "Products", categories: ["PRODUCT", "SIZING"], hint: "Fabric, fit and size guides. Prices and stock are always read live from your catalog — never from here." },
  { label: "Policies", categories: ["POLICY"], hint: "Payment, privacy and general store rules." },
  { label: "FAQs", categories: ["FAQ"], hint: "Questions customers ask often." },
  { label: "Shipping", categories: ["SHIPPING"], hint: "Delivery times, charges and couriers." },
  { label: "Returns", categories: ["RETURNS"], hint: "Return and exchange rules the AI quotes for those questions." },
];
const CATEGORY_LABEL: Record<string, string> = { PRODUCT: "Product", SIZING: "Size guide", POLICY: "Policy", FAQ: "FAQ", SHIPPING: "Shipping", RETURNS: "Returns" };

/** AI Knowledge Base: what the AI may quote to customers, grouped the way owners think about it. */
export function KnowledgeBase({
  articles,
  aiSettings,
  canEdit,
  canEditVoice,
}: {
  articles: Article[];
  /** Current AI settings section; saved back whole with only brandVoice changed. */
  aiSettings: Record<string, unknown> & { brandVoice: string };
  canEdit: boolean;
  canEditVoice: boolean;
}) {
  const brandVoice = aiSettings.brandVoice;
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<Article> | null>(null);
  const [voice, setVoice] = useState(brandVoice);

  const save = useMutation({
    mutationFn: (a: Partial<Article>) =>
      api(a.id ? `/api/ai/knowledge/${a.id}` : "/api/ai/knowledge", { method: a.id ? "PATCH" : "POST", body: { title: a.title, category: a.category, content: a.content, active: a.active ?? true } }),
    onSuccess: () => {
      toast.success("Saved — the AI uses it from the next message");
      setEditing(null);
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/ai/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Article deleted");
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: (a: Article) => api(`/api/ai/knowledge/${a.id}`, { method: "PATCH", body: { title: a.title, category: a.category, content: a.content, active: !a.active } }),
    onSuccess: () => router.refresh(),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveVoice = useMutation({
    mutationFn: () => api<{ ai: Record<string, unknown> }>("/api/settings/ai", { method: "PATCH", body: { ...aiSettings, brandVoice: voice.trim() } }),
    onSuccess: () => toast.success("Custom instructions saved"),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">The Customer Assistant only quotes what&apos;s written here. If something isn&apos;t covered, it hands the chat to you instead of guessing.</p>
        {canEdit && (
          <Button onClick={() => setEditing({ category: "FAQ", active: true })}>
            <Plus /> Add article
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => {
          const items = articles.filter((a) => g.categories.includes(a.category));
          return (
            <SectionCard key={g.label} title={g.label} description={g.hint} action={<span className="tabular text-xs text-muted-foreground">{items.length}</span>}>
              {items.length ? (
                <ul className="-mx-2 divide-y">
                  {items.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-2 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {a.title}
                          {!a.active && <span className="ml-2 text-xs font-normal text-muted-foreground">(off)</span>}
                        </p>
                        <p className="line-clamp-2 text-[13px] text-muted-foreground">{a.content}</p>
                      </div>
                      {canEdit && (
                        <div className="flex shrink-0 items-center gap-1">
                          <Switch checked={a.active} onCheckedChange={() => toggle.mutate(a)} aria-label={a.active ? `Stop using ${a.title}` : `Use ${a.title}`} />
                          <Button variant="ghost" size="icon-sm" onClick={() => setEditing(a)} aria-label={`Edit ${a.title}`}>
                            <Pencil />
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-danger" aria-label={`Delete ${a.title}`}>
                                <Trash2 />
                              </Button>
                            }
                            title={`Delete “${a.title}”?`}
                            description="The AI stops using it immediately. You can turn an article off instead if you may need it later."
                            confirmLabel="Delete"
                            destructive
                            onConfirm={() => remove.mutateAsync(a.id)}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing here yet — questions on this topic go to a person.</p>
              )}
            </SectionCard>
          );
        })}
        <SectionCard title="Custom instructions" description="How the AI should sound and behave in every reply">
          <Textarea rows={4} value={voice} onChange={(e) => setVoice(e.target.value)} maxLength={500} disabled={!canEditVoice} />
          {canEditVoice && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{voice.length}/500</span>
              <Button size="sm" onClick={() => saveVoice.mutate()} disabled={saveVoice.isPending || !voice.trim() || voice === brandVoice}>
                {saveVoice.isPending && <Loader2 className="animate-spin" />} Save
              </Button>
            </div>
          )}
        </SectionCard>
      </div>

      <Drawer
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        icon={<BookOpen />}
        title={editing?.id ? "Edit article" : "New article"}
        description="Write it the way you'd explain it to a customer. The AI quotes it word for word."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending || !editing?.title?.trim() || (editing?.content?.trim().length ?? 0) < 5}>
              {save.isPending && <Loader2 className="animate-spin" />} Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="kb-title">Title</Label>
              <Input id="kb-title" value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Exchange policy" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label>Topic</Label>
              <Select value={editing.category} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-content">Answer</Label>
              <Textarea id="kb-content" rows={8} value={editing.content ?? ""} onChange={(e) => setEditing({ ...editing, content: e.target.value })} maxLength={4000} />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
