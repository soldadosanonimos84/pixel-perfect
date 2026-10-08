import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { useStore, updateSettings } from "@/lib/store";
import { CATEGORIES } from "@/lib/types";
import { PageHeader, Panel } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/automacao")({
  head: () => seo("Automação", "Vídeos por dia, horários, qualidade mínima, duração e publicação automática."),
  component: Automation,
});

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b py-4 last:border-0">
      <div><div className="text-sm font-medium">{label}</div>{hint && <div className="text-xs text-muted-foreground">{hint}</div>}</div>
      <div>{children}</div>
    </div>
  );
}

function Automation() {
  const { settings: st } = useStore();
  const [newTime, setNewTime] = useState("09:00");
  return (
    <>
      <PageHeader title="Automação" subtitle="Regras do orquestrador de produção" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Produção">
          <Row label="Vídeos por dia"><Input type="number" min={1} max={12} className="w-20" value={st.videosPerDay} onChange={(e) => updateSettings({ videosPerDay: Number(e.target.value) })} /></Row>
          <Row label="Duração do vídeo" hint="segundos">
            <div className="flex items-center gap-2">
              <Input type="number" className="w-20" value={st.minDuration} onChange={(e) => updateSettings({ minDuration: Number(e.target.value) })} />
              <span className="text-muted-foreground">–</span>
              <Input type="number" className="w-20" value={st.maxDuration} onChange={(e) => updateSettings({ maxDuration: Number(e.target.value) })} />
            </div>
          </Row>
          <Row label="Qualidade mínima" hint={`${st.minQuality} / 100`}>
            <Slider className="w-48" value={[st.minQuality]} min={0} max={100} step={5} onValueChange={([v]) => updateSettings({ minQuality: v })} />
          </Row>
          <Row label="Idioma"><span className="font-mono text-sm">{st.language}</span></Row>
          <Row label="Regenerar após falha no QA"><Switch checked={st.autoRegenerate} onCheckedChange={(v) => updateSettings({ autoRegenerate: v })} /></Row>
          <Row label="Publicação automática" hint="Agenda automaticamente vídeos aprovados no QA"><Switch checked={st.autoPublish} onCheckedChange={(v) => updateSettings({ autoPublish: v })} /></Row>
        </Panel>
        <div className="space-y-6">
          <Panel title="Horários de publicação">
            <div className="flex flex-wrap gap-2">
              {st.times.map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-md border bg-surface px-2.5 py-1 font-mono text-sm">
                  {t}
                  <button onClick={() => updateSettings({ times: st.times.filter((x) => x !== t) })} aria-label={`Remover ${t}`}><X className="size-3.5 text-muted-foreground hover:text-destructive" /></button>
                </span>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Input type="time" className="w-32" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
              <Button variant="secondary" onClick={() => { if (!st.times.includes(newTime)) updateSettings({ times: [...st.times, newTime].sort() }); }}>Adicionar</Button>
              <Button variant="ghost" onClick={() => { updateSettings({ times: ["12:00", "18:00", "21:00"], videosPerDay: 3 }); toast.success("Padrão restaurado"); }}>Padrão</Button>
            </div>
          </Panel>
          <Panel title="Categorias de conteúdo">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const on = st.categories.includes(c);
                return (
                  <button key={c} onClick={() => updateSettings({ categories: on ? st.categories.filter((x) => x !== c) : [...st.categories, c] })}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-primary/50 bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent"}`}>
                    {c}
                  </button>
                );
              })}
            </div>
          </Panel>
          <Panel title="Diretrizes editoriais (fixas)">
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>• Conteúdo informativo; sem persuasão a favor ou contra candidatos, partidos ou ideologias.</li>
              <li>• Toda afirmação factual exige fonte; nada de estatísticas, citações ou pesquisas inventadas.</li>
              <li>• Fatos e análises são rotulados separadamente.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
