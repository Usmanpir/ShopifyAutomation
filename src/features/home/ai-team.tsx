import { cn } from "cn";
import Link from "next/link";
import { TimeAgo } from "@/components/shared/time-ago";
import { AgentAvatar } from "@/features/agents/agent-meta";
import type { TeamOverview } from "@/services/home.service";

/** Compact "Your AI Team" status list: who's on, what they did today, what's waiting. */
export function AiTeamList({ team }: { team: TeamOverview }) {
  return (
    <ul className="-mx-2 space-y-0.5">
      {team.map((m) => (
        <li key={m.key}>
          <Link href={m.href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
            <span className="relative">
              <AgentAvatar icon={m.icon} size="sm" muted={!m.active} />
              <span aria-hidden className={cn("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card", m.active ? "bg-success" : "bg-muted-foreground/40")} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">
                {m.name}
                <span className="sr-only">{m.active ? " (active)" : " (paused)"}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {m.active ? (
                  <>
                    {m.tasks24h} task{m.tasks24h === 1 ? "" : "s"} today
                    {m.lastActiveAt && (
                      <>
                        {" "}
                        · last active <TimeAgo date={m.lastActiveAt} />
                      </>
                    )}
                  </>
                ) : (
                  "Paused"
                )}
              </p>
            </div>
            {m.pendingApprovals > 0 && <span className="tabular shrink-0 rounded-full bg-ai-soft px-1.5 py-px text-[11px] font-semibold text-ai">{m.pendingApprovals} to approve</span>}
            {m.failed24h > 0 && <span className="tabular shrink-0 rounded-full bg-danger-soft px-1.5 py-px text-[11px] font-semibold text-danger">{m.failed24h} failed</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
