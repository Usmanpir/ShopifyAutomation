"use client";
import { TimeAgo } from "@/components/shared/time-ago";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Sparkles, Upload, Wand2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Bone } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { StatusPill, type Tone } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/client/api";

import type { CreativeAnalysis } from "@/services/creative.service";
import { CreativeTypePill } from "./creatives-view";

export type UploadRow = {
  id: string;
  type: string;
  name: string;
  fileId: string | null;
  url: string | null;
  copy: string | null;
  analysis: unknown;
  status: string;
  createdAt: string;
};

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,video/mp4";

const SCORE_LABELS: { key: keyof CreativeAnalysis["scores"]; label: string }[] = [
  { key: "visualAppeal", label: "Visual appeal" },
  { key: "productVisibility", label: "Product visibility" },
  { key: "offer", label: "Offer" },
  { key: "callToAction", label: "Call to action" },
  { key: "messaging", label: "Messaging" },
];

const PREDICTED: Record<string, { label: string; tone: Tone }> = {
  ABOVE_AVERAGE: { label: "Above average", tone: "success" },
  AVERAGE: { label: "Average", tone: "info" },
  BELOW_AVERAGE: { label: "Below average", tone: "warning" },
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Analyzing", tone: "ai" },
  ANALYZED: { label: "Analyzed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
};

function asAnalysis(a: unknown): CreativeAnalysis | null {
  return a && typeof a === "object" && "scores" in a ? (a as CreativeAnalysis) : null;
}

function overall(a: CreativeAnalysis) {
  const s = Object.values(a.scores);
  return s.reduce((x, y) => x + y, 0) / s.length;
}

function AssetPreview({ u, className }: { u: UploadRow; className?: string }) {
  const src = u.fileId ? `/api/files/${u.fileId}` : null;
  if (src && u.type === "VIDEO") return <video src={src} muted playsInline preload="metadata" className={cn("bg-muted object-cover", className)} aria-label={u.name} />;
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt={u.name} loading="lazy" className={cn("bg-muted object-cover", className)} />;
  return (
    <div className={cn("flex flex-col gap-2 bg-surface-2 p-4", className)}>
      <FileText className="size-4 text-muted-foreground" aria-hidden />
      <p className="line-clamp-5 text-[12.5px] leading-relaxed text-muted-foreground">{u.copy}</p>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const tone = value >= 7.5 ? "bg-success" : value >= 5 ? "bg-chart-1" : "bg-warning";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular font-semibold">
          {value.toFixed(1)}
          <span className="font-normal text-muted-foreground">/10</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={10} aria-valuenow={value}>
        <div className={cn("h-full rounded-full transition-[width] duration-700", tone)} style={{ width: `${(value / 10) * 100}%` }} />
      </div>
    </div>
  );
}

function AnalysisDetail({ u }: { u: UploadRow }) {
  const a = asAnalysis(u.analysis);
  if (u.status === "FAILED")
    return (
      <div role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" /> The AI couldn&apos;t analyze this creative. Try uploading it again, or paste the ad copy instead.
      </div>
    );
  if (!a)
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <p className="flex items-center gap-2 text-sm text-ai">
          <Loader2 className="size-4 animate-spin" /> AI is scoring this creative against your ad history…
        </p>
        {SCORE_LABELS.map((s) => (
          <div key={s.key} className="space-y-1.5">
            <Bone className="h-3 w-28" />
            <Bone className="h-2 w-full" />
          </div>
        ))}
      </div>
    );
  const pred = PREDICTED[a.predictedPerformance] ?? PREDICTED.AVERAGE;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-baseline gap-1">
          <span className="tabular text-3xl font-semibold tracking-tight">{overall(a).toFixed(1)}</span>
          <span className="text-sm text-muted-foreground">/10 overall</span>
        </div>
        <StatusPill tone={pred.tone}>Predicted: {pred.label}</StatusPill>
      </div>
      <p className="text-sm leading-relaxed">{a.summary}</p>
      <div className="space-y-3">
        {SCORE_LABELS.map((s) => (
          <ScoreBar key={s.key} label={s.label} value={a.scores[s.key]} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-[13px] font-semibold">Strengths</p>
          {a.strengths.length ? (
            <ul className="space-y-1.5 text-[13px]">
              {a.strengths.map((s) => (
                <li key={s} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">No clear strengths identified.</p>
          )}
        </div>
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-[13px] font-semibold">Improvements</p>
          {a.improvements.length ? (
            <ul className="space-y-1.5 text-[13px]">
              {a.improvements.map((s) => (
                <li key={s} className="flex gap-2">
                  <Wand2 className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Nothing major to fix.</p>
          )}
        </div>
      </div>
      <div className="rounded-lg bg-surface-2 p-3 text-[13px]">
        <p className="mb-0.5 font-semibold">Performance context</p>
        <p className="text-muted-foreground">{a.performanceContext}</p>
      </div>
    </div>
  );
}

function UploadDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (u: UploadRow) => void }) {
  const id = useId();
  const [name, setName] = useState("");
  const [copy, setCopy] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const setFileWithPreview = (f: File | null) => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
    setFile(f);
  };

  const reset = () => {
    setName("");
    setCopy("");
    setFileWithPreview(null);
    setFileError(null);
  };

  const pick = (f: File | undefined | null) => {
    setFileError(null);
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) return setFileError("Only PNG, JPEG, WebP images or MP4 videos are supported.");
    if (f.size > MAX_BYTES) return setFileError(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB.`);
    setFileWithPreview(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  };

  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("copy", copy.trim());
      if (file) fd.set("file", file);
      return api<UploadRow>("/api/meta/creatives", { body: fd });
    },
    onSuccess: (u) => {
      toast.success("Creative uploaded", { description: "The AI analysis will be ready in a few seconds." });
      onCreated(JSON.parse(JSON.stringify(u)));
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error("Upload failed", { description: errorMessage(e) }),
  });

  const canSubmit = (!!file || copy.trim().length > 0) && !upload.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !upload.isPending) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-ai" /> Analyze a creative
          </DialogTitle>
          <DialogDescription>Upload an ad image or video and/or paste the ad copy. The AI scores it and compares it with how your past ads performed.</DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) upload.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Winter hoodie — carousel v2" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-file`}>Image or video</Label>
            {file && preview ? (
              <div className="relative overflow-hidden rounded-lg border bg-muted">
                {file.type.startsWith("video/") ? (
                  <video src={preview} className="max-h-56 w-full object-contain" controls muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Selected creative preview" className="max-h-56 w-full object-contain" />
                )}
                <div className="flex items-center justify-between gap-2 border-t bg-card px-3 py-2 text-xs">
                  <span className="truncate">
                    {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <Button type="button" size="icon-xs" variant="ghost" onClick={() => setFileWithPreview(null)} aria-label="Remove file">
                    <X />
                  </Button>
                </div>
              </div>
            ) : (
              <label
                htmlFor={`${id}-file`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pick(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-7 text-center transition-colors hover:bg-muted/50 focus-within:ring-3 focus-within:ring-ring/30",
                  dragging && "border-primary bg-primary/5",
                )}
              >
                <Upload className="size-5 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium">Drop a file or click to browse</span>
                <span className="text-xs text-muted-foreground">PNG, JPEG, WebP or MP4 · up to 8 MB</span>
              </label>
            )}
            <input id={`${id}-file`} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
            {fileError && (
              <p role="alert" className="text-xs text-danger">
                {fileError}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-copy`}>Ad copy</Label>
            <Textarea id={`${id}-copy`} value={copy} onChange={(e) => setCopy(e.target.value)} rows={4} maxLength={3000} placeholder="Paste the primary text, headline and CTA…" />
            <p className="text-xs text-muted-foreground">Optional when you upload a file. Including copy gives a sharper offer and CTA score.</p>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={upload.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={!canSubmit}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {upload.isPending ? "Uploading…" : "Analyze creative"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** AI Creative Analysis: upload → background analysis (polled) → scored feedback. */
export function CreativeAnalyzer({ initial, canManage }: { initial: UploadRow[]; canManage: boolean }) {
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: uploads = initial } = useQuery({
    queryKey: ["creative-uploads"],
    queryFn: async () => (await api<{ uploads: UploadRow[] }>("/api/meta/creatives?range=7d")).uploads,
    initialData: initial,
    refetchInterval: (q) => ((q.state.data ?? []).some((u) => u.status === "PENDING") ? 2500 : false),
  });
  const selected = uploads.find((u) => u.id === selectedId) ?? null;

  // Toast once when a creative we're watching finishes.
  const prevStatus = useRef(new Map(initial.map((u) => [u.id, u.status])));
  useEffect(() => {
    for (const u of uploads) {
      const before = prevStatus.current.get(u.id);
      if (before === "PENDING" && u.status === "ANALYZED") toast.success(`“${u.name}” analyzed`, { description: "Open it to see scores and suggestions." });
      if (before === "PENDING" && u.status === "FAILED") toast.error(`Couldn't analyze “${u.name}”`);
      prevStatus.current.set(u.id, u.status);
    }
  }, [uploads]);

  return (
    <section aria-labelledby="creative-ai-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="creative-ai-title" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Sparkles className="size-4 text-ai" /> AI creative analysis
          </h2>
          <p className="text-[13px] text-muted-foreground">Score new creatives before you spend on them — benchmarked against your own ad history.</p>
        </div>
        {canManage && (
          <Button onClick={() => setUploadOpen(true)}>
            <Upload /> Analyze a creative
          </Button>
        )}
      </div>

      {uploads.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card">
          <EmptyState
            icon={<Wand2 />}
            title="No creatives analyzed yet"
            description="Upload an image, video or ad copy to get a 0–10 score on visual appeal, product visibility, offer, call to action and messaging."
            action={
              canManage ? (
                <Button variant="outline" onClick={() => setUploadOpen(true)}>
                  <Upload /> Analyze your first creative
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
          {uploads.map((u) => {
            const a = asAnalysis(u.analysis);
            const st = STATUS[u.status] ?? STATUS.PENDING;
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(u.id)}
                  className="group flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-foreground/12 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  <div className="relative">
                    <AssetPreview u={u} className="aspect-[16/9] w-full border-b" />
                    <div className="absolute top-2.5 left-2.5 rounded-full bg-card shadow-sm">
                      <CreativeTypePill type={u.type} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{u.name}</p>
                      <p className="text-xs text-muted-foreground">Uploaded <TimeAgo date={u.createdAt} /></p>
                    </div>
                    {a ? (
                      <div className="text-right">
                        <p className="tabular text-lg leading-none font-semibold">{overall(a).toFixed(1)}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{PREDICTED[a.predictedPerformance]?.label}</p>
                      </div>
                    ) : (
                      <StatusPill tone={st.tone}>
                        {u.status === "PENDING" && <Loader2 className="size-3 animate-spin" aria-hidden />}
                        {st.label}
                      </StatusPill>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onCreated={(u) => {
          qc.setQueryData<UploadRow[]>(["creative-uploads"], (old) => [u, ...(old ?? []).filter((x) => x.id !== u.id)]);
          prevStatus.current.set(u.id, u.status);
          setSelectedId(u.id);
        }}
      />

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-6">
                  <span className="truncate">{selected.name}</span>
                  <CreativeTypePill type={selected.type} />
                </DialogTitle>
                <DialogDescription>AI creative analysis · uploaded <TimeAgo date={selected.createdAt} /></DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 md:grid-cols-[220px_1fr]">
                <div className="space-y-3">
                  <AssetPreview u={selected} className="aspect-square w-full rounded-lg border" />
                  {selected.copy && selected.fileId && <p className="line-clamp-6 rounded-lg bg-surface-2 p-3 text-[12.5px] whitespace-pre-line text-muted-foreground">{selected.copy}</p>}
                </div>
                <AnalysisDetail u={selected} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
