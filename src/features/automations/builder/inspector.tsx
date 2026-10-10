"use client";

import { cn } from "cn";
import { AlertCircle, AlertTriangle, Info, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ACTIONS, ACTIONS_BY_KEY, CONDITION_FIELDS, type ActionDefinition } from "@/lib/automation/catalog";
import { humanize, OPERATOR_LABELS, VALUELESS_OPERATORS } from "@/lib/automation/describe";
import { OPERATORS, type ConditionRule, type Operator } from "@/lib/automation/types";
import { accentStyle, EVENT_GROUPS, NODE_VISUAL } from "../meta";
import type { NodeIssues } from "./context";
import type { StepData, StepNode } from "./graph";

type Config = Record<string, unknown>;
type SetConfig = (patch: Config) => void;

// ───────────────────────── Layout primitives ─────────────────────────

function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-foreground/90">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11.5px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ───────────────────────── Rules (conditions + trigger filters) ─────────────────────────

const FIELD_GROUPS = CONDITION_FIELDS.reduce<{ entity: string; fields: typeof CONDITION_FIELDS }[]>((groups, f) => {
  const entity = f.label.split("·")[0].trim();
  const g = groups.find((x) => x.entity === entity);
  if (g) g.fields.push(f);
  else groups.push({ entity, fields: [f] });
  return groups;
}, []);

function RuleRow({ rule, index, onChange, onRemove, canRemove, kind }: { rule: Partial<ConditionRule>; index: number; onChange: (r: Partial<ConditionRule>) => void; onRemove: () => void; canRemove: boolean; kind: string }) {
  const field = CONDITION_FIELDS.find((f) => f.value === rule.field);
  const op = (rule.operator ?? "eq") as Operator;
  const needsValue = !VALUELESS_OPERATORS.includes(op);
  const numeric = field?.type === "number";
  const ops = OPERATORS.filter((o) => (numeric ? !["contains"].includes(o) : field?.type === "enum" ? ["eq", "neq", "in", "exists", "not_exists"].includes(o) : !["gt", "gte", "lt", "lte"].includes(o)));
  const valueStr = Array.isArray(rule.value) ? rule.value.join(", ") : rule.value === undefined ? "" : String(rule.value);

  return (
    <div className="space-y-2 rounded-lg border bg-surface-2/50 p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          {kind} {index + 1}
        </span>
        {canRemove && (
          <Button type="button" variant="ghost" size="icon-xs" className="ml-auto text-muted-foreground hover:text-danger" onClick={onRemove} aria-label={`Remove ${kind.toLowerCase()} ${index + 1}`}>
            <X />
          </Button>
        )}
      </div>
      <Select value={rule.field ?? ""} onValueChange={(v) => onChange({ field: v, operator: "eq", value: undefined })}>
        <SelectTrigger size="sm" className="w-full bg-card" aria-label={`${kind} ${index + 1} field`}>
          <SelectValue placeholder="Choose a field" />
        </SelectTrigger>
        <SelectContent>
          {FIELD_GROUPS.map((g) => (
            <SelectGroup key={g.entity}>
              <SelectLabel>{g.entity}</SelectLabel>
              {g.fields.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label.split("·")[1]?.trim() ?? f.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2">
        <Select value={op} onValueChange={(v) => onChange({ ...rule, operator: v as Operator, value: VALUELESS_OPERATORS.includes(v as Operator) ? undefined : rule.value })}>
          <SelectTrigger size="sm" className={cn("w-full bg-card", !needsValue && "col-span-2")} aria-label={`${kind} ${index + 1} operator`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ops.map((o) => (
              <SelectItem key={o} value={o}>
                {OPERATOR_LABELS[o].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {needsValue &&
          (field?.type === "enum" && op !== "in" ? (
            <Select value={valueStr} onValueChange={(v) => onChange({ ...rule, value: v })}>
              <SelectTrigger size="sm" className="w-full bg-card" aria-label={`${kind} ${index + 1} value`}>
                <SelectValue placeholder="Value" />
              </SelectTrigger>
              <SelectContent>
                {field.options!.map((o) => (
                  <SelectItem key={o} value={o}>
                    {/^[A-Z]{2,4}$/.test(o) ? o : humanize(o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="h-7 bg-card"
              type={numeric && op !== "in" ? "number" : "text"}
              inputMode={numeric ? "decimal" : undefined}
              value={valueStr}
              placeholder={op === "in" ? "A, B, C" : numeric ? "0" : "Value"}
              aria-label={`${kind} ${index + 1} value`}
              onChange={(e) => {
                const raw = e.target.value;
                onChange({ ...rule, value: numeric && op !== "in" && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw });
              }}
            />
          ))}
      </div>
    </div>
  );
}

function RulesEditor({ rules, onChange, kind, minRules }: { rules: Partial<ConditionRule>[]; onChange: (rules: Partial<ConditionRule>[]) => void; kind: string; minRules: number }) {
  return (
    <div className="space-y-2">
      {rules.map((r, i) => (
        <RuleRow
          key={i}
          rule={r}
          index={i}
          kind={kind}
          canRemove={rules.length > minRules}
          onChange={(next) => onChange(rules.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(rules.filter((_, j) => j !== i))}
        />
      ))}
      <Button type="button" variant="outline" size="sm" className="w-full border-dashed bg-transparent" onClick={() => onChange([...rules, { field: "order.paymentMethod", operator: "eq", value: "COD" }])}>
        <Plus /> Add {kind.toLowerCase()}
      </Button>
    </div>
  );
}

// ───────────────────────── Type-specific forms ─────────────────────────

function TriggerForm({ config, set }: { config: Config; set: SetConfig }) {
  const filters = (config.filters as Partial<ConditionRule>[] | undefined) ?? [];
  return (
    <>
      <Field label="Starts when" hint="Every matching event starts a new run of this workflow.">
        <Select value={String(config.event ?? "")} onValueChange={(v) => set({ event: v })}>
          <SelectTrigger className="w-full bg-card" aria-label="Trigger event">
            <SelectValue placeholder="Choose an event" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {EVENT_GROUPS.map((g) => (
              <SelectGroup key={g.category}>
                <SelectLabel>{g.category}</SelectLabel>
                {g.events.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Section title="Filters (optional)">
        {filters.length === 0 && <p className="text-[11.5px] text-muted-foreground">Only start for events that match all filters — e.g. Payment method = COD.</p>}
        <RulesEditor rules={filters} kind="Filter" minRules={0} onChange={(rules) => set({ filters: rules })} />
      </Section>
    </>
  );
}

function ConditionForm({ config, set }: { config: Config; set: SetConfig }) {
  const rules = (config.rules as Partial<ConditionRule>[] | undefined) ?? [];
  return (
    <>
      <Field label="Continue on “Yes” when">
        <ToggleGroup type="single" variant="outline" size="sm" value={String(config.match ?? "all")} onValueChange={(v) => v && set({ match: v })} className="w-full">
          <ToggleGroupItem value="all" className="flex-1">
            All rules match
          </ToggleGroupItem>
          <ToggleGroupItem value="any" className="flex-1">
            Any rule matches
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>
      <Section title="Rules">
        <RulesEditor rules={rules} kind="Rule" minRules={1} onChange={(r) => set({ rules: r })} />
      </Section>
      <p className="flex gap-1.5 rounded-lg bg-info-soft px-2.5 py-2 text-[11.5px] text-info">
        <Info className="mt-px size-3.5 shrink-0" />
        Connect the <b className="font-semibold">Yes</b> and <b className="font-semibold">No</b> handles to choose what happens next. Fields are read fresh when the step runs.
      </p>
    </>
  );
}

const ACTION_GROUPS = ACTIONS.reduce<{ category: string; actions: ActionDefinition[] }[]>((groups, a) => {
  const g = groups.find((x) => x.category === a.category);
  if (g) g.actions.push(a);
  else groups.push({ category: a.category, actions: [a] });
  return groups;
}, []);

const ENTITY_PROVIDES: Record<string, string[]> = {
  order: ["order", "customer", "shipment"],
  shipment: ["shipment", "order", "customer"],
  customer: ["customer"],
  conversation: ["conversation", "customer"],
  variant: ["variant"],
};

function ActionForm({ config, set, triggerEntity, triggerLabel }: { config: Config; set: SetConfig; triggerEntity: string | null; triggerLabel: string }) {
  const def = ACTIONS_BY_KEY.get(String(config.action ?? ""));
  const params = (config.params as Record<string, unknown> | undefined) ?? {};
  const uid = useId();
  const mismatch = def?.requires && triggerEntity && !(ENTITY_PROVIDES[triggerEntity] ?? [triggerEntity]).includes(def.requires);

  return (
    <>
      <Field label="Action">
        <Select value={def?.key ?? ""} onValueChange={(v) => set({ action: v, params: {} })}>
          <SelectTrigger className="w-full bg-card" aria-label="Action">
            <SelectValue placeholder="Choose what to do" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {ACTION_GROUPS.map((g) => (
              <SelectGroup key={g.category}>
                <SelectLabel>{g.category}</SelectLabel>
                {g.actions.map((a) => (
                  <SelectItem key={a.key} value={a.key}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {def && (
        <div className="space-y-2 rounded-lg bg-surface-2/70 px-3 py-2.5 text-[12px] text-muted-foreground">
          <p>{def.description}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-medium">{def.category}</span>
            {def.requires && <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-medium">Needs {def.requires}</span>}
          </div>
          {def.sensitive && (
            <p className="flex items-center gap-1.5 text-warning">
              <ShieldAlert className="size-3.5" /> Routed through the approval center.
            </p>
          )}
        </div>
      )}
      {mismatch && (
        <p className="flex gap-1.5 rounded-lg bg-warning-soft px-2.5 py-2 text-[11.5px] text-warning" role="note">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          This action needs a {def!.requires}, but “{triggerLabel}” doesn&apos;t provide one. The step will fail at run time.
        </p>
      )}
      {def?.params.map((p) => {
        const id = `${uid}-${p.key}`;
        const value = params[p.key] === undefined ? "" : String(params[p.key]);
        const setParam = (v: unknown) => set({ params: { ...params, [p.key]: v } });
        return (
          <Field key={p.key} label={`${p.label}${p.required ? "" : " (optional)"}`} htmlFor={id} hint={p.type === "textarea" || p.type === "text" ? "Placeholders like {{order.name}} and {{customer.firstName}} are filled in." : undefined}>
            {p.type === "select" ? (
              <Select value={value} onValueChange={setParam}>
                <SelectTrigger id={id} className="w-full bg-card">
                  <SelectValue placeholder={`Choose ${p.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {p.options!.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : p.type === "textarea" ? (
              <Textarea id={id} rows={4} value={value} placeholder={p.placeholder} onChange={(e) => setParam(e.target.value)} className="bg-card" />
            ) : (
              <Input
                id={id}
                type={p.type === "number" ? "number" : "text"}
                value={value}
                placeholder={p.placeholder}
                onChange={(e) => setParam(p.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
                className="bg-card"
              />
            )}
          </Field>
        );
      })}
    </>
  );
}

function WaitForm({ config, set }: { config: Config; set: SetConfig }) {
  const uid = useId();
  return (
    <Field label="Wait for" htmlFor={uid} hint="The run pauses here and resumes automatically. Fields are re-checked after the wait.">
      <div className="grid grid-cols-[1fr_1.2fr] gap-2">
        <Input
          id={uid}
          type="number"
          min={1}
          inputMode="numeric"
          value={config.amount === undefined || config.amount === "" ? "" : String(config.amount)}
          onChange={(e) => set({ amount: e.target.value === "" ? "" : Number(e.target.value) })}
          className="bg-card"
        />
        <Select value={String(config.unit ?? "hours")} onValueChange={(v) => set({ unit: v })}>
          <SelectTrigger className="w-full bg-card" aria-label="Unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="minutes">Minutes</SelectItem>
            <SelectItem value="hours">Hours</SelectItem>
            <SelectItem value="days">Days</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </Field>
  );
}

const toOutcomeKey = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

function AIDecisionForm({ config, set }: { config: Config; set: SetConfig }) {
  const uid = useId();
  const outcomes = (config.outcomes as string[] | undefined) ?? [];
  const [draft, setDraft] = useState("");
  const add = () => {
    const key = toOutcomeKey(draft);
    if (!key || outcomes.includes(key) || outcomes.length >= 5) return;
    set({ outcomes: [...outcomes, key], ...(config.defaultOutcome ? {} : { defaultOutcome: key }) });
    setDraft("");
  };
  const remove = (o: string) => {
    const next = outcomes.filter((x) => x !== o);
    set({ outcomes: next, defaultOutcome: config.defaultOutcome === o ? (next[0] ?? "") : config.defaultOutcome });
  };
  return (
    <>
      <Field label="Question for the AI" htmlFor={`${uid}-q`} hint="The AI reads the order and customer data, picks one outcome and records its reasoning.">
        <Textarea id={`${uid}-q`} rows={3} value={String(config.question ?? "")} placeholder="Is this order likely to be fake or fraudulent?" onChange={(e) => set({ question: e.target.value })} className="bg-card" />
      </Field>
      <Field label={`Outcomes (${outcomes.length}/5)`} htmlFor={`${uid}-o`} hint="Each outcome becomes a branch on the canvas.">
        <div className="flex flex-wrap gap-1.5">
          {outcomes.map((o) => (
            <span key={o} className="inline-flex h-6 items-center gap-1 rounded-full bg-[color-mix(in_oklch,var(--chart-5)_13%,transparent)] pr-1 pl-2 text-[11.5px] font-medium text-[var(--chart-5)]">
              {humanize(o)}
              <button type="button" onClick={() => remove(o)} aria-label={`Remove outcome ${humanize(o)}`} className="grid size-4 place-items-center rounded-full hover:bg-[color-mix(in_oklch,var(--chart-5)_20%,transparent)]">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        {outcomes.length < 5 && (
          <div className="flex gap-2">
            <Input
              id={`${uid}-o`}
              value={draft}
              placeholder="e.g. needs_call"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  add();
                }
              }}
              className="bg-card"
            />
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={add} disabled={!toOutcomeKey(draft)}>
              Add
            </Button>
          </div>
        )}
      </Field>
      <Field label="Default outcome" hint="Used when the AI is unsure or unavailable.">
        <Select value={String(config.defaultOutcome ?? "")} onValueChange={(v) => set({ defaultOutcome: v })} disabled={!outcomes.length}>
          <SelectTrigger className="w-full bg-card" aria-label="Default outcome">
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
          <SelectContent>
            {outcomes.map((o) => (
              <SelectItem key={o} value={o}>
                {humanize(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

function RiskToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(v) => v && onChange(v)} className="w-full" aria-label="Risk level">
      {["LOW", "MEDIUM", "HIGH"].map((r) => (
        <ToggleGroupItem key={r} value={r} className="flex-1">
          {humanize(r)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function ApprovalForm({ config, set }: { config: Config; set: SetConfig }) {
  const uid = useId();
  return (
    <>
      <Field label="Request title" htmlFor={`${uid}-t`} hint="Shown in the approval center. Placeholders like {{order.name}} work.">
        <Input id={`${uid}-t`} value={String(config.title ?? "")} onChange={(e) => set({ title: e.target.value })} className="bg-card" />
      </Field>
      <Field label="Summary" htmlFor={`${uid}-s`}>
        <Textarea id={`${uid}-s`} rows={3} value={String(config.summary ?? "")} placeholder="Why does this need a human?" onChange={(e) => set({ summary: e.target.value })} className="bg-card" />
      </Field>
      <Field label="Risk">
        <RiskToggle value={String(config.risk ?? "MEDIUM")} onChange={(v) => set({ risk: v })} />
      </Field>
      <p className="flex gap-1.5 rounded-lg bg-success-soft px-2.5 py-2 text-[11.5px] text-success">
        <Info className="mt-px size-3.5 shrink-0" />
        The run pauses until someone approves or rejects, then follows that branch.
      </p>
    </>
  );
}

const ROLES = ["OWNER", "ADMIN", "MANAGER", "SUPPORT_AGENT", "MARKETING_MANAGER", "VIEWER"];

function NotificationForm({ config, set }: { config: Config; set: SetConfig }) {
  const uid = useId();
  const roles = (config.roles as string[] | undefined) ?? [];
  return (
    <>
      <Field label="Title" htmlFor={`${uid}-t`}>
        <Input id={`${uid}-t`} value={String(config.title ?? "")} placeholder="Low stock: {{variant.displayName}}" onChange={(e) => set({ title: e.target.value })} className="bg-card" />
      </Field>
      <Field label="Message" htmlFor={`${uid}-b`} hint={<>Use placeholders like <code className="rounded bg-muted px-1 font-mono text-[10.5px]">{"{{order.name}}"}</code> or <code className="rounded bg-muted px-1 font-mono text-[10.5px]">{"{{customer.name}}"}</code>.</>}>
        <Textarea id={`${uid}-b`} rows={3} value={String(config.body ?? "")} onChange={(e) => set({ body: e.target.value })} className="bg-card" />
      </Field>
      <Field label="Severity">
        <Select value={String(config.severity ?? "INFO")} onValueChange={(v) => set({ severity: v })}>
          <SelectTrigger className="w-full bg-card" aria-label="Severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["INFO", "SUCCESS", "WARNING", "CRITICAL"].map((s) => (
              <SelectItem key={s} value={s}>
                {humanize(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Notify roles" hint={roles.length ? undefined : "No roles selected — everyone on the team is notified."}>
        <ToggleGroup type="multiple" variant="outline" size="sm" spacing={1} value={roles} onValueChange={(v) => set({ roles: v })} className="flex w-full flex-wrap justify-start" aria-label="Roles to notify">
          {ROLES.map((r) => (
            <ToggleGroupItem key={r} value={r} className="h-7 px-2 text-xs data-[state=on]:border-primary/40 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">
              {humanize(r)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    </>
  );
}

// ───────────────────────── Inspector ─────────────────────────

export function Inspector({
  node,
  issues,
  readOnly,
  triggerEntity,
  triggerLabel,
  onChange,
  onDelete,
}: {
  node: StepNode;
  issues?: NodeIssues;
  readOnly: boolean;
  triggerEntity: string | null;
  triggerLabel: string;
  onChange: (key: string, patch: Partial<StepData>) => void;
  onDelete: (key: string) => void;
}) {
  const uid = useId();
  const { data } = node;
  const v = NODE_VISUAL[data.type];
  const set: SetConfig = (patch) => onChange(node.id, { config: { ...data.config, ...patch } });
  const forms: Record<StepData["type"], React.ReactNode> = {
    TRIGGER: <TriggerForm config={data.config} set={set} />,
    CONDITION: <ConditionForm config={data.config} set={set} />,
    ACTION: <ActionForm config={data.config} set={set} triggerEntity={triggerEntity} triggerLabel={triggerLabel} />,
    WAIT: <WaitForm config={data.config} set={set} />,
    AI_DECISION: <AIDecisionForm config={data.config} set={set} />,
    APPROVAL: <ApprovalForm config={data.config} set={set} />,
    NOTIFICATION: <NotificationForm config={data.config} set={set} />,
  };

  return (
    <div className="flex h-full flex-col" style={accentStyle(data.type)}>
      <div className="flex items-center gap-2.5 border-b px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklch,var(--node-accent)_13%,transparent)] text-[var(--node-accent)]" aria-hidden>
          <v.icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{v.label}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">{v.description}</p>
        </div>
      </div>
      <fieldset disabled={readOnly} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {(issues?.errors.length || issues?.warnings.length) ? (
          <ul className="space-y-1.5" aria-label="Problems with this step">
            {issues.errors.map((m) => (
              <li key={m} role="alert" className="flex gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
                <AlertCircle className="mt-px size-3.5 shrink-0" /> {m}
              </li>
            ))}
            {issues.warnings.map((m) => (
              <li key={m} className="flex gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning">
                <AlertTriangle className="mt-px size-3.5 shrink-0" /> {m}
              </li>
            ))}
          </ul>
        ) : null}
        <Field label="Step name" htmlFor={`${uid}-label`}>
          <Input id={`${uid}-label`} value={data.label} maxLength={120} onChange={(e) => onChange(node.id, { label: e.target.value })} className="bg-card" />
        </Field>
        {forms[data.type]}
        <p className="pt-1 text-[11px] text-muted-foreground">
          Step key <code className="rounded bg-muted px-1 font-mono">{node.id}</code>
        </p>
      </fieldset>
      {!readOnly && (
        <div className="border-t px-4 py-3">
          <Button variant="outline" size="sm" className="w-full text-danger hover:bg-danger-soft hover:text-danger" onClick={() => onDelete(node.id)}>
            <Trash2 /> Delete step
          </Button>
        </div>
      )}
    </div>
  );
}
