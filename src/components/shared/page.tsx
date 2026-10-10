import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

/** Consistent page gutter + max width. */
export function PageContainer({ children, className, wide }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full space-y-6 px-4 py-5 sm:px-6 sm:py-7", wide ? "max-w-[1600px]" : "max-w-[1400px]", className)}>{children}</div>;
}

export type Crumb = { label: string; href?: string };

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: Crumb[];
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5 opacity-60" />}
                {c.href ? (
                  <Link href={c.href} className="hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-foreground/80">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        {eyebrow}
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Card with a title row. The default container for dashboard sections. */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  icon,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  icon?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border bg-card text-card-foreground shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon}
            <div className="min-w-0">
              {title && <h2 className="truncate text-[15px] font-semibold tracking-tight">{title}</h2>}
              {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("px-5 pb-5", !title && !action && "pt-5", contentClassName)}>{children}</div>
    </section>
  );
}

export function DefinitionList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y text-sm", className)}>
      {items.map((it) => (
        <div key={it.label} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="text-muted-foreground">{it.label}</dt>
          <dd className="text-right font-medium">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
