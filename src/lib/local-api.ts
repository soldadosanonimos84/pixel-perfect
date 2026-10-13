// Browser client for the local factory API running on the user's PC (127.0.0.1). No fallback to fake results.
export const LOCAL_API = (import.meta.env["VITE_LOCAL_API_URL"] as string | undefined) ?? "http://127.0.0.1:8787";

export type LocalJobState =
  | "queued" | "generating_script" | "generating_voice" | "rendering" | "quality_check" | "approved" | "rejected" | "failed";

export interface LocalJob {
  id: string;
  topic: string;
  status: LocalJobState;
  attempts: number;
  created_at: string;
  updated_at: string;
  duration_sec: number | null;
  resolution: string | null;
  error: string | null;
  publish_status: string;
  qc: { name: string; passed: boolean; detail: string }[] | null;
  logs: string[];
  hasScript: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface Diagnostic { name: string; ok: boolean; detail: string; fix?: string }
export interface Health { ok: boolean; model: string; publishingEnabled: boolean; diagnostics: Diagnostic[] }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${LOCAL_API}${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Erro ${res.status}`);
  return body;
}

export const localApi = {
  health: () => req<Health>("/health"),
  jobs: () => req<LocalJob[]>("/jobs"),
  create: (topic: string) => req<LocalJob>("/jobs", { method: "POST", body: JSON.stringify({ topic }) }),
  retry: (id: string) => req<LocalJob>(`/jobs/${id}/retry`, { method: "POST" }),
  publish: (id: string) => req<{ published: boolean; reasons: string[] }>(`/jobs/${id}/publish`, { method: "POST" }),
  videoUrl: (id: string) => `${LOCAL_API}/jobs/${id}/video`,
  scriptUrl: (id: string) => `${LOCAL_API}/jobs/${id}/script`,
};

export const STAGES: { key: LocalJobState; label: string }[] = [
  { key: "generating_script", label: "Roteiro (Ollama)" },
  { key: "generating_voice", label: "Narração (Piper)" },
  { key: "rendering", label: "Render (FFmpeg)" },
  { key: "quality_check", label: "QC técnico (FFprobe)" },
];
