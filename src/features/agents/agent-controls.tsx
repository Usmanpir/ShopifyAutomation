"use client";

import { cn } from "cn";
import { Check, Info, Loader2, Lock, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AUTONOMY, TOOL_KIND, type ToolInfo, toolLabel } from "./agent-meta";
import { type AgentPatch, useAgentUpdate } from "./use-agent-update";

// ───────────────────────── Enabled switch ─────────────────────────

export function AgentEnabledSwitch({ agentKey, name, enabled, canManage }: { agentKey: string; name: string; enabled: boolean; canManage: boolean }) {
  const [on, setOn] = useState(enabled);
  const update = useAgentUpdate(agentKey, {
    success: (p) => (p.enabled ? `${name} is active` : `${name} paused — it won't take any actions`),
    onError: () => setOn(enabled),
  });
  const control = (
    <div className={cn("flex h-9 items-center gap-2.5 rounded-lg border bg-card px-3", !canManage && "opacity-80")}>
      <Label htmlFor="agent-enabled" className="cursor-pointer text-sm font-medium">
        {on ? "Enabled" : "Paused"}
      </Label>
      {update.isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
      <Switch
        id="agent-enabled"
        checked={on}
        disabled={!canManage || update.isPending}
        onCheckedChange={(v) => {
          setOn(v);
          update.mutate({ enabled: v });
        }}
        aria-label={`${on ? "Pause" : "Enable"} ${name}`}
      />
    </div>
  );
  if (canManage) return control;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{control}</span>
      </TooltipTrigger>
      <TooltipContent>Only owners and admins can change agents</TooltipContent>
    </Tooltip>
  );
}

// ───────────────────────── Tools ─────────────────────────

export function AgentToolsTable({
  agentKey,
  name,
  catalog,
  granted,
  defaults,
  canManage,
}: {
  agentKey: string;
  name: string;
  catalog: ToolInfo[];
  granted: string[];
  defaults: string[];
  canManage: boolean;
}) {
  const [tools, setTools] = useState(granted);
  const [view, setView] = useState<"granted" | "all">("granted");
  const update = useAgentUpdate(agentKey, { success: () => null, onError: () => setTools(granted) });

  const save = (next: string[], msg: string) => {
    setTools(next);
    update.mutate({ tools: next }, { onSuccess: () => toast.success(msg) });
  };

  const toggle = (tool: ToolInfo, on: boolean) => {
    const next = on ? [...tools, tool.name] : tools.filter((t) => t !== tool.name);
    save(next, on ? `Granted “${toolLabel(tool.name)}” to ${name}` : `Revoked “${toolLabel(tool.name)}” from ${name}`);
  };

  const set = new Set(tools);
  const sorted = [...catalog].sort((a, b) => Number(set.has(b.name)) - Number(set.has(a.name)));
  const rows = view === "granted" ? sorted.filter((t) => set.has(t.name)) : sorted;
  const isDefault = tools.length === defaults.length && defaults.every((d) => set.has(d));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3">
        <div role="tablist" aria-label="Tool filter" className="inline-flex rounded-lg bg-muted p-0.5">
          {(["granted", "all"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn("h-7 rounded-md px-2.5 text-[13px] font-medium transition", view === v ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {v === "granted" ? `Granted (${tools.length})` : `All tools (${catalog.length})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {update.isPending && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
            </span>
          )}
          {canManage && !isDefault && (
            <Button size="sm" variant="ghost" onClick={() => save(defaults, "Tools reset to defaults")} disabled={update.isPending}>
              <RotateCcw /> Reset to defaults
            </Button>
          )}
        </div>
      </div>
      <ul className="divide-y border-t" aria-label={`Tools available to ${name}`}>
        {rows.map((t) => {
          const on = set.has(t.name);
          const kind = TOOL_KIND[t.kind];
          return (
            <li key={t.name} className={cn("flex items-start gap-3 px-5 py-3 transition", !on && "bg-surface-2/40")}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn("text-sm font-medium", !on && "text-muted-foreground")}>{toolLabel(t.name)}</span>
                  <code className="rounded bg-muted px-1.5 py-px font-mono text-[11px] text-muted-foreground">{t.name}</code>
                  {defaults.includes(t.name) && <span className="text-[11px] text-muted-foreground">· default</span>}
                </div>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t.description}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
                  <StatusPill tone={kind.tone} className="h-5 text-[11px]">
                    {kind.label}
                  </StatusPill>
                  <span className="font-mono text-[11px] text-muted-foreground">{t.permission}</span>
                </div>
              </div>
              <div className="hidden w-24 shrink-0 pt-0.5 sm:block">
                <StatusPill tone={kind.tone}>{kind.label}</StatusPill>
              </div>
              <div className="hidden w-40 shrink-0 pt-1 lg:block">
                <span className="font-mono text-[11.5px] text-muted-foreground">{t.permission}</span>
              </div>
              <Switch
                className="mt-1"
                checked={on}
                disabled={!canManage || update.isPending}
                onCheckedChange={(v) => toggle(t, v)}
                aria-label={`${on ? "Revoke" : "Grant"} ${toolLabel(t.name)} for ${name}`}
              />
            </li>
          );
        })}
        {!rows.length && <li className="px-5 py-8 text-center text-sm text-muted-foreground">No tools granted. This agent can&apos;t take any actions.</li>}
      </ul>
    </div>
  );
}

// ───────────────────────── Autonomy ─────────────────────────

export function AgentAutonomySelector({ agentKey, value, canManage }: { agentKey: string; value: string; canManage: boolean }) {
  const [current, setCurrent] = useState(value);
  const update = useAgentUpdate(agentKey, {
    success: (p) => `Autonomy set to ${AUTONOMY[p.autonomy!]?.label.toLowerCase()}`,
    onError: () => setCurrent(value),
  });
  return (
    <RadioGroup
      value={current}
      onValueChange={(v) => {
        setCurrent(v);
        update.mutate({ autonomy: v as AgentPatch["autonomy"] });
      }}
      disabled={!canManage || update.isPending}
      className="grid gap-2.5 md:grid-cols-3"
      aria-label="Autonomy level"
    >
      {Object.entries(AUTONOMY).map(([key, a]) => {
        const on = current === key;
        return (
          <Label
            key={key}
            htmlFor={`autonomy-${key}`}
            className={cn(
              "relative flex cursor-pointer flex-col items-start gap-1.5 rounded-xl border p-3.5 font-normal transition has-focus-visible:ring-3 has-focus-visible:ring-ring/40",
              on ? "border-ai/50 bg-ai-soft/60 ring-1 ring-ai/30" : "hover:border-foreground/20",
              !canManage && "cursor-default",
            )}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-semibold">{a.label}</span>
              <RadioGroupItem id={`autonomy-${key}`} value={key} />
            </div>
            <span className="text-xs leading-5 text-muted-foreground">{a.description}</span>
            {on && update.isPending && <Loader2 className="absolute right-3 bottom-3 size-3.5 animate-spin text-muted-foreground" aria-hidden />}
          </Label>
        );
      })}
    </RadioGroup>
  );
}

// ───────────────────────── Instructions + threshold ─────────────────────────

export function AgentConfigForm({
  agentKey,
  instructions,
  threshold,
  defaultInstructions,
  canManage,
}: {
  agentKey: string;
  instructions: string;
  threshold: number;
  defaultInstructions: string;
  canManage: boolean;
}) {
  const [text, setText] = useState(instructions);
  const [conf, setConf] = useState(threshold);
  const [saved, setSaved] = useState({ text: instructions, conf: threshold });
  const update = useAgentUpdate(agentKey, { success: () => "Configuration saved" });
  const dirty = text !== saved.text || Math.abs(conf - saved.conf) > 0.001;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!dirty) return;
        update.mutate({ instructions: text, confidenceThreshold: Math.round(conf * 100) / 100 }, { onSuccess: () => setSaved({ text, conf }) });
      }}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="agent-instructions">Instructions</Label>
          {canManage && text !== defaultInstructions && (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setText(defaultInstructions)}>
              Restore default
            </button>
          )}
        </div>
        <Textarea
          id="agent-instructions"
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={!canManage}
          maxLength={4000}
          rows={4}
          className="min-h-24 resize-y text-sm leading-6"
          aria-describedby="agent-instructions-help"
        />
        <p id="agent-instructions-help" className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>Rules the agent follows on every task. Plain language works best.</span>
          <span className="tabular shrink-0">{text.length}/4000</span>
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="agent-threshold" className="flex items-center gap-1.5">
            Confidence threshold
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="About confidence threshold" className="text-muted-foreground hover:text-foreground">
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">Below this confidence the agent won&apos;t act — it escalates to a human or asks for approval instead.</TooltipContent>
            </Tooltip>
          </Label>
          <span className="tabular rounded-md bg-ai-soft px-2 py-0.5 text-sm font-semibold text-ai">{Math.round(conf * 100)}%</span>
        </div>
        <Slider
          id="agent-threshold"
          min={0.5}
          max={0.95}
          step={0.05}
          value={[conf]}
          onValueChange={([v]) => setConf(v)}
          disabled={!canManage}
          aria-label="Confidence threshold"
        />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>50% · acts more often</span>
          <span>95% · escalates more</span>
        </div>
      </div>

      {canManage ? (
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setText(saved.text);
                setConf(saved.conf);
              }}
            >
              Discard
            </Button>
          )}
          <Button type="submit" disabled={!dirty || update.isPending}>
            {update.isPending ? <Loader2 className="animate-spin" /> : dirty ? <Save /> : <Check />}
            {dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 border-t pt-4 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden /> Read-only — only owners and admins can change agent configuration.
        </p>
      )}
    </form>
  );
}
