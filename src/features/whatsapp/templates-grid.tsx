import { FileText } from "lucide-react";
import { Fragment } from "react";
import { StatusPill, type Tone } from "@/components/shared/status";
import { titleCase } from "@/lib/format";

export type TemplateRow = { id: string; name: string; language: string; category: string; body: string; variables: string[]; status: string; updatedAt: string };

const CATEGORY_TONE: Record<string, Tone> = { UTILITY: "info", MARKETING: "ai", AUTHENTICATION: "neutral" };
const STATUS: Record<string, { label: string; tone: Tone }> = {
  APPROVED: { label: "Approved", tone: "success" },
  PENDING: { label: "In review", tone: "warning" },
  IN_APPEAL: { label: "In appeal", tone: "warning" },
  REJECTED: { label: "Rejected", tone: "danger" },
  PAUSED: { label: "Paused", tone: "neutral" },
  DISABLED: { label: "Disabled", tone: "neutral" },
};
const LANGUAGES: Record<string, string> = { en: "English", ur: "Urdu", ur_PK: "Urdu", en_US: "English (US)", en_GB: "English (UK)" };

/** Renders a template body with {{n}} placeholders highlighted (and titled with the variable name). */
function TemplateBody({ body, variables }: { body: string; variables: string[] }) {
  const parts = body.split(/(\{\{\s*\d+\s*\}\})/g);
  return (
    <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
      {parts.map((p, i) => {
        const m = p.match(/^\{\{\s*(\d+)\s*\}\}$/);
        if (!m) return <Fragment key={i}>{p}</Fragment>;
        const name = variables[Number(m[1]) - 1];
        return (
          <mark key={i} title={name ? `{{${m[1]}}} = ${name}` : undefined} className="rounded bg-brand-soft px-1 py-px font-mono text-[11.5px] font-medium text-brand">
            {`{{${m[1]}}}`}
          </mark>
        );
      })}
    </p>
  );
}

export function TemplatesGrid({ templates }: { templates: TemplateRow[] }) {
  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border bg-card px-6 py-14 text-center">
        <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary/8 text-primary ring-1 ring-primary/10">
          <FileText className="size-6" />
        </div>
        <h3 className="text-[15px] font-semibold">No message templates yet</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Templates approved in WhatsApp Business Manager sync here. They&apos;re used for order confirmations and messages outside the 24-hour window.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {templates.map((t) => {
        const st = STATUS[t.status] ?? { label: titleCase(t.status), tone: "neutral" as Tone };
        return (
          <article key={t.id} className="flex flex-col rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <header className="flex items-start justify-between gap-3 px-4 pt-4">
              <div className="min-w-0">
                <h3 className="truncate font-mono text-[13px] font-semibold">{t.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{LANGUAGES[t.language] ?? t.language.toUpperCase()}</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                <StatusPill tone={CATEGORY_TONE[t.category] ?? "neutral"} dot={false}>
                  {titleCase(t.category)}
                </StatusPill>
                <StatusPill tone={st.tone}>{st.label}</StatusPill>
              </div>
            </header>
            <div className="mx-4 mt-3 flex-1 rounded-xl rounded-tl-sm border bg-surface-2/70 px-3.5 py-3">
              <TemplateBody body={t.body} variables={t.variables} />
            </div>
            <footer className="px-4 pt-3 pb-4">
              {t.variables.length > 0 ? (
                <dl className="flex flex-wrap gap-1.5 text-[11.5px]">
                  {t.variables.map((v, i) => (
                    <div key={i} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5">
                      <dt className="font-mono text-brand">{`{{${i + 1}}}`}</dt>
                      <dd className="text-muted-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-[11.5px] text-muted-foreground">No variables</p>
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
