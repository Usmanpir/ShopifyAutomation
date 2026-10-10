"use client";

import { useMutation } from "@tanstack/react-query";
import { Gift, Loader2, MessageCircle, Receipt, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Drawer } from "@/components/shared/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useStore } from "@/components/store-context";
import { api, errorMessage } from "@/lib/client/api";

type Props = {
  customer: { id: string; name: string; phone: string | null; blocked: boolean };
  conversationId: string | null;
  canMessage: boolean;
  canOffer: boolean;
  /** Suggested offer from the customer's history (e.g. 10% for a lapsed buyer). */
  suggestedPercent: number;
};

/** Customer action bar: one primary action (Message), View orders, Create offer. */
export function CustomerActions({ customer, conversationId, canMessage, canOffer, suggestedPercent }: Props) {
  const router = useRouter();
  const { store } = useStore();
  const first = customer.name.split(" ")[0];
  const [msgOpen, setMsgOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [text, setText] = useState("");
  const [type, setType] = useState<"PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING">("PERCENTAGE");
  const [value, setValue] = useState(String(suggestedPercent));
  const [days, setDays] = useState("7");
  const [send, setSend] = useState(canMessage && !!customer.phone);
  const [note, setNote] = useState("");

  const message = useMutation({
    mutationFn: () => api<{ conversationId: string | null }>(`/api/customers/${customer.id}/message`, { body: { text: text.trim() } }),
    onSuccess: (r) => {
      toast.success(`Message sent to ${first}`, r.conversationId ? { action: { label: "Open chat", onClick: () => router.push(`/conversations?c=${r.conversationId}`) } } : undefined);
      setText("");
      setMsgOpen(false);
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const offer = useMutation({
    mutationFn: () =>
      api<{ code: string; sent: boolean }>(`/api/customers/${customer.id}/offer`, {
        body: { type, value: Number(value) || 0, validDays: Number(days) || 7, send, message: note.trim() || undefined },
      }),
    onSuccess: (r) => {
      toast.success(r.sent ? `Offer ${r.code} sent to ${first}` : `Offer code ${r.code} created`, { description: "Single use · shown under Marketing → Promotions." });
      setOfferOpen(false);
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const reachable = !!customer.phone && !customer.blocked;
  return (
    <>
      {canMessage && reachable && (
        <Button className="h-9" onClick={() => (conversationId ? router.push(`/conversations?c=${conversationId}`) : setMsgOpen(true))}>
          <MessageCircle /> Message
        </Button>
      )}
      <Button asChild variant="outline" className="h-9">
        <Link href={`/orders?tab=all&customerId=${customer.id}`}>
          <Receipt /> View orders
        </Link>
      </Button>
      {canOffer && !customer.blocked && (
        <Button variant="outline" className="h-9" onClick={() => setOfferOpen(true)}>
          <Gift /> Create offer
        </Button>
      )}

      <Drawer
        open={msgOpen}
        onOpenChange={setMsgOpen}
        icon={<MessageCircle />}
        title={`Message ${first}`}
        description={`Sent on WhatsApp to +${customer.phone}. Their replies arrive in your Inbox.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMsgOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => message.mutate()} disabled={!text.trim() || message.isPending}>
              {message.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />} Send
            </Button>
          </>
        }
      >
        <Label htmlFor="cust-msg" className="sr-only">
          Message
        </Label>
        <Textarea id="cust-msg" rows={5} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder={`Hi ${first}, …`} autoFocus />
      </Drawer>

      <Drawer
        open={offerOpen}
        onOpenChange={setOfferOpen}
        icon={<Gift />}
        title={`Personal offer for ${first}`}
        description="Creates a single-use discount code just for this customer."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOfferOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => offer.mutate()} disabled={offer.isPending || (type !== "FREE_SHIPPING" && !(Number(value) > 0))}>
              {offer.isPending ? <Loader2 className="animate-spin" /> : <Gift />} {send ? "Create & send" : "Create code"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Offer</Label>
            <ToggleGroup type="single" variant="outline" value={type} onValueChange={(v) => v && setType(v as typeof type)} className="w-full">
              <ToggleGroupItem value="PERCENTAGE" className="flex-1">
                % off
              </ToggleGroupItem>
              <ToggleGroupItem value="FIXED_AMOUNT" className="flex-1">
                Amount off
              </ToggleGroupItem>
              <ToggleGroupItem value="FREE_SHIPPING" className="flex-1">
                Free delivery
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {type !== "FREE_SHIPPING" && (
              <div className="space-y-1.5">
                <Label htmlFor="offer-value">{type === "PERCENTAGE" ? "Discount (%)" : `Discount (${store.currency === "PKR" ? "Rs." : store.currency})`}</Label>
                <Input id="offer-value" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="offer-days">Valid for (days)</Label>
              <Input id="offer-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
          {type === "PERCENTAGE" && (
            <p className="text-xs text-muted-foreground">Suggested {suggestedPercent}% based on how recently {first} last ordered. Percentages above 90% aren&apos;t allowed.</p>
          )}
          {canMessage && reachable && (
            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center justify-between gap-3 text-sm font-medium">
                Send it on WhatsApp now
                <Switch checked={send} onCheckedChange={setSend} />
              </label>
              {send && <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={900} placeholder={`Optional message — the code and expiry are added automatically.`} />}
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}
