// Runs one claimed job end-to-end. Called by the worker loop, never inside an HTTP request.
import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config.ts";
import type { JobStore, JobRow } from "./db.ts";
import { generateScript, narrationText } from "./script.ts";
import { synthesize, audioDuration, buildSrt, render } from "./media.ts";
import { technicalQC } from "./qc.ts";
import { nextAfterFailure } from "./jobs.ts";

export interface PipelineDeps {
  generateScript: typeof generateScript;
  synthesize: typeof synthesize;
  audioDuration: typeof audioDuration;
  render: typeof render;
  technicalQC: typeof technicalQC;
}
const defaultDeps: PipelineDeps = { generateScript, synthesize, audioDuration, render, technicalQC };

export function jobDir(cfg: Config, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("ID de job inválido");
  return path.join(cfg.OUTPUT_DIR, "jobs", id);
}

export async function processJob(cfg: Config, store: JobStore, job: JobRow, deps: PipelineDeps = defaultDeps) {
  const dir = jobDir(cfg, job.id);
  fs.mkdirSync(dir, { recursive: true });
  const L = (m: string) => { store.log(job.id, m); console.log(`[${job.id.slice(0, 8)}] ${m}`); };
  try {
    L(`Tentativa ${job.attempts}: gerando roteiro com ${cfg.OLLAMA_MODEL}`);
    const script = await deps.generateScript(job.topic, { url: cfg.OLLAMA_URL, model: cfg.OLLAMA_MODEL, timeoutMs: cfg.OLLAMA_TIMEOUT_MS });
    const scriptPath = path.join(dir, "script.json");
    fs.writeFileSync(scriptPath, JSON.stringify({ topic: job.topic, model: cfg.OLLAMA_MODEL, ...script }, null, 2));
    store.transition(job.id, "generating_voice", { script_path: scriptPath });

    L("Gerando narração (Piper)");
    const text = narrationText(script);
    const audioPath = path.join(dir, "narration.wav");
    await deps.synthesize(cfg.PIPER_EXE, cfg.PIPER_VOICE, text, audioPath);
    const dur = await deps.audioDuration(cfg.FFPROBE_EXE, audioPath);
    store.transition(job.id, "rendering", { audio_path: audioPath });

    L(`Renderizando 1080x1920 (${dur.toFixed(1)}s)`);
    const srtPath = path.join(dir, "subtitles.srt");
    fs.writeFileSync(srtPath, buildSrt(text, dur));
    const videoPath = path.join(dir, "video.mp4");
    await deps.render(cfg.FFMPEG_EXE, { audio: audioPath, srt: srtPath, out: videoPath, duration: dur });
    store.transition(job.id, "quality_check", { video_path: videoPath });

    L("Controle de qualidade técnico (ffprobe)");
    const qc = await deps.technicalQC(cfg.FFPROBE_EXE, videoPath, { minDuration: cfg.MIN_DURATION_SEC, maxDuration: cfg.MAX_DURATION_SEC });
    const passed = qc.checks.every((c) => c.passed);
    store.transition(job.id, passed ? "approved" : "rejected", {
      qc_json: JSON.stringify(qc.checks), duration_sec: qc.duration, resolution: qc.resolution,
      error: passed ? null : `QC técnico reprovado: ${qc.checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}`,
    });
    L(passed ? "APROVADO no QC técnico (revisão editorial ainda necessária)" : "REPROVADO no QC técnico");
  } catch (err) {
    const msg = (err as Error).message;
    const to = nextAfterFailure(err, job.attempts, cfg.MAX_ATTEMPTS);
    L(`Erro: ${msg} → ${to === "queued" ? "nova tentativa" : "falhou"}`);
    store.transition(job.id, to, { error: msg });
  }
}
