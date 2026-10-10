import { describe, expect, it, vi } from "vitest";
import { advanceRun, initialRunState, type EngineDeps } from "@/lib/automation/engine";
import { AUTOMATION_TEMPLATES } from "@/lib/automation/templates";
import type { AutomationGraph } from "@/lib/automation/types";
import { validateGraph } from "@/lib/automation/validate";

const cod = AUTOMATION_TEMPLATES.find((t) => t.key === "cod-confirmation")!.graph;
const highRisk = AUTOMATION_TEMPLATES.find((t) => t.key === "high-risk-review")!.graph;

function deps(fields: Record<string, unknown>, now = new Date("2026-10-03T10:00:00Z")): EngineDeps & { clock: { now: Date } } {
  const clock = { now };
  return {
    clock,
    now: () => clock.now,
    resolveField: async (path) => fields[path],
    executeAction: vi.fn(async (node) => ({ detail: `ran ${node.key}` })),
    decide: vi.fn(async () => ({ outcome: "likely_fraud", confidence: 0.9, reasoning: "test" })),
    requestApproval: vi.fn(async () => ({ decisionId: "dec_1" })),
    notify: vi.fn(async () => undefined),
  };
}

const ctx = { event: { type: "ORDER_CREATED", payload: { orderId: "o1" } }, vars: {} };

describe("automation engine", () => {
  it("templates are valid workflows", () => {
    for (const t of AUTOMATION_TEMPLATES) {
      expect(validateGraph(t.graph).errors, t.key).toEqual([]);
    }
  });

  it("COD order: sends confirmation, then pauses on the 2h wait", async () => {
    const d = deps({ "order.paymentMethod": "COD" });
    const s = await advanceRun(cod, initialRunState(ctx), d);
    expect(s.status).toBe("WAITING");
    expect(s.currentNodeKey).toBe("wait_2h");
    expect(s.resumeAt?.toISOString()).toBe("2026-10-03T12:00:00.000Z");
    expect(d.executeAction).toHaveBeenCalledTimes(1);
  });

  it("prepaid order: condition false ends the run", async () => {
    const d = deps({ "order.paymentMethod": "CARD" });
    const s = await advanceRun(cod, initialRunState(ctx), d);
    expect(s.status).toBe("COMPLETED");
    expect(d.executeAction).not.toHaveBeenCalled();
    expect(s.steps.map((x) => x.outcome)).toEqual(["triggered", "false"]);
  });

  it("does not resume before resumeAt, then resumes and re-reads fresh data", async () => {
    const fields: Record<string, unknown> = { "order.paymentMethod": "COD", "order.confirmationStatus": "PENDING" };
    const d = deps(fields);
    let s = await advanceRun(cod, initialRunState(ctx), d);
    d.clock.now = new Date("2026-10-03T11:00:00Z");
    s = await advanceRun(cod, s, d);
    expect(s.status).toBe("WAITING");
    expect(s.currentNodeKey).toBe("wait_2h");

    d.clock.now = new Date("2026-10-03T12:01:00Z");
    s = await advanceRun(cod, s, d);
    expect(s.currentNodeKey).toBe("wait_12h"); // reminder sent, now waiting 12h
    expect(d.executeAction).toHaveBeenCalledTimes(2);

    fields["order.confirmationStatus"] = "CONFIRMED"; // customer replied meanwhile
    d.clock.now = new Date("2026-10-04T01:00:00Z");
    s = await advanceRun(cod, s, d);
    expect(s.status).toBe("COMPLETED");
    expect(d.executeAction).toHaveBeenCalledTimes(2); // no manual review created
  });

  it("AI decision + approval: waits for a human, then follows the approved branch", async () => {
    const d = deps({});
    let s = await advanceRun(highRisk, initialRunState({ ...ctx, event: { type: "ORDER_HIGH_RISK", payload: {} } }), d);
    expect(s.status).toBe("AWAITING_APPROVAL");
    expect(d.requestApproval).toHaveBeenCalledTimes(1);
    expect(s.context.vars.ai).toMatchObject({ outcome: "likely_fraud" });

    s = await advanceRun(highRisk, s, d, { resumeHandle: "approved" });
    expect(s.status).toBe("COMPLETED");
    const executed = (d.executeAction as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].key);
    expect(executed).toEqual(["tag"]);
  });

  it("rejected approval follows the rejected branch", async () => {
    const d = deps({});
    const paused = await advanceRun(highRisk, initialRunState(ctx), d);
    await advanceRun(highRisk, paused, d, { resumeHandle: "rejected" });
    const executed = (d.executeAction as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].key);
    expect(executed).toEqual(["confirm"]);
  });

  it("unknown AI outcome falls back to the default branch", async () => {
    const d = deps({});
    d.decide = vi.fn(async () => ({ outcome: "banana", confidence: 0.2, reasoning: "?" }));
    const s = await advanceRun(highRisk, initialRunState(ctx), d);
    expect(s.status).toBe("COMPLETED");
    expect((d.executeAction as ReturnType<typeof vi.fn>).mock.calls[0][0].key).toBe("confirm");
  });

  it("action failures fail the run with a readable error", async () => {
    const d = deps({ "order.paymentMethod": "COD" });
    d.executeAction = vi.fn(async () => {
      throw new Error("Customer has no valid WhatsApp number");
    });
    const s = await advanceRun(cod, initialRunState(ctx), d);
    expect(s.status).toBe("FAILED");
    expect(s.error).toContain("no valid WhatsApp number");
  });

  it("step limit protects against loops", async () => {
    const loop: AutomationGraph = {
      nodes: [
        { key: "t", type: "TRIGGER", label: "T", config: { event: "ORDER_CREATED", filters: [] } },
        { key: "a", type: "NOTIFICATION", label: "A", config: { title: "x" } },
        { key: "b", type: "NOTIFICATION", label: "B", config: { title: "y" } },
      ],
      edges: [
        { source: "t", target: "a", handle: "next" },
        { source: "a", target: "b", handle: "next" },
        { source: "b", target: "a", handle: "next" },
      ],
    };
    expect(validateGraph(loop).errors.some((e) => /loop/.test(e.message))).toBe(true);
    const s = await advanceRun(loop, initialRunState(ctx), deps({}), { maxSteps: 10 });
    expect(s.status).toBe("FAILED");
    expect(s.error).toMatch(/Step limit/);
  });
});

describe("graph validation", () => {
  it("requires exactly one connected trigger", () => {
    const r = validateGraph({ nodes: [{ key: "a", type: "WAIT", label: "Wait", config: { amount: 1, unit: "hours" } }], edges: [] });
    expect(r.errors.map((e) => e.message)).toContain("Add a trigger to start the workflow");
  });
  it("flags unknown actions and bad configs", () => {
    const r = validateGraph({
      nodes: [
        { key: "t", type: "TRIGGER", label: "T", config: { event: "ORDER_CREATED" } },
        { key: "x", type: "ACTION", label: "X", config: { action: "launch_rockets", params: {} } },
        { key: "w", type: "WAIT", label: "W", config: { amount: -1, unit: "hours" } },
      ],
      edges: [
        { source: "t", target: "x", handle: "next" },
        { source: "x", target: "w", handle: "next" },
      ],
    });
    expect(r.errors.some((e) => e.message.includes("unknown action"))).toBe(true);
    expect(r.errors.some((e) => e.nodeKey === "w")).toBe(true);
  });
});
