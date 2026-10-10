"use client";

import {
  Clapperboard,
  Image as ImageIcon,
  Images,
  Lightbulb,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/page";
import { ProductImage } from "@/components/shared/product-image";
import { EmptyState } from "@/components/shared/states";
import { StatusPill, type Tone } from "@/components/shared/status";
import { useFormat } from "@/components/store-context";
import type { AdMetrics } from "@/services/meta.service";
import { Roas } from "./campaigns-table";

export type CreativeRow = {
  id: string;
  name: string;
  campaignId: string;
  creativeType: string;
  thumbnailUrl: string | null;
  headline: string | null;
  primaryText: string | null;
  status: string;
  campaign: { name: string };
  metrics: AdMetrics;
};

export const CREATIVE_TYPE: Record<
  string,
  { label: string; tone: Tone; icon: typeof ImageIcon }
> = {
  IMAGE: { label: "Static", tone: "info", icon: ImageIcon },
  VIDEO: { label: "Video", tone: "ai", icon: Clapperboard },
  CAROUSEL: { label: "Carousel", tone: "brand", icon: Images },
  COPY: { label: "Copy", tone: "neutral", icon: Lightbulb },
};

export function CreativeTypePill({ type }: { type: string }) {
  const m = CREATIVE_TYPE[type] ?? CREATIVE_TYPE.COPY;
  return (
    <StatusPill tone={m.tone} dot={false}>
      <m.icon className="size-3" aria-hidden />
      {m.label}
    </StatusPill>
  );
}

function Metric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className="tabular truncate text-[13px] font-semibold">{children}</dd>
    </div>
  );
}

export function CreativeCards({ creatives }: { creatives: CreativeRow[] }) {
  const f = useFormat();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? creatives : creatives.slice(0, 12);
  if (!creatives.length)
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={<ImageIcon />}
          title="No creative delivery in this period"
          description="Ads with impressions in the selected date range will appear here. Try a longer range."
        />
      </div>
    );
  return (
    <div className="space-y-4">
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
        {visible.map((c, i) => (
          <li
            key={c.id}
            className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-foreground/12 hover:shadow-sm"
          >
            <div className="relative">
              <ProductImage
                src={c.thumbnailUrl}
                alt={c.name}
                className="block aspect-[16/10] w-full border-0 border-b"
                rounded="rounded-none"
              />
              <div className="absolute top-2.5 left-2.5 flex gap-1.5 rounded-full bg-card shadow-sm">
                <CreativeTypePill type={c.creativeType} />
              </div>
              {i < 3 && (
                <span className="absolute top-2.5 right-2.5 rounded-full bg-card/90 px-2 py-0.5 text-[11px] font-semibold shadow-sm backdrop-blur">
                  #{i + 1} by revenue
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" title={c.name}>
                  {c.name}
                </p>
                <Link
                  href={`/ads/campaigns/${c.campaignId}`}
                  className="block truncate text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  {c.campaign.name}
                </Link>
                {c.headline && (
                  <p className="mt-1.5 line-clamp-1 text-[12.5px] text-muted-foreground italic">
                    “{c.headline}”
                  </p>
                )}
              </div>
              <dl className="mt-auto grid grid-cols-3 gap-x-2 gap-y-2.5 rounded-lg bg-surface-2 p-3">
                <Metric label="Spend">
                  {f.money(c.metrics.spend, { compact: true })}
                </Metric>
                <Metric label="Revenue">
                  {f.money(c.metrics.revenue, { compact: true })}
                </Metric>
                <Metric label="ROAS">
                  <Roas value={c.metrics.roas} spend={c.metrics.spend} />
                </Metric>
                <Metric label="Purchases">
                  {f.number(c.metrics.purchases)}
                </Metric>
                <Metric label="CTR">{c.metrics.ctr.toFixed(2)}%</Metric>
                <Metric label="CVR">
                  {c.metrics.conversionRate.toFixed(1)}%
                </Metric>
              </dl>
            </div>
          </li>
        ))}
      </ul>
      {creatives.length > 12 && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show top 12" : `Show all ${creatives.length} creatives`}
          </Button>
        </div>
      )}
    </div>
  );
}

type TypeAgg = { type: string; metrics: AdMetrics };

/** Video vs static vs carousel — ROAS and conversion rate side by side. */
export function CreativeTypeComparison({
  byType,
  rangeLabel,
}: {
  byType: TypeAgg[];
  rangeLabel: string;
}) {
  const f = useFormat();
  const rows = byType.filter((t) => t.metrics.impressions > 0);
  const video = byType.find((t) => t.type === "VIDEO")?.metrics;
  const image = byType.find((t) => t.type === "IMAGE")?.metrics;
  const maxRoas = Math.max(...rows.map((r) => r.metrics.roas), 0.01);
  const maxCvr = Math.max(...rows.map((r) => r.metrics.conversionRate), 0.01);
  const best = [...rows].sort((a, b) => b.metrics.roas - a.metrics.roas)[0];

  let headline: string | null = null;
  if (video?.clicks && image?.clicks) {
    const diff = video.conversionRate - image.conversionRate;
    headline = `Video creatives convert at ${video.conversionRate.toFixed(1)}% vs ${image.conversionRate.toFixed(1)}% for static${Math.abs(diff) >= 0.1 ? ` — ${Math.abs((diff / (image.conversionRate || 1)) * 100).toFixed(0)}% ${diff > 0 ? "higher" : "lower"}` : ""}.`;
  }

  const Bar = ({
    value,
    max,
    label,
  }: {
    value: number;
    max: number;
    label: string;
  }) => (
    <div className="flex items-center gap-2">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        role="presentation"
      >
        <div
          className="h-full rounded-full bg-chart-1 transition-[width] duration-500"
          style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
        />
      </div>
      <span className="tabular w-14 text-right text-[13px] font-semibold">
        {label}
      </span>
    </div>
  );

  return (
    <SectionCard
      title="Creative format comparison"
      description={`${rangeLabel} · aggregated across all ads`}
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No delivery in this period.
        </p>
      ) : (
        <div className="space-y-5">
          {headline && (
            <p className="flex items-start gap-2 rounded-lg bg-ai-soft px-3 py-2.5 text-sm text-ai">
              <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {headline}
                {best && (
                  <span className="text-ai/80">
                    {" "}
                    {CREATIVE_TYPE[best.type]?.label ?? best.type} leads on
                    return at {best.metrics.roas.toFixed(2)}× ROAS.
                  </span>
                )}
              </span>
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">
                ROAS and conversion rate by creative format
              </caption>
              <thead>
                <tr className="text-left text-[12px] text-muted-foreground">
                  <th scope="col" className="pb-2 font-medium">
                    Format
                  </th>
                  <th scope="col" className="w-[32%] pb-2 font-medium">
                    ROAS
                  </th>
                  <th scope="col" className="w-[32%] pb-2 pl-4 font-medium">
                    Conversion rate
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Spend
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.type}>
                    <td className="py-3 pr-3">
                      <CreativeTypePill type={r.type} />
                    </td>
                    <td className="py-3">
                      <Bar
                        value={r.metrics.roas}
                        max={maxRoas}
                        label={`${r.metrics.roas.toFixed(2)}×`}
                      />
                    </td>
                    <td className="py-3 pl-4">
                      <Bar
                        value={r.metrics.conversionRate}
                        max={maxCvr}
                        label={`${r.metrics.conversionRate.toFixed(1)}%`}
                      />
                    </td>
                    <td className="tabular py-3 pl-3 text-right text-muted-foreground">
                      {f.money(r.metrics.spend, { compact: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
