import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useStore, retryJob } from "@/lib/store";
import { PageHeader, Panel, StatusBadge, Bar } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/logs")({
  head: () => seo("Logs do sistema", "Jobs das filas e eventos dos agentes e workers."),
  component: Logs,
});

function Logs() {
  const s = useStore();
  return (
    <>
      <PageHeader title="Logs do sistema" subtitle="Jobs (BullMQ) e eventos dos workers" />
      <Panel title="Jobs">
        <Table>
          <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Fila</TableHead><TableHead>Status</TableHead><TableHead className="w-40">Progresso</TableHead><TableHead>Tentativas</TableHead><TableHead>Criado</TableHead><TableHead>Concluído</TableHead><TableHead>Erro</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {s.jobs.slice(0, 40).map((j) => (
              <TableRow key={j.id}>
                <TableCell className="font-mono text-xs">{j.id}</TableCell>
                <TableCell className="font-mono text-xs">{j.type}</TableCell>
                <TableCell><StatusBadge status={j.status} /></TableCell>
                <TableCell><Bar value={j.progress} /></TableCell>
                <TableCell className="font-mono text-xs">{j.attempts}</TableCell>
                <TableCell className="font-mono text-xs">{fmtDateTime(j.createdAt)}</TableCell>
                <TableCell className="font-mono text-xs">{j.completedAt ? fmtDateTime(j.completedAt) : "—"}</TableCell>
                <TableCell className="text-xs text-destructive">{j.error}</TableCell>
                <TableCell>{j.status === "failed" && <Button size="sm" variant="ghost" onClick={() => retryJob(j.id)}><RotateCcw className="size-3.5" /></Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
      <Panel title="Eventos" className="mt-6">
        <div className="space-y-1 font-mono text-xs">
          {s.logs.map((l) => (
            <div key={l.id} className="grid grid-cols-[110px_60px_150px_1fr] gap-3 border-b border-border/50 py-1.5">
              <span className="text-muted-foreground">{fmtDateTime(l.at)}</span>
              <span className={l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-warning" : "text-info"}>{l.level.toUpperCase()}</span>
              <span className="text-primary">{l.service}</span>
              <span>{l.message}</span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
