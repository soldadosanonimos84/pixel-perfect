import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Send, Trash2, Plug } from "lucide-react";
import { useStore, publishNow, cancelPublication } from "@/lib/store";
import { PageHeader, Panel, StatusBadge } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { fmtTime } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/fila")({
  head: () => seo("Fila de publicação", "Calendário de publicação no TikTok com horários padrão 12h, 18h e 21h."),
  component: Queue,
});

const dayKey = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(iso));

function Queue() {
  const s = useStore();
  const pubs = [...s.publications].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const days = Array.from(new Set(pubs.map((p) => dayKey(p.scheduledAt))));

  return (
    <>
      <PageHeader title="Fila de publicação" subtitle={`Horários: ${s.settings.times.join(" · ")} · Plataforma: TikTok`} />
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-info/30 bg-info/8 p-4 text-sm">
        <Plug className="mt-0.5 size-4 text-info" />
        <div>
          <div className="font-medium">Integração TikTok Content Posting API — não conectada</div>
          <div className="text-muted-foreground">As publicações são simuladas. A integração oficial (OAuth no servidor, sem automação de navegador) será conectada no PublishingWorker. Kwai planejado.</div>
        </div>
      </div>
      {days.length === 0 && <p className="text-sm text-muted-foreground">Fila vazia. Agende um vídeo pronto na tela de Produção.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {days.map((d) => (
          <Panel key={d} title={d}>
            <div className="space-y-3">
              {s.settings.times.map((t) => {
                const p = pubs.find((x) => dayKey(x.scheduledAt) === d && fmtTime(x.scheduledAt) === t);
                const v = p && s.videos.find((x) => x.id === p.videoId);
                return (
                  <div key={t} className="flex items-center gap-3">
                    <span className="w-12 font-mono text-xs text-muted-foreground">{t}</span>
                    {p && v ? (
                      <div className="flex flex-1 items-center gap-2 rounded-lg border bg-surface p-2">
                        <img src={v.thumbnail} alt="" className="h-12 w-7 rounded object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs">{v.title}</div>
                          <div className="mt-1 flex items-center gap-1.5"><StatusBadge status={p.status} /><span className="text-[10px] text-muted-foreground">TikTok</span></div>
                        </div>
                        {p.status === "SCHEDULED" && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="size-7" title="Publicar agora (simulado)" onClick={() => { publishNow(p.id); toast("Publicação simulada iniciada"); }}><Send className="size-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="size-7" title="Remover" onClick={() => cancelPublication(p.id)}><Trash2 className="size-3.5" /></Button>
                          </div>
                        )}
                      </div>
                    ) : <div className="flex-1 rounded-lg border border-dashed p-3 text-xs text-muted-foreground/60">livre</div>}
                  </div>
                );
              })}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
