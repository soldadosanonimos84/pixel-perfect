// Browser client for the local factory API running on the user's PC (127.0.0.1). No fallback to fake results.
// Types mirror local/src (db.ts JobView, pipeline.ts QualityReport, scheduler.ts Schedule, tiktok.ts status).
export const LOCAL_API = (import.meta.env["VITE_LOCAL_API_URL"] as string | undefined) ?? "http://127.0.0.1:8787";

export type LocalJobState =
  | "queued" | "paused" | "researching" | "generating_script" | "generating_voice" | "rendering" | "quality_check"
  | "awaiting_review" | "approved" | "rejected" | "failed" | "cancelled";

export interface QCCheck { name: string; category: string; passed: boolean; detail: string }
export interface Publication { id: string; status: string; external_id: string | null; privacy_level: string | null; message: string | null; updated_at: string | null }

export interface LocalJob {
  id: string; topic: string; status: LocalJobState; attempts: number; created_at: string; updated_at: string;
  duration_sec: number | null; resolution: string | null; error: string | null;
  origin: string; scheduled_for: string | null; source_urls: string[]; cancel_requested: boolean;
  review_note: string | null; reviewed_at: string | null; qc_passed: boolean | null;
  qc: QCCheck[] | null; logs: string[];
  hasScript: boolean; hasAudio: boolean; hasVideo: boolean; hasReport: boolean;
  publication: Publication | null;
}

export interface Source { id: string; title: string; url: string; publisher: string; kind: string; retrieved_at: string; excerpt: string }
export interface Claim { text: string; kind: "fact" | "analysis"; source_ids: string[]; support: "analysis" | "unsupported" | "weak_evidence" | "textual_evidence"; detail: string }
export interface Scene {
  index: number; narration: string; visual_query: string; on_screen_text: string; start: number; end: number;
  visual: { origin: string; license: string; author: string; source_url: string; credit: string } | null;
}
export interface JobDetail extends LocalJob {
  detail: {
    research: { sources: Source[]; warnings: string[] } | null;
    script: { title: string; cta: string; hashtags: string[]; claims: Claim[] } | null;
    scenes: Scene[] | null;
    captions: string | null;
    report: { technical: { passed: boolean; checks: QCCheck[] }; factual: { note: string; unsupported: number; weak: number }; human: { status: string; note: string | null; reviewed_at: string | null } } | null;
  };
}

export interface Diagnostic { name: string; ok: boolean; detail: string; fix?: string; optional?: boolean }
export interface Health { ok: boolean; model: string; publishingEnabled: boolean; diagnostics: Diagnostic[] }
export interface Schedule { enabled: boolean; paused: boolean; timezone: string; times: string[]; daily_limit: number; lead_minutes: number; topics: string[] }
export interface TikTokStatus { configured: boolean; connected: boolean; open_id: string | null; scopes: string[]; expires_at: string | null; redirect_uri: string; app_type: string; publishingEnabled: boolean }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${LOCAL_API}${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Erro ${res.status}`), { body });
  return body;
}
const post = <T,>(path: string, body?: unknown) => req<T>(path, body === undefined ? { method: "POST" } : { method: "POST", body: JSON.stringify(body) });

export const localApi = {
  health: () => req<Health>("/health"),
  jobs: () => req<LocalJob[]>("/jobs"),
  job: (id: string) => req<JobDetail>(`/jobs/${id}`),
  create: (topic: string, source_urls: string[]) => post<LocalJob>("/jobs", { topic, source_urls }),
  retry: (id: string) => post<LocalJob>(`/jobs/${id}/retry`),
  pause: (id: string) => post<LocalJob>(`/jobs/${id}/pause`),
  resume: (id: string) => post<LocalJob>(`/jobs/${id}/resume`),
  cancel: (id: string) => post<{ result: string }>(`/jobs/${id}/cancel`),
  review: (id: string, decision: "approve" | "reject", note: string, confirm_facts_reviewed: boolean) => post<LocalJob>(`/jobs/${id}/review`, { decision, note, confirm_facts_reviewed }),
  publish: (id: string, privacy_level: string) => post<{ queued: boolean; reasons: string[] }>(`/jobs/${id}/publish`, { privacy_level }),
  schedule: () => req<Schedule>("/schedule"),
  saveSchedule: (s: Schedule) => req<Schedule>("/schedule", { method: "PUT", body: JSON.stringify(s) }),
  tiktok: () => req<TikTokStatus>("/tiktok/status"),
  tiktokConnect: () => post<{ url: string }>("/tiktok/connect"),
  tiktokDisconnect: () => post<TikTokStatus>("/tiktok/disconnect"),
  tiktokCreator: () => req<{ privacy_level_options: string[]; creator_username?: string }>("/tiktok/creator-info"),
  videoUrl: (id: string) => `${LOCAL_API}/jobs/${id}/video`,
  sceneUrl: (id: string, n: number) => `${LOCAL_API}/jobs/${id}/scene/${n}`,
  reportUrl: (id: string) => `${LOCAL_API}/jobs/${id}/report`,
  scriptUrl: (id: string) => `${LOCAL_API}/jobs/${id}/script`,
};

export const STAGES: { key: LocalJobState; label: string }[] = [
  { key: "researching", label: "Pesquisa de fontes" },
  { key: "generating_script", label: "Roteiro (Ollama)" },
  { key: "generating_voice", label: "Narração (Piper)" },
  { key: "rendering", label: "Imagens + render" },
  { key: "quality_check", label: "QC técnico" },
  { key: "awaiting_review", label: "Revisão humana" },
];

export const STATE_LABEL: Record<LocalJobState, string> = {
  queued: "na fila", paused: "pausado", researching: "pesquisando", generating_script: "roteiro", generating_voice: "narração",
  rendering: "renderizando", quality_check: "QC", awaiting_review: "aguardando revisão", approved: "aprovado (humano)",
  rejected: "reprovado", failed: "falhou", cancelled: "cancelado",
};
