import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "bad" | "info" | "muted" | "live";
const toneCls: Record<Tone, string> = {
  ok: "bg-success/12 text-success border-success/25",
  warn: "bg-warning/12 text-warning border-warning/25",
  bad: "bg-destructive/12 text-destructive border-destructive/30",
  info: "bg-info/12 text-info border-info/25",
  muted: "bg-muted text-muted-foreground border-border",
  live: "bg-primary/12 text-primary border-primary/30",
};

const STATUS_TONE: Record<string, Tone> = {
  READY: "ok", PUBLISHED: "ok", COMPLETED: "ok", completed: "ok", verified: "ok", APPROVED: "ok",
  FAILED: "bad", failed: "bad", disputed: "bad", error: "bad",
  SCHEDULED: "info", RESEARCHED: "info", info: "info",
  pending: "warn", warn: "warn", IDEA: "muted", waiting: "muted", QUEUED: "muted",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? "live";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider", toneCls[tone])}>
      {tone === "live" && <span className="pulse-dot size-1.5 rounded-full bg-primary" />}
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string | undefined; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string | undefined; action?: ReactNode | undefined; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      {title && (
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-display text-sm font-medium">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string | undefined; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="text-muted-foreground/70">{icon}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Bar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${value}%` }} />
    </div>
  );
}
