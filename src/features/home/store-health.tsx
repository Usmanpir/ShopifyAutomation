import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { HealthArea, HealthStatus } from "@/services/home.service";

const STATUS: Record<HealthStatus, { label: string; dot: string; text: string }> = {
  good: { label: "Healthy", dot: "bg-success", text: "text-success" },
  watch: { label: "Watch", dot: "bg-warning", text: "text-warning" },
  act: { label: "Needs action", dot: "bg-danger", text: "text-danger" },
};

/** Store health by area — one measured number per area, linked to its evidence. */
export function StoreHealth({ areas }: { areas: HealthArea[] }) {
  const worst = areas.some((a) => a.status === "act") ? "act" : areas.some((a) => a.status === "watch") ? "watch" : "good";
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-[13px] text-muted-foreground">
        <span className={cn("size-2 rounded-full", STATUS[worst].dot)} aria-hidden />
        {worst === "good" ? "Everything looks healthy." : worst === "watch" ? "A few things to keep an eye on." : "Some areas need action."}
      </p>
      <ul className="-mx-2 divide-y divide-border/60">
        {areas.map((a) => (
          <li key={a.key}>
            <Link href={a.href} className="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", STATUS[a.status].dot)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="font-medium">{a.label}</span>
                  <span className={cn("shrink-0 text-[11.5px] font-medium", STATUS[a.status].text)}>{STATUS[a.status].label}</span>
                </p>
                <p className="truncate text-[13px]">{a.headline}</p>
                <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
              </div>
              <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
