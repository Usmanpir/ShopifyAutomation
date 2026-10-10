import { cn } from "cn";
import { brand } from "@/config/brand";

/** Product logo mark — swap here when the product name/brand changes. */
export function BrandMark({ className, withName = true }: { className?: string; withName?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span aria-hidden className="relative grid size-8 place-items-center rounded-[10px] bg-primary text-primary-foreground shadow-sm shadow-primary/30">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" opacity=".35" />
          <path d="M8.5 12.5 11 15l4.5-5" />
        </svg>
      </span>
      {withName && <span className="text-[15px] font-semibold tracking-tight">{brand.name}</span>}
    </span>
  );
}
