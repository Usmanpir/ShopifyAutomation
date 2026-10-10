"use client";

import { cn } from "cn";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/**
 * Side drawer for previews and quick edits that shouldn't leave the page.
 * Header · scrollable body · sticky footer (primary action on the right).
 * Becomes a bottom sheet on phones.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex w-full flex-col gap-0 p-0 max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:h-[92dvh] max-sm:rounded-t-2xl max-sm:border-t sm:max-w-[520px]",
          className,
        )}
      >
        <div className="flex items-start gap-3 border-b px-5 py-4 pr-12">
          {icon && <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ai-soft text-ai [&_svg]:size-[18px]">{icon}</span>}
          <div className="min-w-0">
            <SheetTitle className="text-base leading-tight font-semibold">{title}</SheetTitle>
            {description ? <SheetDescription className="mt-1 text-[13px]">{description}</SheetDescription> : <SheetDescription className="sr-only">{typeof title === "string" ? title : "Details"}</SheetDescription>}
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-surface-2/50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
