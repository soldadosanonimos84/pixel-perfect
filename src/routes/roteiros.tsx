import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Clapperboard, ExternalLink } from "lucide-react";
import { useStore, produceVideo, updateScript } from "@/lib/store";
import { PageHeader, Panel, StatusBadge } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/roteiros")({
  head: () => seo("Roteiros", "Roteiros estruturados com afirmações factuais e fontes atribuídas."),
  component: Scripts,
});

function Scripts() {
  const s = useStore();
  const nav = useNavigate();
  const [sel, setSel] = useState<string | null>(null);
  const script = s.scripts.find((x) => x.id === (sel ?? s.scripts[0]?.id));
  if (!script) return <PageHeader title="Roteiros" subtitle="Nenhum roteiro ainda. Aprove uma ideia e gere um roteiro." />;
  const idea = s.ideas.find((i) => i.id === script.ideaId);
  const unsupported = script.claims.filter((c) => c.sourceIds.length === 0);
  const json = {
    hook: script.hook, body: script.body, conclusion: script.conclusion, cta: script.cta,
    estimated_duration: script.estimatedDuration, sources: script.sourceIds,
    factual_claims: script.claims.map((c) => ({ text: c.text, kind: c.kind, sources: c.sourceIds })),
  };

  return (
    <>
      <PageHeader title="Roteiros" subtitle="Saída estruturada do Script Agent — factual, sem persuasão eleitoral." />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr_320px]">
        <div className="space-y-2">
          {s.scripts.map((x) => {
            const i = s.ideas.find((k) => k.id === x.ideaId);
            const bad = x.claims.some((c) => !c.sourceIds.length);
            return (
              <button key={x.id} onClick={() => setSel(x.id)} className={`w-full rounded-lg border p-3 text-left transition-colors ${x.id === script.id ? "border-primary/50 bg-primary/5" : "bg-card hover:bg-accent"}`}>
                <div className="truncate text-sm font-medium">{i?.title}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{x.estimatedDuration}s</span>
                  {bad && <span className="flex items-center gap-1 text-warning"><AlertTriangle className="size-3" /> sem fonte</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {unsupported.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {unsupported.length} afirmação(ões) sem fonte. Adicione referências ou remova antes da produção.
            </div>
          )}
          <Panel title={idea?.title}>
            <div className="space-y-4">
              {(["hook", "body", "conclusion", "cta"] as const).map((k) => (
                <div key={k}>
                  <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{k}</label>
                  <Textarea className="mt-1" rows={k === "body" ? 4 : 2} value={script[k]} onChange={(e) => updateScript(script.id, { [k]: e.target.value })} />
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Afirmações factuais">
            <ul className="space-y-2">
              {script.claims.map((c, n) => (
                <li key={n} className="flex items-start justify-between gap-3 rounded-md border bg-surface p-2.5 text-sm">
                  <span>{c.text}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusBadge status={c.kind === "fact" ? "info" : "warn"} label={c.kind === "fact" ? "fato" : "análise"} />
                    {c.sourceIds.length ? <StatusBadge status="verified" label={`${c.sourceIds.length} fonte`} /> : (
                      <button className="rounded-md border border-destructive/30 px-2 py-0.5 text-[10.5px] text-destructive" onClick={() => updateScript(script.id, { claims: script.claims.filter((_, k) => k !== n) })}>remover</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="JSON estruturado">
            <pre className="max-h-72 overflow-auto rounded-md bg-surface p-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">{JSON.stringify(json, null, 2)}</pre>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Fontes utilizadas">
            <div className="space-y-3">
              {script.sourceIds.map((id) => {
                const src = s.sources.find((x) => x.id === id);
                if (!src) return null;
                return (
                  <a key={id} href={src.url} target="_blank" rel="noreferrer" className="block rounded-md border bg-surface p-3 hover:border-primary/40">
                    <div className="flex items-center justify-between"><StatusBadge status={src.reliability} /><ExternalLink className="size-3.5 text-muted-foreground" /></div>
                    <div className="mt-2 text-sm">{src.title}</div>
                    <div className="text-xs text-muted-foreground">{src.publisher}</div>
                  </a>
                );
              })}
              {!script.sourceIds.length && <p className="text-sm text-destructive">Nenhuma fonte associada.</p>}
            </div>
          </Panel>
          <Button className="w-full" onClick={() => { produceVideo(script.id); toast.success("Produção iniciada"); nav({ to: "/producao" }); }}>
            <Clapperboard className="size-4" /> Enviar para produção
          </Button>
        </div>
      </div>
    </>
  );
}
