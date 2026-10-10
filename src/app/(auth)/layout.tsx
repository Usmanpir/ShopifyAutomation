import { Bot, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/layout/brand-mark";
import { brand } from "@/config/brand";
import { getAuth } from "@/lib/auth/session";

const POINTS = [
  { icon: MessageCircle, title: "COD confirmations on autopilot", text: "WhatsApp confirms every order and answers customers 24/7." },
  { icon: Bot, title: "AI agents with guardrails", text: "Sensitive actions always wait for your approval." },
  { icon: Sparkles, title: "Answers, not dashboards", text: "Ask “why did revenue drop?” and get the drivers." },
];

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getAuth()) redirect("/dashboard");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <BrandMark />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-xs text-muted-foreground lg:text-left">
          © {new Date().getFullYear()} {brand.name} · <ShieldCheck className="inline size-3.5" /> Encrypted credentials · Role-based access
        </p>
      </div>
      <aside className="relative hidden overflow-hidden bg-[oklch(0.22_0.06_277)] text-white lg:flex lg:flex-col lg:justify-center lg:p-14">
        <div aria-hidden className="absolute -top-32 -right-24 size-[520px] rounded-full bg-[oklch(0.55_0.22_285/0.35)] blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 -left-20 size-[420px] rounded-full bg-[oklch(0.6_0.18_250/0.3)] blur-3xl" />
        <div className="relative max-w-lg">
          <p className="text-sm font-medium tracking-wide text-white/60 uppercase">{brand.tagline}</p>
          <h2 className="mt-4 text-4xl leading-tight font-semibold tracking-tight">Run your entire store from one AI command center.</h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <p.icon className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="text-sm text-white/65">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-12 rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/10 backdrop-blur">
            <p className="text-xs font-medium tracking-wide text-white/50 uppercase">AI recommendation</p>
            <p className="mt-2 text-sm leading-relaxed text-white/90">
              Black Tracksuit is selling <span className="font-semibold">2.4× faster</span> than its 30-day average. 18 units left — about 1.6 days of stock.
            </p>
            <p className="mt-3 text-xs text-white/50">Suggested: review replenishment</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
