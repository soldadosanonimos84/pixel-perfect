// Durable job store on SQLite via Node's built-in node:sqlite (Node >= 22.18). No native addons to compile on Windows.
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
  duration_sec: number | null;
  resolution: string | null;
  qc_json: string | null;
  error: string | null;
  logs: string;
  publish_status: string;
}

export interface JobView extends Omit<JobRow, "qc_json" | "logs" | "script_path" | "audio_path" | "video_path"> {
  qc: QCCheck[] | null;
  logs: string[];
  hasScript: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
}

export class JobStore {
  db: DatabaseSync;
  constructor(file: string) {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
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
    `);
  }

  create(topic: string): JobRow {
    const dup = this.db
      .prepare(`SELECT id FROM jobs WHERE lower(topic) = lower(?) AND status NOT IN ('failed','rejected')`)
      .get(topic);
    if (dup) throw new Error("Já existe um job ativo ou aprovado com este tema.");
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db.prepare(`INSERT INTO jobs (id, topic, status, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?)`).run(id, topic, now, now);
    return this.get(id)!;
  }

  get(id: string): JobRow | undefined {
    return this.db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as JobRow | undefined;
  }

  list(limit = 50): JobRow[] {
    return this.db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`).all(limit) as unknown as JobRow[];
  }

  /** Atomically claim the oldest queued job; only one worker can win it. */
  claimNext(): JobRow | undefined {
    const now = new Date().toISOString();
    const row = this.db
      .prepare(`UPDATE jobs SET status='generating_script', attempts=attempts+1, updated_at=?, error=NULL
                WHERE id = (SELECT id FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1) AND status='queued'
                RETURNING *`)
      .get(now) as JobRow | undefined;
    return row;
  }

  transition(id: string, to: JobState, patch: Partial<Omit<JobRow, "id" | "status">> = {}) {
    const job = this.get(id);
    if (!job) throw new Error(`Job ${id} não existe`);
    assertTransition(job.status, to);
    const fields = { ...patch, status: to, updated_at: new Date().toISOString() } as Record<string, unknown>;
    const keys = Object.keys(fields);
    this.db
      .prepare(`UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ? AND status = ?`)
      .run(...(keys.map((k) => fields[k] ?? null) as (string | number | null)[]), id, job.status);
  }

  patch(id: string, patch: Partial<Omit<JobRow, "id" | "status">>) {
    const keys = Object.keys(patch);
    if (!keys.length) return;
    const vals = keys.map((k) => (patch as Record<string, unknown>)[k] ?? null) as (string | number | null)[];
    this.db.prepare(`UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).run(...vals, new Date().toISOString(), id);
  }

  log(id: string, message: string) {
    const job = this.get(id);
    if (!job) return;
    const logs = JSON.parse(job.logs) as string[];
    logs.push(`${new Date().toISOString()} ${message}`);
    this.db.prepare(`UPDATE jobs SET logs = ? WHERE id = ?`).run(JSON.stringify(logs.slice(-200)), id);
  }

  /** After a crash/restart: in-progress jobs go back to the queue (or fail if out of attempts). */
  recoverUnfinished(maxAttempts: number): number {
    let n = 0;
    const placeholders = ACTIVE_STATES.map(() => "?").join(",");
    const rows = this.db.prepare(`SELECT * FROM jobs WHERE status IN (${placeholders})`).all(...ACTIVE_STATES) as unknown as JobRow[];
    for (const r of rows) {
      if (r.attempts < maxAttempts) this.transition(r.id, "queued", { error: "Recuperado após reinício" });
      else this.transition(r.id, "failed", { error: "Interrompido e sem tentativas restantes" });
      this.log(r.id, "Recuperação após reinício");
      n++;
    }
    return n;
  }

  retry(id: string) {
    const job = this.get(id);
    if (!job) throw new Error("Job não encontrado");
    if (job.status !== "failed" && job.status !== "rejected") throw new Error("Só é possível repetir jobs com falha ou reprovados");
    this.transition(id, "queued", { attempts: 0, error: null });
    this.log(id, "Nova tentativa solicitada manualmente");
  }

  toView(r: JobRow): JobView {
    const { qc_json, logs, script_path, audio_path, video_path, ...rest } = r;
    return {
      ...rest,
      qc: qc_json ? (JSON.parse(qc_json) as QCCheck[]) : null,
      logs: JSON.parse(logs) as string[],
      hasScript: !!script_path, hasAudio: !!audio_path, hasVideo: !!video_path,
    };
  }
}
