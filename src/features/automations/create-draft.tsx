"use client";

import { Loader2, Workflow } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/states";
import { defaultConfig } from "@/lib/automation/describe";
import type { AutomationGraph } from "@/lib/automation/types";
import { api, errorMessage } from "@/lib/client/api";

const STARTER: AutomationGraph = {
  nodes: [{ key: "trigger", type: "TRIGGER", label: "New order", config: defaultConfig("TRIGGER"), position: { x: 280, y: 40 } }],
  edges: [],
};

/** Creates an empty draft (single trigger) and opens it in the builder. */
export function CreateDraft() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    try {
      const a = await api<{ id: string }>("/api/automations", { body: { name: "Untitled automation", description: null, graph: STARTER } });
      router.replace(`/automations/${a.id}?new=1`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <ErrorState title="Couldn't create the automation" description={error} onRetry={() => void create()} />
        <div className="text-center">
          <Button asChild variant="link">
            <Link href="/automations">Back to automations</Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-ai-soft text-ai">
        <Workflow className="size-6" />
      </span>
      <div>
        <p className="text-[15px] font-semibold">Setting up your workflow…</p>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Creating a draft with a trigger
        </p>
      </div>
    </div>
  );
}
