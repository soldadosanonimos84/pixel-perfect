import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, Eye, Film, Heart, Timer, ChevronRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { Panel, Stat, StatusBadge, PageHeader, Bar } from "@/components/app/ui-bits";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => seo("Visão geral", "Painel do pipeline automatizado de vídeos informativos sobre política brasileira."),
  component: Overview,
});

function Overview() {
  const s = useStore();
  const v = s.videos;
  const processing = v.filter((x) => !["READY", "FAILED"].includes(x.status));
  const scheduled = s.publications.filter((p) => p.status === "SCHEDULED");
  const published = s.publications.filter((p) => p.status === "PUBLISHED");
  const views = s.analytics.reduce((a, b) => a + b.views, 0);
  const eng = s.analytics.filter((a) => a.views).map((a) => ((a.likes + a.comments + a.shares + a.saves) / a.views) * 100);
  const ret = s.analytics.filter((a) => a.views).map((a) => a.completion);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const next = [...scheduled].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  const nextVideo = next && v.find((x) => x.id === next.videoId);
  const failedJobs = s.jobs.filter((j) => j.status === "failed").length;

  const count = (...st: string[]) => v.filter((x) => st.includes(x.status)).length;
  const stages = [
    { name: "Pesquisa", n: count("QUEUED", "RESEARCHING") },
    { name: "Roteiro", n: count("SCRIPTING") },
    { name: "Assets", n: count("GENERATING_ASSETS") },
    { name: "Voz", n: count("GENERATING_AUDIO") },
    { name: "Render", n: count("RENDERING", "GENERATING_SUBTITLES") },
    { name: "QA", n: count("QUALITY_CONTROL") },
    { name: "Agendado", n: scheduled.length },
    { name: "Publicado", n: published.length },
  ];

  return (
    <>
      <PageHeader
        title="Visão geral"
        subtitle={`Meta: ${s.settings.videosPerDay} vídeos/dia · ${s.settings.times.join(" · ")} · TikTok`}
        actions={<Link to="/ideias" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-glow">Nova produção</Link>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Produzidos hoje" value={v.filter((x) => x.status === "READY").length} icon={<Film className="size-4" />} />
        <Stat label="Agendados" value={scheduled.length} icon={<CalendarClock className="size-4" />} />
        <Stat label="Publicados" value={published.length} icon={<CheckCircle2 className="size-4" />} />
        <Stat label="Em processamento" value={processing.length} icon={<Activity className="size-4" />} />
        <Stat label="Jobs com falha" value={failedJobs} icon={<AlertTriangle className="size-4" />} />
        <Stat label="Visualizações" value={fmtNum(views)} icon={<Eye className="size-4" />} />
        <Stat label="Engajamento médio" value={`${avg(eng).toFixed(1)}%`} icon={<Heart className="size-4" />} />
        <Stat label="Retenção média" value={`${avg(ret).toFixed(0)}%`} icon={<Timer className="size-4" />} />
        <div className="col-span-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="text-xs text-muted-foreground">Próxima publicação</div>
          {next ? (
            <div className="mt-2">
              <div className="font-display text-lg font-semibold">{fmtDateTime(next.scheduledAt)}</div>
              <div className="truncate text-xs text-muted-foreground">{nextVideo?.title} · TikTok</div>
            </div>
          ) : <div className="mt-2 text-sm text-muted-foreground">Nada agendado</div>}
        </div>
      </div>

      <Panel title="Pipeline de produção" className="mt-6">
        <div className="flex flex-wrap items-stretch gap-1.5 md:flex-nowrap">
          {stages.map((st, i) => (
            <div key={st.name} className="flex min-w-[90px] flex-1 items-center gap-1.5">
              <div className={`flex-1 rounded-lg border p-3 text-center ${st.n ? "border-primary/40 bg-primary/8" : "bg-surface"}`}>
                <div className="font-display text-2xl font-semibold tabular-nums">{st.n}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{st.name}</div>
              </div>
              {i < stages.length - 1 && <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground/50 md:block" />}
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Jobs recentes" action={<Link to="/logs" className="text-xs text-primary">ver logs</Link>}>
          <div className="space-y-3">
            {s.jobs.slice(0, 7).map((j) => (
              <div key={j.id} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{j.type}</span>
                <Bar value={j.progress} />
                <StatusBadge status={j.status} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Em produção agora" action={<Link to="/producao" className="text-xs text-primary">abrir</Link>}>
          {processing.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum vídeo em produção. Gere um roteiro e inicie a produção.</p>
          ) : (
            <div className="space-y-3">
              {processing.map((x) => (
                <div key={x.id} className="flex items-center gap-3">
                  <img src={x.thumbnail} alt="" className="h-14 w-8 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{x.title}</div>
                    <Bar value={x.progress} className="mt-1.5" />
                  </div>
                  <StatusBadge status={x.status} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
