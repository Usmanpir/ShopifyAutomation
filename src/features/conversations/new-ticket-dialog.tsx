"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/client/api";

export const TICKET_CATEGORIES = [
  { value: "EXCHANGE", label: "Exchange" },
  { value: "RETURN", label: "Return" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "PRODUCT", label: "Product" },
  { value: "PAYMENT", label: "Payment" },
  { value: "OTHER", label: "Other" },
];
export const TICKET_PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export function NewTicketDialog({
  trigger,
  link,
  defaultSubject = "",
}: {
  trigger: React.ReactNode;
  /** Pre-link the ticket to a conversation/customer/order. */
  link?: { conversationId?: string; customerId?: string | null; orderId?: string | null; label?: string };
  defaultSubject?: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [priority, setPriority] = useState("MEDIUM");

  const create = useMutation({
    mutationFn: () =>
      api<{ number: number }>("/api/tickets", {
        body: {
          subject: subject.trim(),
          description: description.trim() || undefined,
          category,
          priority,
          conversationId: link?.conversationId,
          customerId: link?.customerId ?? undefined,
          orderId: link?.orderId ?? undefined,
        },
      }),
    onSuccess: (t) => {
      toast.success(`Ticket #${t.number} created`);
      setOpen(false);
      setSubject(defaultSubject);
      setDescription("");
      setCategory("OTHER");
      setPriority("MEDIUM");
      void qc.invalidateQueries({ queryKey: ["tickets"] });
      if (link?.conversationId) void qc.invalidateQueries({ queryKey: ["conversation", link.conversationId] });
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New support ticket</DialogTitle>
          <DialogDescription>{link?.label ? `Linked to ${link.label}.` : "Track an issue that needs follow-up by the team."}</DialogDescription>
        </DialogHeader>
        <form
          id="new-ticket"
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (subject.trim().length >= 3) create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input id="ticket-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Exchange size L → XL for #10877" maxLength={200} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ticket-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="ticket-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ticket-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="ticket-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-desc">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="ticket-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} placeholder="What happened and what's needed?" />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="new-ticket" disabled={subject.trim().length < 3 || create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />} Create ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
