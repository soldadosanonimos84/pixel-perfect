import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Check, RefreshCw, X } from "lucide-react";
import { useStore, regenerate, scheduleVideo } from "@/lib/store";
import { VIDEO_FLOW } from "@/lib/types";
import { PageHeader, Panel, StatusBadge, Bar } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/producao")({
  head: () => seo("Produção de vídeo", "Narração, assets, legendas, renderização e controle de qualidade."),
  component: Production,
});

const AGENTS = ["Research Agent", "Script Agent", "Asset Agent", "Voice Agent", "Video Render Worker", "Subtitle Worker", "Quality Control Agent", "Publishing Worker"];

function Production() {
  const s = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const video = s.videos.find((v) => v.id === (sel ?? s.videos[0]?.id));
  if (!video) return <PageHeader title="Produção de vídeo" subtitle="Nenhum vídeo." />;
  const script = s.scripts.find((x) => x.id === video.scriptId);
  const stageIdx = video.status === "FAILED" ? VIDEO_FLOW.length - 2 : VIDEO_FLOW.indexOf(video.status);
  const isScheduled = s.publications.some((p) => p.videoId === video.id && p.status !== "FAILED");
  const subtitleLines = script ? [script.hook, ...script.body.split(/(?<=[.,])\s/), script.conclusion].slice(0, 6) : [];

  return (
    <>
      <PageHeader title="Produção de vídeo" subtitle="1080 × 1920 · 9:16 · 30–60s · MP4" />
      <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
        {s.videos.map((v) => (
          <button key={v.id} onClick={() => setSel(v.id)} className={`w-40 shrink-0 rounded-lg border p-2 text-left ${v.id === video.id ? "border-primary/50 bg-primary/5" : "bg-card"}`}>
            <div className="truncate text-xs font-medium">{v.title}</div>
            <div className="mt-1.5"><StatusBadge status={v.status} /></div>
            {!["READY", "FAILED"].includes(v.status) && <Bar value={v.progress} className="mt-2" />}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div>
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-2xl border bg-surface">
            <img src={video.thumbnail} alt={video.title} className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-x-3 bottom-16 rounded-md bg-background/80 p-2 text-center text-sm font-semibold backdrop-blur">
              {script?.hook}
            </div>
            <div className="absolute left-3 top-3"><StatusBadge status={video.status} /></div>
            <div className="absolute inset-x-3 bottom-3 font-mono text-[10px] text-foreground/80">
              {video.resolution} · {video.duration}s · MP4
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {video.status === "READY" && (
              <Button disabled={isScheduled} onClick={() => { scheduleVideo(video.id); toast.success("Adicionado à fila de publicação"); }}>
                <CalendarPlus className="size-4" /> {isScheduled ? "Já agendado" : "Agendar publicação"}
              </Button>
            )}
            {(video.status === "FAILED" || video.status === "READY") && (
              <Button variant="secondary" onClick={() => regenerate(video.id)}><RefreshCw className="size-4" /> Regenerar</Button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Panel title="Agentes do pipeline">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {AGENTS.map((a, i) => {
                const done = video.status === "READY" ? i < 7 : i < stageIdx;
                const live = i === stageIdx && !["READY", "FAILED"].includes(video.status);
                const failed = video.status === "FAILED" && i === 6;
                return (
                  <div key={a} className={`rounded-lg border p-2.5 text-xs ${live ? "border-primary/50 bg-primary/8" : failed ? "border-destructive/40 bg-destructive/8" : "bg-surface"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted-foreground">0{i + 1}</span>
                      {done && <Check className="size-3.5 text-success" />}
                      {failed && <X className="size-3.5 text-destructive" />}
                      {live && <span className="pulse-dot size-2 rounded-full bg-primary" />}
                    </div>
                    <div className="mt-1 font-medium">{a}</div>
                  </div>
                );
              })}
            </div>
            {!["READY", "FAILED"].includes(video.status) && <Bar value={video.progress} className="mt-4" />}
          </Panel>

          {video.qa && (
            <Panel title="Controle de qualidade" action={<StatusBadge status={video.qa.passed ? "READY" : "FAILED"} label={video.qa.passed ? "QA PASSED" : "QA FAILED"} />}>
              {video.qa.checks.length === 0 ? <p className="text-sm text-muted-foreground">Todas as verificações aprovadas.</p> : (
                <div className="grid gap-2 md:grid-cols-2">
                  {video.qa.checks.map((c) => (
                    <div key={c.name} className="flex items-start gap-2 rounded-md border bg-surface p-2.5 text-sm">
                      {c.passed ? <Check className="mt-0.5 size-4 text-success" /> : <X className="mt-0.5 size-4 text-destructive" />}
                      <div><div>{c.name}</div><div className="text-xs text-muted-foreground">{c.detail}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}
          {video.error && !video.qa && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{video.error}</div>}

          <div className="grid gap-6 md:grid-cols-2">
            <Panel title="Narração (TTSProvider)">
              <div className="flex h-12 items-end gap-0.5">
                {Array.from({ length: 48 }).map((_, i) => (
                  <div key={i} className="flex-1 rounded-sm bg-primary/60" style={{ height: `${20 + ((i * 37) % 80)}%` }} />
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{s.settings.voiceProvider} · pt-BR · {video.duration}s · espaço reservado para áudio gerado</p>
            </Panel>
            <Panel title="Assets visuais (ImageProvider)">
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 1, 2, 3].map((i) => <img key={i} src={video.thumbnail} alt="" className="aspect-[9/16] rounded object-cover" style={{ objectPosition: `${i * 33}% center` }} />)}
              </div>
            </Panel>
          </div>
          <Panel title="Legendas (TranscriptionProvider)">
            <div className="space-y-1 font-mono text-xs">
              {subtitleLines.map((l, i) => (
                <div key={i} className="flex gap-3"><span className="text-muted-foreground">00:{String(i * 6).padStart(2, "0")}</span><span>{l}</span></div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
