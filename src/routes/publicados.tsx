import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/app/ui-bits";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/publicados")({
  head: () => seo("Vídeos publicados", "Histórico de vídeos publicados e desempenho por vídeo."),
  component: Published,
});

function Published() {
  const s = useStore();
  const pubs = s.publications.filter((p) => p.status === "PUBLISHED");
  return (
    <>
      <PageHeader title="Vídeos publicados" subtitle={`${pubs.length} publicação(ões)`} />
      {pubs.length === 0 && <p className="text-sm text-muted-foreground">Nenhum vídeo publicado ainda.</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {pubs.map((p) => {
          const v = s.videos.find((x) => x.id === p.videoId);
          const a = s.analytics.find((x) => x.videoId === p.videoId);
          if (!v) return null;
          return (
            <article key={p.id} className="overflow-hidden rounded-xl border bg-card">
              <div className="relative aspect-[9/16]">
                <img src={v.thumbnail} alt={v.title} loading="lazy" className="size-full object-cover" />
                <div className="absolute left-2 top-2"><StatusBadge status={p.status} label={p.note ? `publicado · ${p.note}` : undefined} /></div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background to-transparent p-3 pt-10">
                  <div className="text-sm font-medium leading-tight">{v.title}</div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">TikTok · {fmtDateTime(p.scheduledAt)}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 p-3 text-center text-xs">
                <div><div className="font-mono text-sm">{fmtNum(a?.views ?? 0)}</div><div className="text-muted-foreground">views</div></div>
                <div><div className="font-mono text-sm">{fmtNum(a?.likes ?? 0)}</div><div className="text-muted-foreground">likes</div></div>
                <div><div className="font-mono text-sm">{a?.completion ?? 0}%</div><div className="text-muted-foreground">conclusão</div></div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
