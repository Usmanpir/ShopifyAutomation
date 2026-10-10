"use client";

import { BookOpen, Gift, Megaphone, MessageCircle, Plus, ShoppingBag, Sparkles, Workflow } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCan } from "@/components/store-context";
import type { Permission } from "@/lib/rbac";

const ITEMS: { label: string; hint: string; href: string; icon: typeof Plus; permission: Permission }[] = [
  { label: "New order", hint: "Create or simulate an order", href: "/orders?create=1", icon: ShoppingBag, permission: "orders.update" },
  { label: "Message a customer", hint: "Find them, then tap Message", href: "/customers", icon: MessageCircle, permission: "conversations.reply" },
  { label: "WhatsApp campaign", hint: "Broadcast to a segment", href: "/marketing?tab=campaigns&new=1", icon: Megaphone, permission: "marketing.manage" },
  { label: "Promotion code", hint: "Discount for everyone", href: "/marketing?tab=promotions&new=1", icon: Gift, permission: "marketing.manage" },
  { label: "Automation", hint: "Answer 4 questions", href: "/automations?create=1", icon: Workflow, permission: "automations.manage" },
  { label: "Knowledge article", hint: "Teach the AI a policy or FAQ", href: "/ai?tab=knowledge", icon: BookOpen, permission: "ai.agents.manage" },
];

/** Global “+” — the common things to create, from anywhere. */
export function QuickCreate() {
  const can = useCan();
  const items = ITEMS.filter((i) => can(i.permission));
  if (!items.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" className="size-8 rounded-full" aria-label="Create new">
          <Plus className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((i) => (
          <DropdownMenuItem key={i.href} asChild className="items-start py-2">
            <Link href={i.href}>
              <i.icon className="mt-0.5" />
              <span>
                <span className="block text-[13px] font-medium">{i.label}</span>
                <span className="block text-xs text-muted-foreground">{i.hint}</span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
        {can("ai.use") && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/assistant">
                <Sparkles className="text-ai" /> Ask AI to do it
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
