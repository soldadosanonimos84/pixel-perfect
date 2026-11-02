import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Pause, Play, RotateCcw, Send, Square, X, AlertTriangle, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { localApi, LOCAL_API, STAGES, STATE_LABEL, type Health, type LocalJob, type JobDetail, type Schedule, type TikTokStatus, type QCCheck } from "@/lib/local-api";
import { Panel, StatusBadge } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TONE: Record<string, string> = { approved: "READY", awaiting_review: "QUEUED", rejected: "FAILED", failed: "FAILED", cancelled: "FAILED", queued: "QUEUED", paused: "QUEUED" };
const ORDER = ["queued", ...STAGES.map((s) => s.key), "approved"];
const errMsg = (e: unknown) => (e as Error).message;

export function LocalFactory() {
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);
  const [jobs, setJobs] = useState<LocalJob[]>([]);
  const [sel, setSel] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setJobs(await localApi.jobs()); setOffline(false); } catch { setOffline(true); }
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

  return (
    <Panel title="Fábrica local (real)" action={<StatusBadge status={offline ? "FAILED" : "READY"} label={offline ? "DESCONECTADO" : "CONECTADO"} />} className="mb-8">
      {offline ? (
        <div className="space-y-3 text-sm">
          <p>Não foi possível acessar o servidor local em <code className="font-mono text-primary">{LOCAL_API}</code>. Nenhum vídeo é gerado sem ele — não há resultado simulado aqui.</p>
          <p className="text-muted-foreground">O servidor roda no seu PC Windows. As instruções de instalação estão em <code className="font-mono">docs/LOCAL_FACTORY.md</code>. Depois de iniciá-lo, abra este painel em <code className="font-mono">http://localhost:8080</code>.</p>
          <Button size="sm" variant="secondary" onClick={() => { void checkHealth(); void refresh(); }}>Testar conexão</Button>
        </div>
      ) : (
        <Tabs defaultValue="jobs">
          <TabsList>
            <TabsTrigger value="jobs">Produção</TabsTrigger>
            <TabsTrigger value="schedule">Agendamento</TabsTrigger>
            <TabsTrigger value="tiktok">TikTok</TabsTrigger>
            <TabsTrigger value="deps">Dependências</TabsTrigger>
          </TabsList>
          <TabsContent value="jobs" className="space-y-5 pt-4">
            <NewJob onCreated={(id) => { setSel(id); void refresh(); }} />
            {jobs.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum job ainda.</p> : (
              <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="max-h-[640px] space-y-1.5 overflow-y-auto">
                  {jobs.map((j) => (
                    <button key={j.id} onClick={() => setSel(j.id)} className={`w-full rounded-md border p-2 text-left text-xs ${j.id === (sel ?? jobs[0]?.id) ? "border-primary/50 bg-primary/5" : "bg-surface"}`}>
                      <div className="truncate font-medium">{j.topic}</div>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <StatusBadge status={TONE[j.status] ?? "PROCESSING"} label={STATE_LABEL[j.status]} />
                        <span className="font-mono text-muted-foreground">{j.origin === "scheduler" ? "agenda" : new Date(j.created_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <JobPanel id={sel ?? jobs[0]!.id} summary={jobs.find((j) => j.id === (sel ?? jobs[0]!.id))} onChange={refresh} publishingEnabled={!!health?.publishingEnabled} />
              </div>
            )}
          </TabsContent>
          <TabsContent value="schedule" className="pt-4"><ScheduleTab /></TabsContent>
          <TabsContent value="tiktok" className="pt-4"><TikTokTab /></TabsContent>
          <TabsContent value="deps" className="pt-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {health?.diagnostics.map((d) => (
                <div key={d.name} className="flex items-start gap-2 rounded-md border bg-surface p-2 text-xs">
                  {d.ok ? <Check className="mt-0.5 size-3.5 text-success" /> : d.optional ? <AlertTriangle className="mt-0.5 size-3.5 text-warning" /> : <X className="mt-0.5 size-3.5 text-destructive" />}
                  <div><div className="font-medium">{d.name}</div><div className="text-muted-foreground">{d.detail}</div>{!d.ok && d.fix && <div className="text-warning">{d.fix}</div>}</div>
                </div>
              ))}
            </div>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => void checkHealth()}>Verificar novamente</Button>
          </TabsContent>
        </Tabs>
      )}
    </Panel>
  );
}

function NewJob({ onCreated }: { onCreated: (id: string) => void }) {
  const [topic, setTopic] = useState("");
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const j = await localApi.create(topic, urls.split(/\s+/).filter(Boolean));
      setTopic(""); setUrls(""); toast.success("Job enviado para a fila local"); onCreated(j.id);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="flex gap-2">
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Tema do vídeo (ex.: Como funciona o segundo turno)" maxLength={200} />
        <Button type="submit" disabled={busy || topic.trim().length < 5}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Gerar vídeo</Button>
      </div>
      <Input value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="Opcional: links de fontes oficiais (TSE, Planalto, Câmara...) separados por espaço" />
    </form>
  );
}

function Checks({ checks }: { checks: QCCheck[] }) {
  return (
    <div className="grid gap-1.5 md:grid-cols-2">
      {checks.map((c) => (
        <div key={c.name} className="flex gap-2 rounded-md border bg-surface p-2 text-xs">
          {c.passed ? <Check className="size-3.5 shrink-0 text-success" /> : <X className="size-3.5 shrink-0 text-destructive" />}
          <div><div>{c.name} <span className="text-muted-foreground">· {c.category}</span></div><div className="text-muted-foreground">{c.detail}</div></div>
        </div>
      ))}
    </div>
  );
}

const SUPPORT_TONE: Record<string, string> = { textual_evidence: "text-success", weak_evidence: "text-warning", unsupported: "text-destructive", analysis: "text-muted-foreground" };
const SUPPORT_TEXT: Record<string, string> = {
  textual_evidence: "termos encontrados na fonte (automático, não é checagem)", weak_evidence: "fonte não confirma claramente", unsupported: "SEM FONTE — revisar", analysis: "análise/contexto",
};

function JobPanel({ id, summary, onChange, publishingEnabled }: { id: string; summary: LocalJob | undefined; onChange: () => Promise<void>; publishingEnabled: boolean }) {
  const [d, setD] = useState<JobDetail | null>(null);
  const load = useCallback(async () => { try { setD(await localApi.job(id)); } catch (e) { toast.error(errMsg(e)); } }, [id]);
  useEffect(() => { void load(); }, [load, summary?.updated_at, summary?.publication?.status]);
  if (!d || d.id !== id) return <div className="text-sm text-muted-foreground"><Loader2 className="inline size-4 animate-spin" /> Carregando…</div>;

  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); await onChange(); await load(); } catch (e) { toast.error(errMsg(e)); } };
  const idx = ORDER.indexOf(d.status);
  const running = ["researching", "generating_script", "generating_voice", "rendering", "quality_check"].includes(d.status);
  const { research, script, scenes, captions, report } = d.detail;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {STAGES.map((s, i) => {
          const done = d.status === "approved" || idx > i + 1;
          const live = d.status === s.key;
          return (
            <div key={s.key} className={`rounded-md border p-2 text-xs ${live ? "border-primary/50 bg-primary/8" : "bg-surface"}`}>
              <div className="flex justify-between"><span className="font-mono text-muted-foreground">0{i + 1}</span>{done && <Check className="size-3.5 text-success" />}{live && s.key !== "awaiting_review" && <Loader2 className="size-3.5 animate-spin text-primary" />}</div>
              <div className="mt-1 font-medium">{s.label}</div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {d.status === "queued" && <Button size="sm" variant="secondary" onClick={() => act(() => localApi.pause(id), "Pausado")}><Pause className="size-3.5" /> Pausar</Button>}
        {d.status === "paused" && <Button size="sm" variant="secondary" onClick={() => act(() => localApi.resume(id), "Retomado")}><Play className="size-3.5" /> Retomar</Button>}
        {(["queued", "paused", "awaiting_review"].includes(d.status) || (running && !d.cancel_requested)) && <Button size="sm" variant="outline" onClick={() => act(() => localApi.cancel(id), running ? "Cancelamento solicitado" : "Cancelado")}><Square className="size-3.5" /> Cancelar</Button>}
        {["failed", "rejected", "cancelled"].includes(d.status) && <Button size="sm" variant="secondary" onClick={() => act(() => localApi.retry(id), "Reenviado para a fila")}><RotateCcw className="size-3.5" /> Tentar novamente</Button>}
        {d.hasScript && <Button size="sm" variant="ghost" asChild><a href={localApi.scriptUrl(id)} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Roteiro JSON</a></Button>}
        {d.hasReport && <Button size="sm" variant="ghost" asChild><a href={localApi.reportUrl(id)} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Relatório de qualidade</a></Button>}
      </div>
      {d.cancel_requested && running && <p className="text-xs text-warning">Cancelamento será aplicado ao fim da etapa atual.</p>}
      {d.error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">{d.error}</div>}

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <div>
          {d.hasVideo && d.qc_passed !== null ? (
            <video src={localApi.videoUrl(id)} controls className="aspect-[9/16] w-full rounded-lg border bg-surface" />
          ) : <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border bg-surface text-xs text-muted-foreground">Sem vídeo ainda</div>}
          <div className="mt-2 font-mono text-[11px] text-muted-foreground">{d.resolution ?? "—"} · {d.duration_sec ? `${d.duration_sec.toFixed(1)}s` : "—"} · tentativa {d.attempts}</div>
          {d.scheduled_for && <div className="font-mono text-[11px] text-muted-foreground">Horário: {d.scheduled_for}</div>}
        </div>
        <div className="space-y-5 text-sm">
          {scenes && (
            <section>
              <h4 className="mb-2 font-medium">Cenas ({scenes.length})</h4>
              <div className="space-y-2">
                {scenes.map((s) => (
                  <div key={s.index} className="flex gap-3 rounded-md border bg-surface p-2 text-xs">
                    {s.visual ? <img src={localApi.sceneUrl(id, s.index)} alt={s.visual_query} className="h-20 w-12 shrink-0 rounded object-cover" /> : <div className="flex h-20 w-12 shrink-0 items-center justify-center rounded bg-muted text-[9px] text-muted-foreground">sem imagem</div>}
                    <div className="min-w-0">
                      <div className="font-mono text-muted-foreground">{s.start.toFixed(1)}–{s.end.toFixed(1)}s · “{s.visual_query}”</div>
                      <div>{s.narration}</div>
                      {s.visual && <div className="mt-1 text-muted-foreground">{s.visual.origin === "user" ? "Imagem sua" : "Wikimedia Commons"} · {s.visual.license}{s.visual.author ? ` · ${s.visual.author}` : ""}{s.visual.source_url && <> · <a className="underline" href={s.visual.source_url} target="_blank" rel="noreferrer">origem</a></>}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(research || script) && (
            <section>
              <h4 className="mb-1 font-medium">Fontes e afirmações</h4>
              <p className="mb-2 text-xs text-warning">Verificação automática por termos — não é checagem de fatos. Confira cada afirmação antes de aprovar.</p>
              {research?.warnings.map((w) => <div key={w} className="text-xs text-warning">⚠ {w}</div>)}
              <ul className="mb-3 space-y-1 text-xs">
                {research?.sources.length ? research.sources.map((s) => (
                  <li key={s.id}><span className="font-mono">[{s.id}]</span> <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a> <span className="text-muted-foreground">· {s.publisher} · consultado {new Date(s.retrieved_at).toLocaleString("pt-BR")}</span></li>
                )) : <li className="text-destructive">Nenhuma fonte coletada.</li>}
              </ul>
              <ul className="space-y-1.5 text-xs">
                {script?.claims.map((c, i) => (
                  <li key={i} className="rounded-md border bg-surface p-2">
                    <div>{c.text}</div>
                    <div className={SUPPORT_TONE[c.support]}>{c.kind === "fact" ? "Fato" : "Análise"} · {SUPPORT_TEXT[c.support]}{c.source_ids.length ? ` · ${c.source_ids.join(", ")}` : ""}</div>
                    <div className="text-muted-foreground">{c.detail}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report && (
            <section>
              <h4 className="mb-2 font-medium">Relatório de qualidade — técnico {report.technical.passed ? "aprovado" : "REPROVADO"}</h4>
              <Checks checks={report.technical.checks} />
            </section>
          )}

          {captions && (
            <details className="text-xs"><summary className="cursor-pointer font-medium">Legendas (gravadas no vídeo)</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-2 font-mono">{captions}</pre>
            </details>
          )}

          <Review job={d} report={report} onDone={async () => { await onChange(); await load(); }} />
          {d.status === "approved" && <PublishBox job={d} publishingEnabled={publishingEnabled} onDone={async () => { await onChange(); await load(); }} />}

          <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Logs ({d.logs.length})</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-surface p-2 font-mono">{d.logs.join("\n")}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}

function Review({ job, report, onDone }: { job: JobDetail; report: JobDetail["detail"]["report"]; onDone: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  if (job.status === "approved" || (job.status === "rejected" && job.reviewed_at)) {
    return <div className="rounded-md border bg-surface p-2.5 text-xs">Revisão humana: <b>{job.status === "approved" ? "aprovado" : "reprovado"}</b> em {new Date(job.reviewed_at!).toLocaleString("pt-BR")} — {job.review_note}</div>;
  }
  if (job.status !== "awaiting_review") return null;
  const send = async (decision: "approve" | "reject") => {
    try { await localApi.review(job.id, decision, note, confirm); toast.success(decision === "approve" ? "Aprovado" : "Reprovado"); await onDone(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <section className="space-y-2 rounded-md border border-primary/40 p-3">
      <h4 className="font-medium">Revisão humana</h4>
      {report && (report.factual.unsupported > 0 || report.factual.weak > 0) && (
        <p className="text-xs text-warning">{report.factual.unsupported} afirmação(ões) sem fonte e {report.factual.weak} com evidência fraca. Corrija ou reprove se não puder confirmá-las.</p>
      )}
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação da revisão (obrigatória)" maxLength={1000} />
      <label className="flex items-center gap-2 text-xs"><Checkbox checked={confirm} onCheckedChange={(v) => setConfirm(v === true)} /> Conferi cada afirmação factual nas fontes, o tom é neutro e as imagens são adequadas.</label>
      <div className="flex gap-2">
        <Button size="sm" disabled={!confirm || note.trim().length < 3} onClick={() => void send("approve")}><Check className="size-3.5" /> Aprovar</Button>
        <Button size="sm" variant="outline" disabled={note.trim().length < 3} onClick={() => void send("reject")}><X className="size-3.5" /> Reprovar</Button>
      </div>
    </section>
  );
}

function PublishBox({ job, publishingEnabled, onDone }: { job: JobDetail; publishingEnabled: boolean; onDone: () => Promise<void> }) {
  const [privacy, setPrivacy] = useState("");
  const [options, setOptions] = useState<string[] | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const pub = job.publication;
  useEffect(() => { localApi.tiktokCreator().then((c) => setOptions(c.privacy_level_options)).catch(() => setOptions([])); }, []);
  const send = async () => {
    try { await localApi.publish(job.id, privacy); toast.success("Envio enfileirado; o worker fará o upload"); setReasons([]); await onDone(); }
    catch (e) { setReasons(((e as { body?: { reasons?: string[] } }).body?.reasons) ?? [errMsg(e)]); }
  };
  return (
    <section className="space-y-2 rounded-md border p-3 text-xs">
      <h4 className="text-sm font-medium">Publicação TikTok</h4>
      {pub && <div>Status: <b>{pub.status}</b>{pub.external_id ? ` · publish_id ${pub.external_id}` : ""}{pub.message ? ` — ${pub.message}` : ""}</div>}
      {!publishingEnabled && <div className="text-warning">Publicação desativada no PC (PUBLISHING_ENABLED=false).</div>}
      {(!pub || pub.status === "failed") && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} className="h-8 rounded-md border bg-background px-2">
            <option value="">Privacidade…</option>
            {(options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {options?.length === 0 && <span className="text-muted-foreground">Conecte a conta TikTok para ver as opções.</span>}
          <Button size="sm" variant="outline" disabled={!privacy} onClick={() => void send()}><Send className="size-3.5" /> Publicar na TikTok</Button>
        </div>
      )}
      {reasons.length > 0 && <ul className="list-disc pl-4 text-destructive">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
    </section>
  );
}

function ScheduleTab() {
  const [s, setS] = useState<Schedule | null>(null);
  const [topics, setTopics] = useState("");
  const [times, setTimes] = useState("");
  useEffect(() => { localApi.schedule().then((x) => { setS(x); setTopics(x.topics.join("\n")); setTimes(x.times.join(", ")); }).catch((e) => toast.error(errMsg(e))); }, []);
  if (!s) return <Loader2 className="size-4 animate-spin" />;
  const save = async (patch: Partial<Schedule> = {}) => {
    try {
      const next = await localApi.saveSchedule({ ...s, times: times.split(/[,\s]+/).filter(Boolean), topics: topics.split("\n").map((t) => t.trim()).filter(Boolean), ...patch });
      setS(next); toast.success("Agendamento salvo");
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="max-w-2xl space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2"><Switch checked={s.enabled} onCheckedChange={(v) => void save({ enabled: v })} /> Produção automática {s.enabled ? "ativada" : "desativada"}</label>
        {s.enabled && <Button size="sm" variant="secondary" onClick={() => void save({ paused: !s.paused })}>{s.paused ? <><Play className="size-3.5" /> Retomar</> : <><Pause className="size-3.5" /> Pausar</>}</Button>}
        {s.enabled && s.paused && <span className="text-warning">Pausado</span>}
      </div>
      <p className="text-xs text-muted-foreground">O worker cria um job por horário, {s.lead_minutes} min antes, usando o próximo tema ainda não produzido. Horários já passados não são recriados. Publicar sempre exige sua aprovação.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1"><span className="text-xs">Horários (HH:MM)</span><Input value={times} onChange={(e) => setTimes(e.target.value)} /></label>
        <label className="space-y-1"><span className="text-xs">Fuso horário</span><Input value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} /></label>
        <label className="space-y-1"><span className="text-xs">Limite diário</span><Input type="number" min={0} max={12} value={s.daily_limit} onChange={(e) => setS({ ...s, daily_limit: Number(e.target.value) })} /></label>
        <label className="space-y-1"><span className="text-xs">Antecedência (min)</span><Input type="number" min={15} max={720} value={s.lead_minutes} onChange={(e) => setS({ ...s, lead_minutes: Number(e.target.value) })} /></label>
      </div>
      <label className="block space-y-1"><span className="text-xs">Temas (um por linha)</span><Textarea rows={8} value={topics} onChange={(e) => setTopics(e.target.value)} placeholder={"Como funciona o segundo turno\nO que faz o Tribunal Superior Eleitoral"} /></label>
      <Button size="sm" onClick={() => void save()}>Salvar</Button>
    </div>
  );
}

function TikTokTab() {
  const [st, setSt] = useState<TikTokStatus | null>(null);
  const load = useCallback(() => localApi.tiktok().then(setSt).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (!st) return <Loader2 className="size-4 animate-spin" />;
  return (
    <div className="max-w-2xl space-y-3 text-sm">
      <div className="grid gap-1 text-xs">
        <div>Credenciais do app: <b>{st.configured ? "definidas" : "ausentes"}</b></div>
        <div>Conta: <b>{st.connected ? `conectada (${st.open_id ?? "?"})` : "não conectada"}</b>{st.expires_at && ` · token até ${new Date(st.expires_at).toLocaleString("pt-BR")}`}</div>
        <div>Escopos: {st.scopes.length ? st.scopes.join(", ") : "—"} {st.connected && !st.scopes.includes("video.publish") && <span className="text-destructive">(falta video.publish)</span>}</div>
        <div>Publicação: <b>{st.publishingEnabled ? "ativada" : "desativada (PUBLISHING_ENABLED=false)"}</b></div>
        <div className="text-muted-foreground">Redirect URI a cadastrar no TikTok for Developers: <code className="font-mono">{st.redirect_uri}</code> · tipo {st.app_type}</div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={!st.configured} onClick={async () => { try { const { url } = await localApi.tiktokConnect(); window.open(url, "_blank", "noopener"); toast.message("Autorize na aba da TikTok e depois clique em Atualizar."); } catch (e) { toast.error(errMsg(e)); } }}><Link2 className="size-3.5" /> Conectar conta TikTok</Button>
        {st.connected && <Button size="sm" variant="outline" onClick={async () => { await localApi.tiktokDisconnect(); await load(); }}><Unlink className="size-3.5" /> Desconectar</Button>}
        <Button size="sm" variant="ghost" onClick={() => void load()}>Atualizar</Button>
      </div>
      <p className="text-xs text-muted-foreground">Usa somente a API oficial (Login Kit + Content Posting API). Apps não auditados pela TikTok só conseguem postar como privado (SELF_ONLY).</p>
    </div>
  );
}
