// Durable store on SQLite via Node's built-in node:sqlite (Node >= 22.18). No native addons to compile on Windows.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertTransition, ACTIVE_STATES, type JobState } from "./jobs.ts";
import type { QCCheck } from "./qc.ts";

export interface JobRow {
  id: string;
  topic: string;
  status: JobState;
  attempts: number;
  created_at: string;
  updated_at: string;
  script_path: string | null;
  audio_path: string | null;
  video_path: string | null;
  report_path: string | null;
  duration_sec: number | null;
  resolution: string | null;
  qc_json: string | null;
  qc_passed: number | null;
  error: string | null;
  logs: string;
  publish_status: string;
  origin: "manual" | "scheduler";
  scheduled_for: string | null;
  source_urls: string;
  cancel_requested: number;
  review_note: string | null;
  reviewed_at: string | null;
}

export interface PublicationRow {
  id: string; job_id: string; platform: string; status: string; external_id: string | null;
  privacy_level: string | null; caption: string | null; message: string | null; created_at: string; updated_at: string | null;
}

export interface JobView {
  id: string; topic: string; status: JobState; attempts: number; created_at: string; updated_at: string;
  duration_sec: number | null; resolution: string | null; error: string | null;
  origin: string; scheduled_for: string | null; source_urls: string[]; cancel_requested: boolean;
  review_note: string | null; reviewed_at: string | null; qc_passed: boolean | null;
  qc: QCCheck[] | null; logs: string[];
  hasScript: boolean; hasAudio: boolean; hasVideo: boolean; hasReport: boolean;
  publication: PublicationRow | null;
}

const JOB_MIGRATIONS: Record<string, string> = {
  report_path: "TEXT",
  qc_passed: "INTEGER",
  origin: "TEXT NOT NULL DEFAULT 'manual'",
  scheduled_for: "TEXT",
  source_urls: "TEXT NOT NULL DEFAULT '[]'",
  cancel_requested: "INTEGER NOT NULL DEFAULT 0",
  review_note: "TEXT",
  reviewed_at: "TEXT",
};
const PUB_MIGRATIONS: Record<string, string> = { privacy_level: "TEXT", caption: "TEXT", updated_at: "TEXT" };

/** Jobs that block a new job with the same topic (avoids duplicate content in flight or awaiting review). */
const BLOCKING = ["queued", "paused", ...ACTIVE_STATES, "awaiting_review", "approved"];

export class JobStore {
  db: DatabaseSync;
  constructor(file: string) {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        script_path TEXT, audio_path TEXT, video_path TEXT,
        duration_sec REAL, resolution TEXT,
        qc_json TEXT, error TEXT,
        logs TEXT NOT NULL DEFAULT '[]',
        publish_status TEXT NOT NULL DEFAULT 'not_requested'
      );
      CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, created_at);
      CREATE TABLE IF NOT EXISTS publications (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id),
        platform TEXT NOT NULL,
        status TEXT NOT NULL,
        external_id TEXT,
        message TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(job_id, platform)
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        platform TEXT PRIMARY KEY, open_id TEXT, scope TEXT, access_token TEXT NOT NULL, refresh_token TEXT,
        expires_at TEXT NOT NULL, refresh_expires_at TEXT, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, verifier TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
    this.migrate("jobs", JOB_MIGRATIONS);
    this.migrate("publications", PUB_MIGRATIONS);
    // A scheduler slot can only ever produce one job, even with two workers running.
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS jobs_slot ON jobs(scheduled_for) WHERE scheduled_for IS NOT NULL`);
  }

  private migrate(table: string, cols: Record<string, string>) {
    const have = new Set((this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
    for (const [name, def] of Object.entries(cols)) if (!have.has(name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }

  create(topic: string, opts: { origin?: "manual" | "scheduler"; scheduled_for?: string; source_urls?: string[] } = {}): JobRow {
    const ph = BLOCKING.map(() => "?").join(",");
    const dup = this.db.prepare(`SELECT id FROM jobs WHERE lower(topic) = lower(?) AND status IN (${ph})`).get(topic, ...BLOCKING);
    if (dup) throw new Error("Já existe um job ativo, em revisão ou aprovado com este tema.");
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(`INSERT INTO jobs (id, topic, status, created_at, updated_at, origin, scheduled_for, source_urls) VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)`)
      .run(id, topic, now, now, opts.origin ?? "manual", opts.scheduled_for ?? null, JSON.stringify(opts.source_urls ?? []));
    return this.get(id)!;
  }

  get(id: string): JobRow | undefined {
    return this.db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as JobRow | undefined;
  }

  list(limit = 100): JobRow[] {
    return this.db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`).all(limit) as unknown as JobRow[];
  }

  /** Atomically claim the oldest queued job; only one worker can win it. */
  claimNext(): JobRow | undefined {
    const now = new Date().toISOString();
    return this.db
      .prepare(`UPDATE jobs SET status='researching', attempts=attempts+1, updated_at=?
                WHERE id = (SELECT id FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1) AND status='queued'
                RETURNING *`)
      .get(now) as JobRow | undefined;
  }

  transition(id: string, to: JobState, patch: Partial<Omit<JobRow, "id" | "status">> = {}) {
    const job = this.get(id);
    if (!job) throw new Error(`Job ${id} não existe`);
    assertTransition(job.status, to);
    const fields = { ...patch, status: to, updated_at: new Date().toISOString() } as Record<string, unknown>;
    const keys = Object.keys(fields);
    const r = this.db
      .prepare(`UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ? AND status = ?`)
      .run(...(keys.map((k) => fields[k] ?? null) as (string | number | null)[]), id, job.status);
    if (r.changes === 0) throw new Error("O job mudou de estado durante a operação; tente novamente.");
  }

  log(id: string, message: string) {
    const job = this.get(id);
    if (!job) return;
    const logs = JSON.parse(job.logs) as string[];
    logs.push(`${new Date().toISOString()} ${message}`);
    this.db.prepare(`UPDATE jobs SET logs = ? WHERE id = ?`).run(JSON.stringify(logs.slice(-300)), id);
  }

  /** After a crash/restart: in-progress jobs go back to the queue (or fail/cancel). */
  recoverUnfinished(maxAttempts: number): number {
    let n = 0;
    const ph = ACTIVE_STATES.map(() => "?").join(",");
    const rows = this.db.prepare(`SELECT * FROM jobs WHERE status IN (${ph})`).all(...ACTIVE_STATES) as unknown as JobRow[];
    for (const r of rows) {
      if (r.cancel_requested) this.transition(r.id, "cancelled", { error: "Cancelado (interrompido por reinício)" });
      else if (r.attempts < maxAttempts) this.transition(r.id, "queued", { error: "Recuperado após reinício" });
      else this.transition(r.id, "failed", { error: "Interrompido e sem tentativas restantes" });
      this.log(r.id, "Recuperação após reinício");
      n++;
    }
    return n;
  }

  retry(id: string) {
    const job = this.mustGet(id);
    if (!["failed", "rejected", "cancelled"].includes(job.status)) throw new Error("Só é possível repetir jobs com falha, reprovados ou cancelados");
    this.transition(id, "queued", { attempts: 0, error: null, cancel_requested: 0, qc_passed: null, review_note: null, reviewed_at: null });
    this.log(id, "Nova tentativa solicitada manualmente");
  }

  pause(id: string) {
    const job = this.mustGet(id);
    if (job.status !== "queued") throw new Error("Só jobs na fila podem ser pausados");
    this.transition(id, "paused");
    this.log(id, "Pausado pelo usuário");
  }

  resume(id: string) {
    const job = this.mustGet(id);
    if (job.status !== "paused") throw new Error("O job não está pausado");
    this.transition(id, "queued");
    this.log(id, "Retomado pelo usuário");
  }

  /** Queued/paused/awaiting jobs cancel immediately; running jobs stop at the next stage boundary. */
  cancel(id: string): "cancelled" | "requested" {
    const job = this.mustGet(id);
    if (ACTIVE_STATES.includes(job.status)) {
      this.db.prepare(`UPDATE jobs SET cancel_requested = 1, updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
      this.log(id, "Cancelamento solicitado; será aplicado ao fim da etapa atual");
      return "requested";
    }
    this.transition(id, "cancelled", { error: "Cancelado pelo usuário" });
    this.log(id, "Cancelado pelo usuário");
    return "cancelled";
  }

  review(id: string, decision: "approve" | "reject", note: string) {
    const job = this.mustGet(id);
    if (job.status !== "awaiting_review") throw new Error("O job não está aguardando revisão humana");
    if (decision === "approve" && job.qc_passed !== 1) throw new Error("Controle de qualidade técnico não aprovado");
    const now = new Date().toISOString();
    this.transition(id, decision === "approve" ? "approved" : "rejected", {
      review_note: note, reviewed_at: now, error: decision === "reject" ? `Reprovado na revisão humana: ${note}` : null,
    });
    this.log(id, `Revisão humana: ${decision === "approve" ? "APROVADO" : "REPROVADO"} — ${note}`);
  }

  mustGet(id: string): JobRow {
    const j = this.get(id);
    if (!j) throw new Error("Job não encontrado");
    return j;
  }

  // ---- settings ----
  getSetting<T>(key: string): T | undefined {
    const r = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
    return r ? (JSON.parse(r.value) as T) : undefined;
  }
  setSetting(key: string, value: unknown) {
    this.db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, JSON.stringify(value));
  }

  // ---- publications ----
  publicationFor(jobId: string, platform = "tiktok"): PublicationRow | null {
    return (this.db.prepare(`SELECT * FROM publications WHERE job_id = ? AND platform = ?`).get(jobId, platform) as PublicationRow | undefined) ?? null;
  }
  requestPublication(jobId: string, platform: string, privacy: string, caption: string): PublicationRow {
    const now = new Date().toISOString();
    this.db.prepare(`DELETE FROM publications WHERE job_id = ? AND platform = ? AND status = 'failed'`).run(jobId, platform);
    this.db
      .prepare(`INSERT INTO publications (id, job_id, platform, status, privacy_level, caption, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`)
      .run(randomUUID(), jobId, platform, privacy, caption, now, now);
    this.db.prepare(`UPDATE jobs SET publish_status = 'pending' WHERE id = ?`).run(jobId);
    return this.publicationFor(jobId, platform)!;
  }
  updatePublication(id: string, patch: { status: string; external_id?: string | null; message?: string | null }) {
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE publications SET status = ?, external_id = COALESCE(?, external_id), message = ?, updated_at = ? WHERE id = ?`)
      .run(patch.status, patch.external_id ?? null, patch.message ?? null, now, id);
    const p = this.db.prepare(`SELECT job_id FROM publications WHERE id = ?`).get(id) as { job_id: string } | undefined;
    if (p) this.db.prepare(`UPDATE jobs SET publish_status = ? WHERE id = ?`).run(patch.status, p.job_id);
  }
  publicationsIn(statuses: string[]): PublicationRow[] {
    const ph = statuses.map(() => "?").join(",");
    return this.db.prepare(`SELECT * FROM publications WHERE status IN (${ph}) ORDER BY created_at`).all(...statuses) as unknown as PublicationRow[];
  }

  toView(r: JobRow): JobView {
    return {
      id: r.id, topic: r.topic, status: r.status, attempts: r.attempts, created_at: r.created_at, updated_at: r.updated_at,
      duration_sec: r.duration_sec, resolution: r.resolution, error: r.error,
      origin: r.origin, scheduled_for: r.scheduled_for, source_urls: JSON.parse(r.source_urls || "[]") as string[],
      cancel_requested: !!r.cancel_requested, review_note: r.review_note, reviewed_at: r.reviewed_at,
      qc_passed: r.qc_passed === null || r.qc_passed === undefined ? null : r.qc_passed === 1,
      qc: r.qc_json ? (JSON.parse(r.qc_json) as QCCheck[]) : null,
      logs: JSON.parse(r.logs) as string[],
      hasScript: !!r.script_path, hasAudio: !!r.audio_path, hasVideo: !!r.video_path, hasReport: !!r.report_path,
      publication: this.publicationFor(r.id),
    };
  }
}
