import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Play, RotateCcw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { localApi, LOCAL_API, STAGES, type Health, type LocalJob } from "@/lib/local-api";
import { Panel, StatusBadge } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_MAP: Record<string, string> = { approved: "READY", rejected: "FAILED", failed: "FAILED", queued: "QUEUED" };
const ORDER = ["queued", "generating_script", "generating_voice", "rendering", "quality_check", "approved"];

export function LocalFactory() {
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);
  const [jobs, setJobs] = useState<LocalJob[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setJobs(await localApi.jobs());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  const checkHealth = useCallback(async () => {
    try { setHealth(await localApi.health()); setOffline(false); } catch { setHealth(null); setOffline(true); }
  }, []);

  useEffect(() => {
    void checkHealth();
    void refresh();
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [checkHealth, refresh]);

  const submit = async () => {
    setBusy(true);
    try {
      const j = await localApi.create(topic);
      setTopic(""); setSel(j.id); toast.success("Job enviado para a fila local");
      void refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const job = jobs.find((j) => j.id === sel) ?? jobs[0];

  return (
    <Panel title="Fábrica local (real)" action={<StatusBadge status={offline ? "FAILED" : "READY"} label={offline ? "DESCONECTADO" : "CONECTADO"} />} className="mb-8">
      {offline ? (
        <div className="space-y-3 text-sm">
          <p>Não foi possível acessar o servidor local em <code className="font-mono text-primary">{LOCAL_API}</code>. Nenhum vídeo é gerado sem ele — não há resultado simulado aqui.</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>No seu PC Windows, abra o PowerShell na pasta do projeto.</li>
            <li>Primeira vez: <code className="font-mono">powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1</code></li>
            <li>Verifique dependências: <code className="font-mono">npm run local:doctor</code></li>
            <li>Terminal 1: <code className="font-mono">npm run local:api</code> · Terminal 2: <code className="font-mono">npm run local:worker</code></li>
            <li>Abra o painel em <code className="font-mono">http://localhost:8080</code> (npm run dev) para que o navegador alcance o servidor local.</li>
          </ol>
          <Button size="sm" variant="secondary" onClick={() => { void checkHealth(); void refresh(); }}>Testar conexão</Button>
        </div>
      ) : (
        <div className="space-y-5">
          {health && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {health.diagnostics.map((d) => (
                <div key={d.name} className="flex items-start gap-2 rounded-md border bg-surface p-2 text-xs">
                  {d.ok ? <Check className="mt-0.5 size-3.5 text-success" /> : <X className="mt-0.5 size-3.5 text-destructive" />}
                  <div><div className="font-medium">{d.name}</div><div className="text-muted-foreground">{d.detail}</div>{!d.ok && d.fix && <div className="text-warning">{d.fix}</div>}</div>
                </div>
              ))}
            </div>
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Tema do vídeo (ex.: Como funciona o segundo turno)" maxLength={200} />
            <Button type="submit" disabled={busy || topic.trim().length < 5}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Gerar vídeo</Button>
          </form>

          {jobs.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum job ainda.</p> : (
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <div className="max-h-96 space-y-1.5 overflow-y-auto">
                {jobs.map((j) => (
                  <button key={j.id} onClick={() => setSel(j.id)} className={`w-full rounded-md border p-2 text-left text-xs ${j.id === job?.id ? "border-primary/50 bg-primary/5" : "bg-surface"}`}>
                    <div className="truncate font-medium">{j.topic}</div>
                    <div className="mt-1 flex items-center justify-between"><StatusBadge status={STATUS_MAP[j.status] ?? j.status} label={j.status} /><span className="font-mono text-muted-foreground">{new Date(j.created_at).toLocaleString("pt-BR")}</span></div>
                  </button>
                ))}
              </div>
              {job && <JobDetail job={job} onRefresh={refresh} publishingEnabled={!!health?.publishingEnabled} />}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function JobDetail({ job, onRefresh, publishingEnabled }: { job: LocalJob; onRefresh: () => Promise<void>; publishingEnabled: boolean }) {
  const idx = ORDER.indexOf(job.status);
  const ended = ["approved", "rejected", "failed"].includes(job.status);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {STAGES.map((s, i) => {
          const done = job.status === "approved" || job.status === "rejected" ? true : idx > i + 1;
          const live = job.status === s.key;
          return (
            <div key={s.key} className={`rounded-md border p-2 text-xs ${live ? "border-primary/50 bg-primary/8" : "bg-surface"}`}>
              <div className="flex justify-between"><span className="font-mono text-muted-foreground">0{i + 1}</span>{done && <Check className="size-3.5 text-success" />}{live && <Loader2 className="size-3.5 animate-spin text-primary" />}</div>
              <div className="mt-1 font-medium">{s.label}</div>
            </div>
          );
        })}
      </div>
      {job.error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">{job.error}</div>}
      {job.qc && (
        <div className="grid gap-1.5 md:grid-cols-2">
          {job.qc.map((c) => (
            <div key={c.name} className="flex gap-2 rounded-md border bg-surface p-2 text-xs">
              {c.passed ? <Check className="size-3.5 text-success" /> : <X className="size-3.5 text-destructive" />}<div><div>{c.name}</div><div className="text-muted-foreground">{c.detail}</div></div>
            </div>
          ))}
        </div>
      )}
      {job.hasVideo && job.status === "approved" && (
        <video src={localApi.videoUrl(job.id)} controls className="aspect-[9/16] w-full max-w-[220px] rounded-lg border bg-surface" />
      )}
      <div className="flex flex-wrap gap-2">
        {job.hasScript && <Button size="sm" variant="secondary" asChild><a href={localApi.scriptUrl(job.id)} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Roteiro JSON</a></Button>}
        {ended && job.status !== "approved" && <Button size="sm" variant="secondary" onClick={async () => { try { await localApi.retry(job.id); await onRefresh(); } catch (e) { toast.error((e as Error).message); } }}><RotateCcw className="size-3.5" /> Tentar novamente</Button>}
        {job.status === "approved" && (
          <Button size="sm" variant="outline" title={publishingEnabled ? "" : "Publicação desativada"} onClick={async () => {
            try { await localApi.publish(job.id); } catch (e) { toast.error(`Publicação bloqueada: ${(e as Error).message}`); }
            const r = await fetch(`${LOCAL_API}/jobs/${job.id}/publish`, { method: "POST" }).then((x) => x.json() as Promise<{ reasons?: string[] }>).catch(() => null);
            if (r?.reasons?.length) toast.warning(r.reasons.join(" "));
          }}><Send className="size-3.5" /> Verificar publicação TikTok</Button>
        )}
      </div>
      <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Logs ({job.logs.length})</summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-surface p-2 font-mono">{job.logs.join("\n")}</pre>
      </details>
    </div>
  );
}
