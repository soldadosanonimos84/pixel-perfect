// Runs one claimed job end-to-end. Called by the worker loop, never inside an HTTP request.
import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config.ts";
import type { JobStore, JobRow } from "./db.ts";
import { generateScript } from "./script.ts";
import { researchTopic, type Source } from "./research.ts";
import { checkClaims, type CheckedClaim } from "./verify.ts";
import { pickFromLibrary, pickFromCommons, type Visual } from "./assets.ts";
import { sceneTimings, buildCues, toSrt, toAss } from "./captions.ts";
import { synthesize, audioDuration, concatAudio, render, measureVolume } from "./media.ts";
import { technicalQC, evaluateAudioLevel, evaluateCaptions, evaluateSync, type QCCheck } from "./qc.ts";
import { nextAfterFailure, CancelledError } from "./jobs.ts";

export interface PipelineDeps {
  research: typeof researchTopic;
  generateScript: typeof generateScript;
  synthesize: typeof synthesize;
  audioDuration: typeof audioDuration;
  concatAudio: typeof concatAudio;
  pickVisual: (query: string, outFile: string, cfg: Config) => Promise<Visual | null>;
  render: typeof render;
  technicalQC: typeof technicalQC;
  measureVolume: typeof measureVolume;
}

async function defaultPickVisual(query: string, outFile: string, cfg: Config): Promise<Visual | null> {
  const lib = pickFromLibrary(cfg.ASSETS_DIR, query);
  if (lib) return lib;
  if (cfg.COMMONS_ENABLED !== "true") return null;
  try { return await pickFromCommons(query, outFile, cfg.HTTP_USER_AGENT); } catch { return null; }
}

const defaultDeps: PipelineDeps = { research: researchTopic, generateScript, synthesize, audioDuration, concatAudio, pickVisual: defaultPickVisual, render, technicalQC, measureVolume };

export function jobDir(cfg: Config, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("ID de job inválido");
  return path.join(cfg.OUTPUT_DIR, "jobs", id);
}

export interface QualityReport {
  job_id: string;
  generated_at: string;
  technical: { passed: boolean; checks: QCCheck[] };
  factual: { status: "manual_review_required"; note: string; unsupported: number; weak: number; claims: CheckedClaim[]; sources: Source[]; warnings: string[] };
  visuals: { scene: number; origin: string; license: string; author: string; source_url: string }[];
  human: { status: "pending" | "approved" | "rejected"; note: string | null; reviewed_at: string | null };
}

export async function processJob(cfg: Config, store: JobStore, job: JobRow, overrides: Partial<PipelineDeps> = {}) {
  const deps = { ...defaultDeps, ...overrides };
  const dir = jobDir(cfg, job.id);
  fs.mkdirSync(dir, { recursive: true });
  const L = (m: string) => { store.log(job.id, m); console.log(`[${job.id.slice(0, 8)}] ${m}`); };
  const checkCancel = () => { if (store.get(job.id)?.cancel_requested) throw new CancelledError(); };
  try {
    // 1. Research
    L(`Tentativa ${job.attempts}: pesquisando fontes`);
    const userUrls = JSON.parse(job.source_urls || "[]") as string[];
    const research = cfg.RESEARCH_ENABLED === "true" || userUrls.length
      ? await deps.research(job.topic, { lang: cfg.WIKIPEDIA_LANG, maxSources: cfg.RESEARCH_ENABLED === "true" ? cfg.MAX_SOURCES : userUrls.length, userUrls, userAgent: cfg.HTTP_USER_AGENT })
      : { sources: [], warnings: ["Pesquisa desativada (RESEARCH_ENABLED=false)."] };
    fs.writeFileSync(path.join(dir, "research.json"), JSON.stringify({ topic: job.topic, ...research }, null, 2));
    for (const w of research.warnings) L(`Aviso: ${w}`);
    L(`${research.sources.length} fonte(s) coletada(s)`);
    checkCancel();
    store.transition(job.id, "generating_script");

    // 2. Script
    L(`Gerando roteiro com ${cfg.OLLAMA_MODEL}`);
    const script = await deps.generateScript(job.topic, research.sources, { url: cfg.OLLAMA_URL, model: cfg.OLLAMA_MODEL, timeoutMs: cfg.OLLAMA_TIMEOUT_MS });
    const claims = checkClaims(script.factual_claims, research.sources);
    const scriptPath = path.join(dir, "script.json");
    fs.writeFileSync(scriptPath, JSON.stringify({ topic: job.topic, model: cfg.OLLAMA_MODEL, ...script, claims }, null, 2));
    checkCancel();
    store.transition(job.id, "generating_voice", { script_path: scriptPath });

    // 3. Voice (one WAV per scene → exact timings)
    L(`Gerando narração (Piper) para ${script.scenes.length} cenas`);
    const wavs: string[] = [];
    const speech: number[] = [];
    for (const [i, sc] of script.scenes.entries()) {
      const wav = path.join(dir, `scene-${String(i + 1).padStart(2, "0")}.wav`);
      await deps.synthesize(cfg.PIPER_EXE, cfg.PIPER_VOICE, sc.narration, wav);
      speech.push(await deps.audioDuration(cfg.FFPROBE_EXE, wav));
      wavs.push(wav);
      checkCancel();
    }
    const audioPath = path.join(dir, "narration.wav");
    await deps.concatAudio(cfg.FFMPEG_EXE, wavs, audioPath);
    const audioDur = await deps.audioDuration(cfg.FFPROBE_EXE, audioPath);
    checkCancel();
    store.transition(job.id, "rendering", { audio_path: audioPath });

    // 4. Visuals + captions + render
    const timings = sceneTimings(speech);
    const visuals: (Visual | null)[] = [];
    for (const [i, sc] of script.scenes.entries()) {
      const v = await deps.pickVisual(sc.visual_query, path.join(dir, `scene-${String(i + 1).padStart(2, "0")}.jpg`), cfg);
      visuals.push(v);
      L(`Cena ${i + 1}: ${v ? `imagem ${v.origin} (${v.license})` : "sem imagem licenciada — fundo neutro"}`);
    }
    const scenesOut = script.scenes.map((sc, i) => ({ index: i + 1, ...sc, ...timings[i]!, visual: visuals[i] ? { ...visuals[i]!, file: path.basename(visuals[i]!.path) } : null }));
    fs.writeFileSync(path.join(dir, "scenes.json"), JSON.stringify(scenesOut, null, 2));
    const cues = buildCues(script.scenes.map((s) => s.narration), timings);
    const credits = scenesOut.filter((s) => s.visual?.credit).map((s) => ({ start: s.start, end: s.end, text: s.visual!.credit }));
    fs.writeFileSync(path.join(dir, "captions.srt"), toSrt(cues));
    const ass = toAss(cues, credits, cfg.CAPTION_FONT);
    fs.writeFileSync(path.join(dir, "captions.ass"), ass);
    const videoPath = path.join(dir, "video.mp4");
    const total = timings.at(-1)!.end;
    L(`Renderizando 1080x1920 com legendas gravadas (${total.toFixed(1)}s)`);
    await deps.render(cfg.FFMPEG_EXE, { cwd: dir, scenes: timings.map((t, i) => ({ duration: t.end - t.start, image: visuals[i]?.path ?? null })), audio: audioPath, assFile: "captions.ass", out: videoPath, duration: total });
    checkCancel();
    store.transition(job.id, "quality_check", { video_path: videoPath });

    // 5. QC + report (technical only decides pass/fail; facts always require human review)
    L("Controle de qualidade técnico");
    const tech = await deps.technicalQC(cfg.FFPROBE_EXE, videoPath, { minDuration: cfg.MIN_DURATION_SEC, maxDuration: cfg.MAX_DURATION_SEC });
    const vol = await deps.measureVolume(cfg.FFMPEG_EXE, videoPath).catch(() => null);
    const checks = [
      ...tech.checks, ...evaluateAudioLevel(vol), ...evaluateCaptions(ass, true),
      ...evaluateSync({ audio: audioDur, video: tech.duration, scenesTotal: total, lastCaptionEnd: cues.at(-1)?.end ?? 0 }),
    ];
    const passed = checks.every((c) => c.passed);
    const report: QualityReport = {
      job_id: job.id, generated_at: new Date().toISOString(),
      technical: { passed, checks },
      factual: {
        status: "manual_review_required",
        note: "Correspondência automática por termos — NÃO é checagem de fatos. Confira cada afirmação nas fontes antes de aprovar.",
        unsupported: claims.filter((c) => c.support === "unsupported").length,
        weak: claims.filter((c) => c.support === "weak_evidence").length,
        claims, sources: research.sources, warnings: research.warnings,
      },
      visuals: scenesOut.map((s) => ({ scene: s.index, origin: s.visual?.origin ?? "none", license: s.visual?.license ?? "-", author: s.visual?.author ?? "-", source_url: s.visual?.source_url ?? "" })),
      human: { status: "pending", note: null, reviewed_at: null },
    };
    const reportPath = path.join(dir, "qc_report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    store.transition(job.id, passed ? "awaiting_review" : "rejected", {
      qc_json: JSON.stringify(checks), qc_passed: passed ? 1 : 0, duration_sec: tech.duration, resolution: tech.resolution, report_path: reportPath,
      error: passed ? null : `QC técnico reprovado: ${checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}`,
    });
    L(passed ? "QC técnico aprovado → aguardando revisão humana (fatos + aprovação)" : "REPROVADO no QC técnico");
  } catch (err) {
    const msg = (err as Error).message;
    if (err instanceof CancelledError) { L("Cancelado"); store.transition(job.id, "cancelled", { error: msg }); return; }
    const to = nextAfterFailure(err, job.attempts, cfg.MAX_ATTEMPTS);
    L(`Erro: ${msg} → ${to === "queued" ? "nova tentativa" : "falhou"}`);
    store.transition(job.id, to, { error: msg });
  }
}

/** Keep the report's human section in sync with the review decision. */
export function recordReview(reportPath: string | null, status: "approved" | "rejected", note: string) {
  if (!reportPath || !fs.existsSync(reportPath)) return;
  const r = JSON.parse(fs.readFileSync(reportPath, "utf8")) as QualityReport;
  r.human = { status, note, reviewed_at: new Date().toISOString() };
  fs.writeFileSync(reportPath, JSON.stringify(r, null, 2));
}
