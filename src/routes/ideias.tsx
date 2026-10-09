import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { useStore, addIdea, advanceIdea, generateScript } from "@/lib/store";
import { CATEGORIES, IDEA_FLOW } from "@/lib/types";
import { PageHeader, StatusBadge } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/ideias")({
  head: () => seo("Ideias de conteúdo", "Tópicos de informação política em pesquisa, aprovação e produção."),
  component: Ideas,
});

function Ideas() {
  const s = useStore();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", topic: "", category: CATEGORIES[0]!, description: "", sourceId: s.sources[0]?.id ?? "" });

  const submit = () => {
    if (!f.title || !f.sourceId) { toast.error("Título e fonte são obrigatórios."); return; }
    const src = s.sources.find((x) => x.id === f.sourceId)!;
    addIdea({ ...f, publishedAt: src.publishedAt, relevance: 50 + Math.round(Math.random() * 40) });
    setOpen(false);
    setF({ ...f, title: "", topic: "", description: "" });
    toast.success("Ideia adicionada");
  };

  return (
    <>
      <PageHeader
        title="Ideias de conteúdo"
        subtitle="IDEA → RESEARCHED → APPROVED → SCRIPTING → PRODUCTION → COMPLETED"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4" /> Nova ideia</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova ideia</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
                <Input placeholder="Tópico" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} />
                <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={f.sourceId} onValueChange={(v) => setF({ ...f, sourceId: v })}>
                  <SelectTrigger><SelectValue placeholder="Fonte" /></SelectTrigger>
                  <SelectContent>{s.sources.map((x) => <SelectItem key={x.id} value={x.id}>{x.publisher} — {x.title}</SelectItem>)}</SelectContent>
                </Select>
                <Textarea placeholder="Descrição factual" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
                <Button className="w-full" onClick={submit}>Adicionar</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {s.ideas.map((i) => {
          const src = s.sources.find((x) => x.id === i.sourceId);
          const idx = IDEA_FLOW.indexOf(i.status);
          return (
            <article key={i.id} className="flex flex-col rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{i.category}</span>
                <StatusBadge status={i.status} />
              </div>
              <h3 className="mt-2 font-display text-base font-semibold">{i.title}</h3>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{i.description}</p>
              <div className="mt-3 flex gap-0.5">
                {IDEA_FLOW.map((st, k) => <div key={st} className={`h-1 flex-1 rounded-full ${k <= idx ? "bg-primary" : "bg-muted"}`} />)}
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div>Tópico: <span className="text-foreground">{i.topic}</span> · Relevância <span className="font-mono text-primary">{i.relevance}</span></div>
                {src && <a href={src.url} target="_blank" rel="noreferrer" className="block truncate underline-offset-2 hover:underline">Fonte: {src.publisher} ({fmtDate(src.publishedAt)})</a>}
                <div>Criado em {fmtDate(i.createdAt)}</div>
              </div>
              <div className="mt-4 flex gap-2">
                {idx < 2 && <Button size="sm" variant="secondary" onClick={() => advanceIdea(i.id)}>Avançar <ArrowRight className="size-3.5" /></Button>}
                {i.status === "APPROVED" && (
                  <Button size="sm" onClick={() => { generateScript(i.id); toast.success("Roteiro gerado"); nav({ to: "/roteiros" }); }}>
                    <Sparkles className="size-3.5" /> Gerar roteiro
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
