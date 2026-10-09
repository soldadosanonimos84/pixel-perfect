import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Plus } from "lucide-react";
import { useStore, addSource } from "@/lib/store";
import { SOURCE_TYPE_LABEL, type SourceType } from "@/lib/types";
import { PageHeader, Panel, StatusBadge } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/fontes")({
  head: () => seo("Fontes", "Fontes oficiais e checagem de fatos associadas a cada afirmação."),
  component: Sources,
});

function Sources() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", publisher: "", url: "", publishedAt: "", type: "official_government" as SourceType });
  const flagged = s.scripts.filter((x) => x.claims.some((c) => !c.sourceIds.length));

  const submit = () => {
    try { new URL(f.url); } catch { toast.error("URL inválida"); return; }
    if (!f.title || !f.publisher) { toast.error("Preencha título e publicador"); return; }
    addSource({ ...f, publishedAt: f.publishedAt || new Date().toISOString().slice(0, 10), retrievedAt: new Date().toISOString().slice(0, 10), reliability: "pending" });
    setOpen(false); toast.success("Fonte adicionada (verificação pendente)");
  };

  return (
    <>
      <PageHeader
        title="Fontes e checagem"
        subtitle="Toda afirmação política precisa de ao menos uma fonte."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="size-4" /> Nova fonte</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova fonte</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
                <Input placeholder="Publicador" value={f.publisher} onChange={(e) => setF({ ...f, publisher: e.target.value })} />
                <Input placeholder="https://..." value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
                <Input type="date" value={f.publishedAt} onChange={(e) => setF({ ...f, publishedAt: e.target.value })} />
                <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v as SourceType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SOURCE_TYPE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
                <Button className="w-full" onClick={submit}>Adicionar</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {flagged.length > 0 && (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/8 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-warning"><AlertTriangle className="size-4" /> Conteúdo com afirmações sem fonte</div>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {flagged.map((x) => <li key={x.id}>• {s.ideas.find((i) => i.id === x.ideaId)?.title} — {x.claims.filter((c) => !c.sourceIds.length).map((c) => `"${c.text}"`).join(", ")}</li>)}
          </ul>
        </div>
      )}
      <Panel>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Título</TableHead><TableHead>Publicador</TableHead><TableHead>Tipo</TableHead><TableHead>Publicação</TableHead><TableHead>Coleta</TableHead><TableHead>Confiabilidade</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {s.sources.map((x) => (
              <TableRow key={x.id}>
                <TableCell className="max-w-[280px] truncate font-medium">{x.title}</TableCell>
                <TableCell className="text-muted-foreground">{x.publisher}</TableCell>
                <TableCell className="text-xs">{SOURCE_TYPE_LABEL[x.type]}</TableCell>
                <TableCell className="font-mono text-xs">{fmtDate(x.publishedAt + "T12:00:00")}</TableCell>
                <TableCell className="font-mono text-xs">{fmtDate(x.retrievedAt + "T12:00:00")}</TableCell>
                <TableCell><StatusBadge status={x.reliability} /></TableCell>
                <TableCell><a href={x.url} target="_blank" rel="noreferrer"><ExternalLink className="size-4 text-muted-foreground hover:text-primary" /></a></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </>
  );
}
