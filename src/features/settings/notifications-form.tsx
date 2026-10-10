"use client";

import { AlertTriangle, BarChart3, Bell, Bot, CheckCheck, Headset, Mail, MessageCircle, Monitor, PackageMinus, Workflow } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { SectionCard } from "@/components/shared/page";
import type { notificationSettingsSchema } from "@/schemas/store-settings";
import type { z } from "zod";
import { FormFooter, SwitchRow, useSaver } from "./form-bits";

type Values = z.infer<typeof notificationSettingsSchema>;

const CHANNELS = [
  { key: "email", title: "Email", description: "Alerts and daily summaries to each member's inbox.", icon: <Mail /> },
  { key: "whatsapp", title: "WhatsApp", description: "Urgent alerts to admins over your WhatsApp Business number.", icon: <MessageCircle /> },
  { key: "browser", title: "In-app & browser", description: "Bell notifications and desktop pop-ups while the app is open.", icon: <Monitor /> },
] as const;

const ALERTS = [
  { key: "highRiskOrder", title: "High-risk orders", description: "An order scores above your high-risk threshold.", icon: <AlertTriangle /> },
  { key: "lowStock", title: "Low stock", description: "A variant drops below its threshold or runs out soon.", icon: <PackageMinus /> },
  { key: "humanHandoff", title: "Human handoff", description: "The WhatsApp agent needs a person to take over a chat.", icon: <Headset /> },
  { key: "approvalRequired", title: "Approval required", description: "AI is waiting for a decision on a sensitive action.", icon: <CheckCheck /> },
  { key: "adPerformance", title: "Ad performance", description: "ROAS drops, spend spikes or a campaign under-delivers.", icon: <BarChart3 /> },
  { key: "automationFailure", title: "Automation failures", description: "A workflow run fails or gets stuck.", icon: <Workflow /> },
  { key: "dailyReport", title: "Daily report", description: "Morning summary of sales, operations and AI activity.", icon: <Bot /> },
] as const;

export function NotificationsForm({ initial, readOnly }: { initial: Values; readOnly: boolean }) {
  const form = useForm<Values>({ defaultValues: initial });
  const { save, pending } = useSaver("/api/settings/notifications", { success: "Notification preferences saved" });
  const onSubmit = form.handleSubmit(async (v) => {
    if (await save(v)) form.reset(v);
  });
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <SectionCard title="Channels" description="Where we reach your team." icon={<Bell className="size-4 text-muted-foreground" aria-hidden />}>
        <div className="divide-y">
          {CHANNELS.map((c) => (
            <Controller
              key={c.key}
              control={form.control}
              name={c.key}
              render={({ field }) => <SwitchRow id={`ch-${c.key}`} title={c.title} description={c.description} icon={c.icon} checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} />}
            />
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Alerts" description="Which events notify you. Critical security events are always sent.">
        <div className="divide-y">
          {ALERTS.map((a) => (
            <Controller
              key={a.key}
              control={form.control}
              name={`alerts.${a.key}`}
              render={({ field }) => <SwitchRow id={`al-${a.key}`} title={a.title} description={a.description} icon={a.icon} checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} />}
            />
          ))}
        </div>
        <FormFooter dirty={form.formState.isDirty} pending={pending} readOnly={readOnly} onReset={() => form.reset(initial)} />
      </SectionCard>
    </form>
  );
}
