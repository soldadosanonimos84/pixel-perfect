// Quality control. Technical checks (ffprobe/volumedetect), captions and sync. Factual review and human approval are separate stages.
import fs from "node:fs";
import { run } from "./exec.ts";

export interface QCCheck {
  name: string;
  category: "technical" | "audio" | "captions" | "sync";
  passed: boolean;
  detail: string;
}

export interface ProbeData {
  streams?: { codec_type?: string; width?: number; height?: number; codec_name?: string }[];
  format?: { duration?: string; format_name?: string };
}

export function evaluateProbe(p: ProbeData, limits: { minDuration: number; maxDuration: number }): { checks: QCCheck[]; duration: number | null; resolution: string | null } {
  const streams = p.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  const duration = p.format?.duration ? Number(p.format.duration) : NaN;
  const fmt = p.format?.format_name ?? "";
  const resolution = v?.width && v?.height ? `${v.width}x${v.height}` : null;
  const checks: QCCheck[] = [
    { name: "Fluxo de vídeo", category: "technical", passed: !!v, detail: v ? `codec ${v.codec_name}` : "ausente" },
    { name: "Fluxo de áudio", category: "technical", passed: !!a, detail: a ? `codec ${a.codec_name}` : "ausente" },
    { name: "Resolução 1080x1920", category: "technical", passed: resolution === "1080x1920", detail: resolution ?? "desconhecida" },
    {
      name: "Duração válida", category: "technical",
      passed: Number.isFinite(duration) && duration >= limits.minDuration && duration <= limits.maxDuration,
      detail: Number.isFinite(duration) ? `${duration.toFixed(1)}s (alvo ${limits.minDuration}–${limits.maxDuration}s)` : "inválida",
    },
    { name: "Formato MP4", category: "technical", passed: /mp4/.test(fmt), detail: fmt || "desconhecido" },
  ];
  return { checks, duration: Number.isFinite(duration) ? duration : null, resolution };
}

export function evaluateAudioLevel(v: { mean: number; max: number } | null): QCCheck[] {
  if (!v) return [{ name: "Nível de áudio", category: "audio", passed: false, detail: "não foi possível medir" }];
  return [
    { name: "Volume médio audível", category: "audio", passed: v.mean >= -30 && v.mean <= -8, detail: `${v.mean.toFixed(1)} dB (alvo −30 a −8)` },
    { name: "Sem clipping", category: "audio", passed: v.max <= -0.1, detail: `pico ${v.max.toFixed(1)} dB` },
  ];
}

export function evaluateCaptions(ass: string, burned: boolean): QCCheck[] {
  const n = (ass.match(/^Dialogue: 1,/gm) ?? []).length;
  return [
    { name: "Legendas geradas", category: "captions", passed: n > 0, detail: `${n} linhas` },
    { name: "Legendas gravadas no vídeo", category: "captions", passed: burned && n > 0, detail: burned ? "filtro subtitles aplicado no render" : "não" },
  ];
}

export function evaluateSync(i: { audio: number; video: number | null; scenesTotal: number; lastCaptionEnd: number }): QCCheck[] {
  const v = i.video ?? NaN;
  return [
    { name: "Vídeo e narração com mesma duração", category: "sync", passed: Math.abs(v - i.audio) <= 0.5, detail: `vídeo ${Number.isFinite(v) ? v.toFixed(2) : "?"}s · áudio ${i.audio.toFixed(2)}s` },
    { name: "Cenas cobrem a narração", category: "sync", passed: Math.abs(i.scenesTotal - i.audio) <= 0.5, detail: `cenas ${i.scenesTotal.toFixed(2)}s` },
    { name: "Legendas terminam dentro do vídeo", category: "sync", passed: i.lastCaptionEnd <= (Number.isFinite(v) ? v : i.audio) + 0.1, detail: `última legenda ${i.lastCaptionEnd.toFixed(2)}s` },
  ];
}

export async function probe(ffprobe: string, file: string): Promise<ProbeData> {
  const r = await run(ffprobe, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error(`ffprobe falhou: ${r.stderr.slice(-400)}`);
  return JSON.parse(r.stdout) as ProbeData;
}

export async function technicalQC(ffprobe: string, file: string, limits: { minDuration: number; maxDuration: number }) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    return { checks: [{ name: "Arquivo existe e é legível", category: "technical" as const, passed: false, detail: "não encontrado ou vazio" }], duration: null, resolution: null };
  }
  const res = evaluateProbe(await probe(ffprobe, file), limits);
  res.checks.unshift({ name: "Arquivo existe e é legível", category: "technical", passed: true, detail: `${(fs.statSync(file).size / 1e6).toFixed(1)} MB` });
  return res;
}
