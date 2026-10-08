import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutDashboard, Lightbulb, FileText, Clapperboard, CalendarClock, CheckCircle2, BarChart3,
  BookMarked, Cpu, Settings2, ScrollText, Factory,
} from "lucide-react";
import { useStore } from "@/lib/store";

const NAV = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard },
  { to: "/ideias", label: "Ideias de conteúdo", icon: Lightbulb },
  { to: "/roteiros", label: "Roteiros", icon: FileText },
  { to: "/producao", label: "Produção de vídeo", icon: Clapperboard },
  { to: "/fila", label: "Fila de publicação", icon: CalendarClock },
  { to: "/publicados", label: "Vídeos publicados", icon: CheckCircle2 },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/fontes", label: "Fontes", icon: BookMarked },
  { to: "/ia", label: "Configuração de IA", icon: Cpu },
  { to: "/automacao", label: "Automação", icon: Settings2 },
  { to: "/logs", label: "Logs do sistema", icon: ScrollText },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const s = useStore();
  const active = s.videos.filter((v) => v.status !== "READY" && v.status !== "FAILED").length;
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-glow">
            <Factory className="size-4" />
          </div>
          <div>
            <div className="font-display text-sm font-semibold leading-tight">AI Content Factory</div>
            <div className="font-mono text-[10px] text-muted-foreground">pt-BR · política</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent !text-sidebar-accent-foreground" }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="m-3 rounded-lg border border-sidebar-border p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className={active ? "pulse-dot size-2 rounded-full bg-primary" : "size-2 rounded-full bg-muted-foreground"} />
            <span className="text-muted-foreground">{active ? `${active} vídeo(s) em produção` : "Workers ociosos"}</span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">modo protótipo · dados simulados</div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex gap-1 overflow-x-auto border-b bg-sidebar px-3 py-2 md:hidden">
          {NAV.map(({ to, label }) => (
            <Link key={to} to={to} activeOptions={{ exact: to === "/" }} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs text-muted-foreground" activeProps={{ className: "bg-sidebar-accent !text-foreground" }}>
              {label}
            </Link>
          ))}
        </nav>
        <main className="glow-bg flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
