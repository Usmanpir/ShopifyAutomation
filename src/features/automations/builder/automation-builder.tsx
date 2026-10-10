"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ControlButton,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeTypes,
  type IsValidConnection,
  type NodeTypes,
} from "@xyflow/react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  History,
  Keyboard,
  LayoutGrid,
  Loader2,
  Maximize,
  MousePointerClick,
  Pause,
  Play,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Bone } from "@/components/shared/skeletons";
import { Pill, RUN_STATUS } from "@/components/shared/status";
import { ACTIONS_BY_KEY } from "@/lib/automation/catalog";
import {
  defaultConfig,
  defaultLabel,
  describeGraphIssues,
  eventLabel,
  handleLabel,
  newNodeKey,
  sourceHandles,
  summarizeNode,
  type FriendlyIssue,
} from "@/lib/automation/describe";
import type { AutomationGraph, NodeType, RunStatus, RunStep } from "@/lib/automation/types";
import { api, errorMessage } from "@/lib/client/api";
import { pluralize } from "@/lib/format";
import { EVENT_TYPES, isEventType } from "@/lib/events/types";
import { AUTOMATION_STATUS, NODE_VISUAL, triggerMeta } from "../meta";
import { RunTimeline } from "../run-timeline";
import { BranchEdge as BranchEdgeComponent, EdgeMarkers } from "./branch-edge";
import { BuilderContext, type NodeIssues } from "./context";
import { COL_GAP, edgeId, fingerprint, freeSpot, hasOverlaps, layoutNodes, NODE_WIDTH, ROW_GAP, toFlowEdges, toFlowNodes, toGraph, type BranchEdge, type StepData, type StepNode } from "./graph";
import { Inspector } from "./inspector";
import { MobileView } from "./mobile-view";
import { DND_MIME, Palette } from "./palette";
import { RunHistory, runsQueryKey } from "./run-history";
import { StepNode as StepNodeComponent } from "./step-node";

export type AutomationDetail = {
  id: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  graph: AutomationGraph;
};

type TestResult = { runId: string; status: RunStatus; steps: RunStep[] };
type Busy = "save" | "status" | "test" | null;
type PanelTab = "step" | "runs";

const NODE_TYPES: NodeTypes = { step: StepNodeComponent };
const EDGE_TYPES: EdgeTypes = { branch: BranchEdgeComponent };

/** React Flow theme mapped onto our design tokens. */
const FLOW_VARS = {
  "--xy-background-color": "var(--surface-2)",
  "--xy-background-pattern-color": "color-mix(in oklch, var(--muted-foreground) 28%, transparent)",
  "--xy-edge-stroke": "var(--chart-axis)",
  "--xy-edge-stroke-selected": "var(--primary)",
  "--xy-connectionline-stroke": "var(--primary)",
  "--xy-connectionline-stroke-width": "2",
  "--xy-handle-background-color": "var(--muted-foreground)",
  "--xy-handle-border-color": "var(--card)",
  "--xy-selection-background-color": "color-mix(in oklch, var(--primary) 8%, transparent)",
  "--xy-selection-border": "1px dashed var(--primary)",
  "--xy-controls-button-background-color": "var(--card)",
  "--xy-controls-button-background-color-hover": "var(--muted)",
  "--xy-controls-button-color": "var(--foreground)",
  "--xy-controls-button-color-hover": "var(--foreground)",
  "--xy-controls-button-border-color": "var(--border)",
  "--xy-controls-box-shadow": "0 1px 3px rgba(16,24,40,0.08)",
  "--xy-minimap-background-color": "var(--card)",
  "--xy-minimap-mask-background-color": "color-mix(in oklch, var(--muted) 70%, transparent)",
  "--xy-minimap-mask-stroke-color": "var(--border)",
  "--xy-edge-label-background-color": "var(--card)",
  "--xy-edge-label-color": "var(--foreground)",
} as React.CSSProperties;

function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Label that tracks the configuration until the user renames the step. */
function autoLabel(d: StepData): string | null {
  const c = d.config;
  if (d.type === "TRIGGER") return isEventType(String(c.event)) ? eventLabel(c.event) : null;
  if (d.type === "ACTION") return ACTIONS_BY_KEY.get(String(c.action))?.label ?? null;
  if (d.type === "WAIT") return Number(c.amount) > 0 ? summarizeNode(d) : null;
  return null;
}

export function AutomationBuilder(props: { automation: AutomationDetail; canManage: boolean; initialPanel?: PanelTab; isNew?: boolean }) {
  return (
    <ReactFlowProvider>
      <Builder {...props} />
    </ReactFlowProvider>
  );
}

function Builder({ automation, canManage, initialPanel = "step", isNew }: { automation: AutomationDetail; canManage: boolean; initialPanel?: PanelTab; isNew?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const rf = useReactFlow<StepNode, BranchEdge>();
  const { resolvedTheme } = useTheme();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const wide = useMediaQuery("(min-width: 1280px)");
  const readOnly = !canManage;

  const [initial] = useState(() => {
    const n = toFlowNodes(automation.graph);
    const e = toFlowEdges(automation.graph);
    // Older/template graphs can be tightly packed; lay them out once for readability.
    return { nodes: hasOverlaps(n) ? layoutNodes(n, e) : n, edges: e };
  });
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<BranchEdge>(initial.edges);
  const [name, setName] = useState(automation.name);
  const [description, setDescription] = useState(automation.description ?? "");
  const [status, setStatus] = useState(automation.status);
  const [baseline, setBaseline] = useState(() => fingerprint(automation.name, automation.description ?? "", toGraph(initial.nodes, initial.edges)));
  const [busy, setBusy] = useState<Busy>(null);
  const [panel, setPanel] = useState<PanelTab>(initialPanel);
  const [sheetOpen, setSheetOpen] = useState(initialPanel === "runs");
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [highlight, setHighlight] = useState<Set<string> | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges]);
  const dirty = fingerprint(name, description, graph) !== baseline;
  const validation = useMemo(() => describeGraphIssues(graph), [graph]);
  const issueCount = validation.errors.length + validation.warnings.length;

  const issuesByKey = useMemo(() => {
    const map = new Map<string, NodeIssues>();
    const labelOf = new Map(graph.nodes.map((n) => [n.key, n.label]));
    const strip = (i: FriendlyIssue) => {
      const label = labelOf.get(i.nodeKey!) ?? "";
      return label && i.message.startsWith(`${label}: `) ? i.message.slice(label.length + 2) : i.message;
    };
    for (const i of [...validation.errors, ...validation.warnings]) {
      if (!i.nodeKey) continue;
      const entry = map.get(i.nodeKey) ?? { errors: [], warnings: [] };
      (i.severity === "error" ? entry.errors : entry.warnings).push(strip(i));
      map.set(i.nodeKey, entry);
    }
    return map;
  }, [validation, graph.nodes]);

  const selectedNodes = nodes.filter((n) => n.selected);
  const selected = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const trigger = nodes.find((n) => n.data.type === "TRIGGER");
  const triggerEvent = String(trigger?.data.config.event ?? "");
  const triggerEntity = isEventType(triggerEvent) ? EVENT_TYPES[triggerEvent].entity : null;

  const ctx = useMemo(() => ({ issues: issuesByKey, readOnly, highlight }), [issuesByKey, readOnly, highlight]);

  const displayEdges = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return edges.map((e) => {
      const src = byId.get(e.source)?.data;
      const handle = e.sourceHandle ?? "next";
      const tone = src ? sourceHandles(src).find((h) => h.id === handle)?.tone : undefined;
      return { ...e, label: handleLabel(src, handle) || undefined, data: { tone } };
    });
  }, [nodes, edges]);

  // ───────── Mutations of local graph ─────────

  const selectOnly = useCallback(
    (key: string | null) => {
      setNodes((ns) => ns.map((n) => (n.selected === (n.id === key) ? n : { ...n, selected: n.id === key })));
      setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)));
    },
    [setNodes, setEdges],
  );

  const focusNode = (key: string) => {
    selectOnly(key);
    setPanel("step");
    setIssuesOpen(false);
    if (!wide) setSheetOpen(true);
    requestAnimationFrame(() => void rf.fitView({ nodes: [{ id: key }], duration: 400, maxZoom: 1.1, padding: 0.6 }));
  };

  const updateNode = useCallback(
    (key: string, patch: Partial<StepData>) => {
      let prunedHandles: string[] | null = null;
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== key) return n;
          const next: StepData = { ...n.data, ...patch };
          if (patch.config && !("label" in patch)) {
            const prevAuto = autoLabel(n.data);
            const nextAuto = autoLabel(next);
            if (nextAuto && (n.data.label === prevAuto || n.data.label === defaultLabel(n.data.type))) next.label = nextAuto;
          }
          if (patch.config && n.data.type === "AI_DECISION") prunedHandles = sourceHandles(next).map((h) => h.id);
          return { ...n, data: next, ariaLabel: `${next.label} (${NODE_VISUAL[next.type].label} step)` };
        }),
      );
      // Remove connections from branches that no longer exist (e.g. a deleted AI outcome).
      setEdges((es) => (prunedHandles ? es.filter((e) => e.source !== key || prunedHandles!.includes(e.sourceHandle ?? "next")) : es));
    },
    [setNodes, setEdges],
  );

  const deleteNode = useCallback((key: string) => void rf.deleteElements({ nodes: [{ id: key }] }), [rf]);

  const addNode = useCallback(
    (type: NodeType, dropAt?: { x: number; y: number }) => {
      if (readOnly) return;
      if (type === "TRIGGER" && nodes.some((n) => n.data.type === "TRIGGER")) {
        toast.error("A workflow can only have one trigger");
        return;
      }
      const tail = [...nodes].sort((a, b) => b.position.y - a.position.y)[0];
      const source = selected ?? (dropAt ? null : tail) ?? null;
      const handles = source ? sourceHandles(source.data) : [];
      const usedHandles = new Set(edges.filter((e) => e.source === source?.id).map((e) => e.sourceHandle ?? "next"));
      const freeIndex = handles.findIndex((h) => !usedHandles.has(h.id));
      const handle = freeIndex >= 0 && type !== "TRIGGER" ? handles[freeIndex] : null;

      let position = dropAt ?? { x: 280, y: 40 };
      if (!dropAt && source) {
        const spread = handle && handles.length > 1 ? (freeIndex - (handles.length - 1) / 2) * COL_GAP : 0;
        position = freeSpot(nodes, { x: source.position.x + spread, y: source.position.y + ROW_GAP });
      }
      const key = newNodeKey(type, nodes.map((n) => n.id));
      const label = defaultLabel(type);
      const node: StepNode = { id: key, type: "step", position, data: { type, label, config: defaultConfig(type) }, selected: true, ariaLabel: `${label} (${NODE_VISUAL[type].label} step)` };

      setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), node]);
      setEdges((es) => {
        const cleared = es.map((e) => (e.selected ? { ...e, selected: false } : e));
        return source && handle ? [...cleared, { id: edgeId(source.id, handle.id, key), source: source.id, target: key, sourceHandle: handle.id, type: "branch" }] : cleared;
      });
      setPanel("step");
      setHighlight(null);
      requestAnimationFrame(() => void rf.setCenter(position.x + NODE_WIDTH / 2, position.y + 50, { zoom: Math.max(rf.getZoom(), 0.8), duration: 350 }));
    },
    [readOnly, nodes, edges, selected, setNodes, setEdges, rf],
  );

  const canvasRef = useRef<HTMLDivElement>(null);

  /** Fit the whole flow, but never zoom out so far that steps become unreadable: top-align instead. */
  const fitReadable = useCallback(
    (duration = 0) => {
      const el = canvasRef.current;
      const all = rf.getNodes();
      if (!el || !all.length) return;
      const b = rf.getNodesBounds(all);
      const { width, height } = el.getBoundingClientRect();
      const fitZoom = Math.min((width * 0.85) / Math.max(b.width, 1), (height * 0.85) / Math.max(b.height, 1), 1);
      const zoom = Math.max(fitZoom, Math.min(0.8, (width * 0.9) / Math.max(b.width, 1)));
      const x = width / 2 - (b.x + b.width / 2) * zoom;
      const y = fitZoom >= zoom ? height / 2 - (b.y + b.height / 2) * zoom : 32 - b.y * zoom;
      void rf.setViewport({ x, y, zoom }, { duration });
    },
    [rf],
  );

  const nodesReady = useNodesInitialized();
  const didFit = useRef(false);
  useEffect(() => {
    if (nodesReady && !didFit.current) {
      didFit.current = true;
      fitReadable();
    }
  }, [nodesReady, fitReadable]);

  const tidyUp = () => {
    setNodes((ns) => layoutNodes(ns, edges));
    requestAnimationFrame(() => fitReadable(400));
  };

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly || !c.source || !c.target || c.source === c.target) return;
      const handle = c.sourceHandle ?? "next";
      // One connection per branch: reconnecting a handle replaces its old edge.
      setEdges((es) => [...es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? "next") === handle)), { id: edgeId(c.source, handle, c.target), source: c.source, target: c.target, sourceHandle: handle, type: "branch" }]);
    },
    [readOnly, setEdges],
  );

  const isValidConnection: IsValidConnection<BranchEdge> = useCallback(
    (c) => c.source !== c.target && rf.getNode(c.target)?.data.type !== "TRIGGER",
    [rf],
  );

  // ───────── Server actions ─────────

  const save = useCallback(async (): Promise<boolean> => {
    if (name.trim().length < 2) {
      toast.error("Give the automation a name (at least 2 characters)");
      nameRef.current?.focus();
      return false;
    }
    const unnamed = graph.nodes.find((n) => !n.label.trim());
    if (unnamed) {
      toast.error("Every step needs a name");
      focusNode(unnamed.key);
      return false;
    }
    setBusy("save");
    try {
      await api(`/api/automations/${automation.id}`, { method: "PUT", body: { name: name.trim(), description: description.trim() || null, graph } });
      setBaseline(fingerprint(name, description, graph));
      toast.success("Workflow saved");
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description, graph, automation.id]);

  const setActive = async (on: boolean) => {
    if (on) {
      if (validation.errors.length) {
        toast.error(`Fix before activating: ${validation.errors[0].message}`);
        setIssuesOpen(true);
        return;
      }
      if (dirty && !(await save())) return;
    }
    setBusy("status");
    try {
      await api(`/api/automations/${automation.id}/status`, { body: { status: on ? "ACTIVE" : "PAUSED" } });
      setStatus(on ? "ACTIVE" : "PAUSED");
      toast.success(on ? "Automation is live" : "Automation paused", { description: on ? `It runs every time: ${triggerMeta(triggerEvent).label.toLowerCase()}.` : "New events won't start runs. Waiting runs continue." });
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const testRun = async () => {
    if (validation.errors.length) {
      toast.error(`Fix before testing: ${validation.errors[0].message}`);
      setIssuesOpen(true);
      return;
    }
    if (dirty && !(await save())) return;
    setBusy("test");
    try {
      const r = await api<TestResult>(`/api/automations/${automation.id}/run`, { body: {} });
      setTestResult(r);
      setTestOpen(true);
      void qc.invalidateQueries({ queryKey: runsQueryKey(automation.id) });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // ───────── Keyboard, unsaved-changes guard ─────────

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!readOnly && dirtyRef.current) void saveRef.current();
      }
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("input,textarea,select,[role=dialog],[role=listbox]")) {
        selectOnly(null);
        setHighlight(null);
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    // In-app link clicks (sidebar, back link…) while there are unsaved edits.
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== location.origin || a.pathname === location.pathname) return;
      if (!window.confirm("You have unsaved changes to this workflow. Leave without saving?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [readOnly, selectOnly]);

  useEffect(() => {
    if (isNew && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, [isNew]);

  // ───────── Render ─────────

  const panelContent = (
    <Tabs
      value={panel}
      onValueChange={(v) => {
        setPanel(v as PanelTab);
        if (v !== "runs") setHighlight(null);
      }}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="border-b px-3 py-2">
        <TabsList className="w-full">
          <TabsTrigger value="step">
            <SlidersHorizontal /> {selected ? "Step" : "Workflow"}
          </TabsTrigger>
          <TabsTrigger value="runs">
            <History /> Runs
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="step" className="min-h-0 flex-1">
        {selected ? (
          <Inspector
            key={selected.id}
            node={selected}
            issues={issuesByKey.get(selected.id)}
            readOnly={readOnly}
            triggerEntity={triggerEntity}
            triggerLabel={triggerMeta(triggerEvent).label}
            onChange={updateNode}
            onDelete={deleteNode}
          />
        ) : (
          <WorkflowOverview graph={graph} errors={validation.errors} warnings={validation.warnings} onIssue={focusNode} readOnly={readOnly} />
        )}
      </TabsContent>
      <TabsContent value="runs" className="min-h-0 flex-1">
        <RunHistory automationId={automation.id} canManage={canManage} onHighlight={setHighlight} />
      </TabsContent>
    </Tabs>
  );

  return (
    <BuilderContext.Provider value={ctx}>
      <div className="md:hidden">
        <MobileView
          automationId={automation.id}
          name={name}
          description={description}
          status={status}
          graph={graph}
          errorCount={validation.errors.length}
          canManage={canManage}
          busy={busy === "status" || busy === "test" ? busy : null}
          onToggle={(on) => void setActive(on)}
          onTestRun={() => void testRun()}
        />
      </div>

      <div className="hidden h-[calc(100dvh-3.5rem-5rem)] flex-col md:flex lg:h-[calc(100dvh-3.5rem)]">
        {/* ───────── Toolbar ───────── */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
          <Button asChild variant="ghost" size="icon-sm" aria-label="Back to automations">
            <Link href="/automations">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={readOnly}
              maxLength={120}
              aria-label="Automation name"
              className="block w-full max-w-md truncate rounded-md bg-transparent px-1.5 text-[15px] leading-6 font-semibold tracking-tight outline-none hover:bg-muted/60 focus:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              readOnly={readOnly}
              maxLength={500}
              placeholder={readOnly ? "" : "Add a description…"}
              aria-label="Automation description"
              className="block w-full max-w-xl truncate rounded-md bg-transparent px-1.5 text-xs leading-5 text-muted-foreground outline-none placeholder:text-muted-foreground/60 hover:bg-muted/60 focus:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Pill map={AUTOMATION_STATUS} value={status} />
            {!readOnly && (
              <span className={cn("hidden items-center gap-1.5 text-xs whitespace-nowrap lg:flex", dirty ? "text-warning" : "text-muted-foreground")} aria-live="polite">
                <span className={cn("size-1.5 rounded-full", dirty ? "bg-warning" : "bg-success")} aria-hidden />
                {dirty ? "Unsaved changes" : "Saved"}
              </span>
            )}
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />

            <Popover open={issuesOpen} onOpenChange={setIssuesOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(validation.errors.length ? "text-danger hover:text-danger" : validation.warnings.length ? "text-warning hover:text-warning" : "text-success hover:text-success")}
                  aria-label={issueCount ? `${pluralize(validation.errors.length, "error")}, ${pluralize(validation.warnings.length, "warning")}` : "Workflow is valid"}
                >
                  {validation.errors.length ? <AlertCircle /> : validation.warnings.length ? <AlertTriangle /> : <CheckCircle2 />}
                  <span className="hidden xl:inline">
                    {validation.errors.length ? pluralize(validation.errors.length, "error") : validation.warnings.length ? pluralize(validation.warnings.length, "warning") : "Ready"}
                  </span>
                  <span className="tabular xl:hidden">{issueCount || ""}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <IssuesList errors={validation.errors} warnings={validation.warnings} onIssue={focusNode} />
              </PopoverContent>
            </Popover>

            {!wide && (
              <Button variant="ghost" size="sm" onClick={() => (setPanel("runs"), setSheetOpen(true))} aria-label="Run history">
                <History />
              </Button>
            )}

            {canManage && (
              <>
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="sm" disabled={busy !== null} aria-label="Test run">
                      {busy === "test" ? <Loader2 className="animate-spin" /> : <FlaskConical />}
                      <span className="hidden lg:inline">Test run</span>
                    </Button>
                  }
                  title="Run a test now?"
                  description={`This runs the saved workflow once against your most recent ${triggerEntity === "variant" ? "low-stock variant" : triggerEntity === "customer" ? "inactive customer" : "order"} and performs real actions (messages, tags, tickets). Wait steps pause the run as usual.${dirty ? " Your unsaved changes are saved first." : ""}`}
                  confirmLabel="Start test run"
                  onConfirm={testRun}
                />
                <Button variant={dirty ? "default" : "outline"} size="sm" onClick={() => void save()} disabled={!dirty || busy !== null} title="Save (Ctrl+S)">
                  {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
                  <span className="hidden lg:inline">Save</span>
                </Button>
                {status === "ACTIVE" ? (
                  <Button variant="outline" size="sm" onClick={() => void setActive(false)} disabled={busy !== null}>
                    {busy === "status" ? <Loader2 className="animate-spin" /> : <Pause />} Pause
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => void setActive(true)}
                    disabled={busy !== null}
                    className="bg-success text-primary-foreground hover:bg-success/90"
                  >
                    {busy === "status" ? <Loader2 className="animate-spin" /> : <Play />} {dirty ? "Save & activate" : "Activate"}
                  </Button>
                )}
              </>
            )}
          </div>
        </header>

        {/* ───────── Body ───────── */}
        <div className="flex min-h-0 flex-1">
          {!readOnly && <Palette onAdd={(t) => addNode(t)} hasTrigger={!!trigger} hasSelection={!!selected} />}

          <div
            ref={canvasRef}
            className="relative min-w-0 flex-1"
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DND_MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              const type = e.dataTransfer.getData(DND_MIME) as NodeType;
              if (!type) return;
              e.preventDefault();
              const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
              addNode(type, { x: Math.round(p.x - NODE_WIDTH / 2), y: Math.round(p.y - 30) });
            }}
          >
            {isDesktop ? (
              <ReactFlow<StepNode, BranchEdge>
                nodes={nodes}
                edges={displayEdges}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                onNodeClick={() => {
                  setPanel("step");
                  if (!wide) setSheetOpen(true);
                }}
                onPaneClick={() => setHighlight(null)}
                minZoom={0.2}
                maxZoom={1.75}
                snapToGrid
                snapGrid={[10, 10]}
                deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
                nodesDraggable={!readOnly}
                nodesConnectable={!readOnly}
                edgesReconnectable={false}
                connectionLineType={ConnectionLineType.SmoothStep}
                defaultEdgeOptions={{ type: "branch" }}
                colorMode={resolvedTheme === "dark" ? "dark" : "light"}
                proOptions={{ hideAttribution: true }}
                style={FLOW_VARS}
                aria-label="Workflow canvas"
              >
                <EdgeMarkers />
                <Background variant={BackgroundVariant.Dots} gap={18} size={1.3} />
                <Controls showInteractive={false} showFitView={false} position="bottom-left" className="overflow-hidden rounded-lg border">
                  <ControlButton onClick={() => fitReadable(300)} title="Fit to screen" aria-label="Fit to screen">
                    <Maximize />
                  </ControlButton>
                </Controls>
                {!readOnly && nodes.length > 1 && (
                  <Panel position="top-right">
                    <Button variant="outline" size="sm" className="bg-card shadow-xs" onClick={tidyUp} title="Arrange steps in a tidy top-down layout">
                      <LayoutGrid /> Tidy up
                    </Button>
                  </Panel>
                )}
                {wide && <MiniMap pannable zoomable position="bottom-right" nodeColor={(n) => NODE_VISUAL[(n as StepNode).data.type].accent} nodeBorderRadius={8} style={{ width: 168, height: 112 }} className="overflow-hidden rounded-lg border" ariaLabel="Workflow overview map" />}
                {!readOnly && nodes.length <= 1 && (
                  <Panel position="top-center" className="mt-4">
                    <div className="flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm">
                      <MousePointerClick className="size-3.5 text-primary" />
                      Pick a step on the left — it&apos;s added below the trigger and connected for you.
                    </div>
                  </Panel>
                )}
                {highlight && (
                  <Panel position="top-center" className="mt-4">
                    <button type="button" onClick={() => setHighlight(null)} className="flex items-center gap-2 rounded-full border border-success/30 bg-success-soft px-3.5 py-1.5 text-xs font-medium text-success shadow-sm">
                      Showing a run&apos;s path · Clear
                    </button>
                  </Panel>
                )}
              </ReactFlow>
            ) : (
              <Bone className="absolute inset-0 rounded-none" />
            )}
          </div>

          {wide && <aside className="flex w-[340px] shrink-0 flex-col border-l bg-card">{panelContent}</aside>}
        </div>
      </div>

      {!wide && isDesktop && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="w-full gap-0 p-0 sm:max-w-sm" aria-describedby={undefined}>
            <SheetTitle className="sr-only">{panel === "runs" ? "Run history" : selected ? "Edit step" : "Workflow"}</SheetTitle>
            <div className="flex h-full min-h-0 flex-col pt-10">{panelContent}</div>
          </SheetContent>
        </Sheet>
      )}

      <TestRunSheet
        result={testResult}
        open={testOpen}
        onOpenChange={setTestOpen}
        onShowHistory={() => {
          setTestOpen(false);
          setPanel("runs");
          if (!wide) setSheetOpen(true);
        }}
      />
    </BuilderContext.Provider>
  );
}

// ───────────────────────── Sub-components ─────────────────────────

function IssuesList({ errors, warnings, onIssue }: { errors: FriendlyIssue[]; warnings: FriendlyIssue[]; onIssue: (key: string) => void }) {
  if (!errors.length && !warnings.length) {
    return (
      <div className="flex items-start gap-2.5 p-4">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
        <div>
          <p className="text-sm font-medium">Ready to activate</p>
          <p className="text-xs text-muted-foreground">Every step is configured and connected.</p>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="border-b px-4 py-2.5">
        <p className="text-sm font-semibold">Workflow check</p>
        <p className="text-xs text-muted-foreground">{errors.length ? "Errors block activation. Click an issue to jump to the step." : "Warnings don't block activation."}</p>
      </div>
      <ul className="max-h-80 overflow-y-auto p-1.5">
        {[...errors, ...warnings].map((i, idx) => {
          const Icon = i.severity === "error" ? AlertCircle : AlertTriangle;
          const content = (
            <>
              <Icon className={cn("mt-0.5 size-3.5 shrink-0", i.severity === "error" ? "text-danger" : "text-warning")} />
              <span className="text-[12.5px]">{i.message}</span>
            </>
          );
          return (
            <li key={idx}>
              {i.nodeKey ? (
                <button type="button" onClick={() => onIssue(i.nodeKey!)} className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left hover:bg-muted focus-visible:bg-muted">
                  {content}
                </button>
              ) : (
                <div className="flex items-start gap-2 px-2.5 py-2">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WorkflowOverview({ graph, errors, warnings, onIssue, readOnly }: { graph: AutomationGraph; errors: FriendlyIssue[]; warnings: FriendlyIssue[]; onIssue: (key: string) => void; readOnly: boolean }) {
  const trigger = graph.nodes.find((n) => n.type === "TRIGGER");
  const t = triggerMeta(String(trigger?.config.event ?? ""));
  const counts = graph.nodes.reduce<Record<string, number>>((m, n) => ((m[n.type] = (m[n.type] ?? 0) + 1), m), {});
  return (
    <div className="h-full space-y-5 overflow-y-auto px-4 py-4">
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Trigger</h3>
        <div className="flex items-center gap-2.5 rounded-lg border bg-surface-2/60 p-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-ai-soft text-ai" aria-hidden>
            <t.icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{trigger ? t.label : "No trigger yet"}</p>
            <p className="text-xs text-muted-foreground">{trigger ? t.category : "Add a Trigger step to start"}</p>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{pluralize(graph.nodes.length, "step")}</h3>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(counts).map(([type, n]) => {
            const v = NODE_VISUAL[type as NodeType];
            return (
              <span key={type} className="inline-flex h-6 items-center gap-1.5 rounded-full bg-muted px-2 text-[11.5px] font-medium">
                <v.icon className="size-3 text-muted-foreground" /> {n} {v.label}
              </span>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Check</h3>
        <div className="overflow-hidden rounded-lg border">
          <IssuesList errors={errors} warnings={warnings} onIssue={onIssue} />
        </div>
      </section>

      {!readOnly && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            <Keyboard className="size-3.5" /> Tips
          </h3>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>Select a step to edit it here. Drag from a step&apos;s bottom handle to another step to connect.</li>
            <li>
              <Kbd>Del</Kbd> or <Kbd>Backspace</Kbd> removes the selected step or connection.
            </li>
            <li>
              <Kbd>Ctrl</Kbd> + <Kbd>S</Kbd> saves · <Kbd>Esc</Kbd> clears the selection.
            </li>
            <li>Conditions branch on Yes / No, AI decisions on each outcome, approvals on Approved / Rejected.</li>
          </ul>
        </section>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 font-mono text-[10.5px] text-foreground/80">{children}</kbd>;
}

function TestRunSheet({ result, open, onOpenChange, onShowHistory }: { result: TestResult | null; open: boolean; onOpenChange: (o: boolean) => void; onShowHistory: () => void }) {
  const last = result?.steps[result.steps.length - 1];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        {result && (
          <>
            <SheetHeader className="border-b px-5 pt-5 pb-4">
              <div className="pr-8">
                <Pill map={RUN_STATUS} value={result.status} />
              </div>
              <SheetTitle className="mt-2 text-base">Test run result</SheetTitle>
              <SheetDescription>
                {result.status === "COMPLETED"
                  ? `Completed ${pluralize(result.steps.length, "step")}.`
                  : result.status === "FAILED"
                    ? "The run stopped with an error."
                    : result.status === "WAITING"
                      ? `Paused at “${last?.label ?? "Wait"}”. It resumes automatically on schedule.`
                      : result.status === "AWAITING_APPROVAL"
                        ? "Waiting for a human decision in the approval center."
                        : "The run is in progress."}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <RunTimeline steps={result.steps} />
            </div>
            <div className="flex items-center gap-2 border-t px-5 py-3">
              <Button variant="outline" size="sm" onClick={onShowHistory}>
                <History /> Run history
              </Button>
              {result.status === "AWAITING_APPROVAL" && (
                <Button asChild size="sm" className="ml-auto">
                  <Link href="/approvals">Open approvals</Link>
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
