// Client-side simulation store. In production these actions become calls to
// backend endpoints that enqueue BullMQ jobs; the UI contract stays the same.
import { useSyncExternalStore } from "react";
import * as m from "./mock-data";
import { VIDEO_FLOW, IDEA_FLOW } from "./types";
import type {
  ContentIdea, Job, LogEntry, Publication, QACheck, QueueName, Script, Settings, Source, Video, VideoAnalytics, VideoStatus,
} from "./types";

export interface State {
  ideas: ContentIdea[];
  scripts: Script[];
  videos: Video[];
  jobs: Job[];
  publications: Publication[];
  sources: Source[];
  analytics: VideoAnalytics[];
  logs: LogEntry[];
  settings: Settings;
}

let state: State = {
  ideas: m.ideas, scripts: m.scripts, videos: m.videos, jobs: m.jobs, publications: m.publications,
  sources: m.sources, analytics: m.analytics, logs: m.logs, settings: m.defaultSettings,
};
const listeners = new Set<() => void>();
const set = (fn: (s: State) => Partial<State>) => {
  state = { ...state, ...fn(state) };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
export const useStore = () => useSyncExternalStore(subscribe, () => state, () => state);

let seq = 1000;
const uid = (p: string) => `${p}-${++seq}`;
const now = () => new Date().toISOString();

function log(level: LogEntry["level"], service: string, message: string) {
  set((s) => ({ logs: [{ id: uid("l"), at: now(), level, service, message }, ...s.logs] }));
}

const STAGE_QUEUE: Partial<Record<VideoStatus, QueueName>> = {
  RESEARCHING: "research", SCRIPTING: "script", GENERATING_ASSETS: "assets", GENERATING_AUDIO: "voice",
  RENDERING: "render", GENERATING_SUBTITLES: "subtitles", QUALITY_CONTROL: "quality-control",
};

function runQA(video: Video, s: State): QACheck[] {
  const script = s.scripts.find((x) => x.id === video.scriptId);
  const unsupported = script?.claims.filter((c) => c.sourceIds.length === 0) ?? [];
  const missingSrc = !script || script.sourceIds.length === 0;
  const unverified = script?.sourceIds.some((id) => s.sources.find((x) => x.id === id)?.reliability !== "verified");
  const dup = s.videos.filter((v) => v.title === video.title && v.status === "READY" && v.id !== video.id).length > 0;
  const misleading = /\b(sempre|nunca|todos sabem|escândalo|urgente)\b/i.test(`${script?.hook} ${script?.body}`);
  const d = video.duration;
  return [
    { name: "Duração", passed: d >= s.settings.minDuration && d <= s.settings.maxDuration, detail: `${d}s (alvo ${s.settings.minDuration}–${s.settings.maxDuration}s)` },
    { name: "Resolução", passed: true, detail: "1080×1920" },
    { name: "Proporção", passed: true, detail: "9:16" },
    { name: "Áudio presente", passed: true, detail: "Faixa de narração detectada" },
    { name: "Sincronia de legendas", passed: true, detail: "Desvio máx. 80ms" },
    { name: "Arquivo íntegro", passed: true, detail: "MP4 / H.264 válido" },
    { name: "Afirmações sem suporte", passed: unsupported.length === 0, detail: unsupported.length ? `${unsupported.length} afirmação(ões) sem fonte` : "Todas as afirmações têm fonte" },
    { name: "Fontes ausentes/pendentes", passed: !missingSrc && !unverified, detail: missingSrc ? "Roteiro sem fontes" : unverified ? "Fonte com verificação pendente" : "Fontes verificadas" },
    { name: "Conteúdo duplicado", passed: !dup, detail: dup ? "Título já produzido" : "Sem duplicidade" },
    { name: "Linguagem enganosa", passed: !misleading, detail: misleading ? "Termos sensacionalistas detectados" : "Nenhum termo sinalizado" },
  ];
}

const timers = new Map<string, ReturnType<typeof setInterval>>();

function runPipeline(videoId: string) {
  if (timers.has(videoId)) return;
  let currentJob: string | null = null;
  const t = setInterval(() => {
    const v = state.videos.find((x) => x.id === videoId);
    if (!v) return clearInterval(t);
    const next = Math.min(v.progress + 25, 100);
    const idx = VIDEO_FLOW.indexOf(v.status);
    if (next < 100) {
      set((s) => ({
        videos: s.videos.map((x) => (x.id === videoId ? { ...x, progress: next } : x)),
        jobs: s.jobs.map((j) => (j.id === currentJob ? { ...j, progress: next } : j)),
      }));
      return;
    }
    // stage complete
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === currentJob ? { ...j, progress: 100, status: "completed", completedAt: now() } : j)) }));
    const nextStatus = VIDEO_FLOW[idx + 1]!;
    if (v.status === "QUALITY_CONTROL") {
      const checks = runQA(v, state);
      const passed = checks.every((c) => c.passed);
      set((s) => ({
        videos: s.videos.map((x) => x.id === videoId
          ? { ...x, status: passed ? "READY" : "FAILED", progress: 100, qa: { passed, checks }, error: passed ? undefined : `QA reprovado: ${checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}` }
          : x),
      }));
      log(passed ? "info" : "error", "qa-agent", `${v.title}: ${passed ? "QA APROVADO" : "QA REPROVADO"}`);
      if (passed && state.settings.autoPublish) scheduleVideo(videoId);
      clearInterval(t); timers.delete(videoId);
      return;
    }
    const q = STAGE_QUEUE[nextStatus];
    if (q) {
      const job: Job = { id: uid("job"), type: q, videoId, status: "active", progress: 0, attempts: 1, createdAt: now(), startedAt: now() };
      currentJob = job.id;
      set((s) => ({ jobs: [job, ...s.jobs] }));
    }
    set((s) => ({ videos: s.videos.map((x) => (x.id === videoId ? { ...x, status: nextStatus, progress: 0 } : x)) }));
  }, 450);
  timers.set(videoId, t);
}

// ---------- Actions ----------
export function addIdea(data: Omit<ContentIdea, "id" | "status" | "createdAt">) {
  set((s) => ({ ideas: [{ ...data, id: uid("idea"), status: "IDEA", createdAt: now() }, ...s.ideas] }));
  log("info", "research-agent", `Nova ideia: ${data.title}`);
}

export function advanceIdea(id: string) {
  set((s) => ({ ideas: s.ideas.map((i) => i.id === id ? { ...i, status: IDEA_FLOW[Math.min(IDEA_FLOW.indexOf(i.status) + 1, IDEA_FLOW.length - 1)]! } : i) }));
}

export function generateScript(ideaId: string): string {
  const idea = state.ideas.find((i) => i.id === ideaId)!;
  const src = state.sources.find((s) => s.id === idea.sourceId);
  const script: Script = {
    id: uid("scr"), ideaId,
    hook: `${idea.title}? Entenda em menos de um minuto.`,
    body: `Segundo ${src?.publisher ?? "a fonte indicada"}, ${idea.description.charAt(0).toLowerCase()}${idea.description.slice(1)}`,
    conclusion: "Os detalhes completos estão disponíveis na fonte oficial.",
    cta: "Confira a fonte e siga para mais conteúdo informativo.",
    estimatedDuration: 40,
    sourceIds: src ? [src.id] : [],
    claims: [{ text: idea.description, kind: "fact", sourceIds: src ? [src.id] : [] }],
    createdAt: now(),
  };
  set((s) => ({
    scripts: [script, ...s.scripts],
    ideas: s.ideas.map((i) => (i.id === ideaId ? { ...i, status: "SCRIPTING" } : i)),
  }));
  log("info", "script-agent", `Roteiro gerado para "${idea.title}" (LLMProvider: ${state.settings.llmProvider}, simulado)`);
  return script.id;
}

export function updateScript(id: string, patch: Partial<Script>) {
  set((s) => ({ scripts: s.scripts.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
}

export function produceVideo(scriptId: string): string {
  const script = state.scripts.find((x) => x.id === scriptId)!;
  const idea = state.ideas.find((i) => i.id === script.ideaId);
  const video: Video = {
    id: uid("vid"), scriptId, title: idea?.title ?? "Vídeo", thumbnail: m.THUMBS[seq % 3]!,
    status: "QUEUED", progress: 0, duration: script.estimatedDuration, resolution: "1080×1920", createdAt: now(),
  };
  set((s) => ({
    videos: [video, ...s.videos],
    ideas: s.ideas.map((i) => (i.id === script.ideaId ? { ...i, status: "PRODUCTION" } : i)),
  }));
  log("info", "orchestrator", `Pipeline iniciado: ${video.title}`);
  runPipeline(video.id);
  return video.id;
}

export function regenerate(videoId: string) {
  set((s) => ({ videos: s.videos.map((v) => (v.id === videoId ? { ...v, status: "QUEUED", progress: 0, qa: undefined, error: undefined } : v)) }));
  log("warn", "orchestrator", `Regeneração solicitada (${videoId})`);
  runPipeline(videoId);
}

function nextSlot(): string {
  const taken = new Set(state.publications.filter((p) => p.status !== "FAILED").map((p) => p.scheduledAt));
  const base = new Date();
  for (let d = 0; d < 30; d++) {
    for (const t of state.settings.times) {
      const [h, mi] = t.split(":").map(Number);
      const dt = new Date(base);
      dt.setDate(base.getDate() + d);
      dt.setHours(h!, mi!, 0, 0);
      if (dt > base && !taken.has(dt.toISOString())) return dt.toISOString();
    }
  }
  return base.toISOString();
}

export function scheduleVideo(videoId: string) {
  const pub: Publication = { id: uid("pub"), videoId, platform: "tiktok", scheduledAt: nextSlot(), status: "SCHEDULED" };
  set((s) => ({ publications: [...s.publications, pub] }));
  const v = state.videos.find((x) => x.id === videoId);
  const script = state.scripts.find((x) => x.id === v?.scriptId);
  if (script) set((s) => ({ ideas: s.ideas.map((i) => (i.id === script.ideaId ? { ...i, status: "COMPLETED" } : i)) }));
  log("info", "publishing-worker", `Agendado ${v?.title} para ${new Date(pub.scheduledAt).toLocaleString("pt-BR")}`);
}

export function publishNow(pubId: string) {
  set((s) => ({ publications: s.publications.map((p) => (p.id === pubId ? { ...p, status: "PROCESSING" } : p)) }));
  setTimeout(() => {
    const pub = state.publications.find((p) => p.id === pubId);
    set((s) => ({
      publications: s.publications.map((p) => (p.id === pubId ? { ...p, status: "PUBLISHED", externalId: uid("mock"), note: "Simulado" } : p)),
      analytics: pub ? [...s.analytics, { videoId: pub.videoId, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, avgWatch: 0, completion: 0 }] : s.analytics,
    }));
    log("warn", "publishing-worker", "TikTok Content Posting API não conectada — publicação simulada.");
  }, 1200);
}

export function cancelPublication(pubId: string) {
  set((s) => ({ publications: s.publications.filter((p) => p.id !== pubId) }));
}

export function addSource(src: Omit<Source, "id">) {
  set((s) => ({ sources: [{ ...src, id: uid("src") }, ...s.sources] }));
}

export function updateSettings(patch: Partial<Settings>) {
  set((s) => ({ settings: { ...s.settings, ...patch } }));
  log("info", "settings", "Configurações atualizadas.");
}

export function retryJob(jobId: string) {
  set((s) => ({ jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: "waiting", attempts: j.attempts + 1, error: undefined, progress: 0 } : j)) }));
}
