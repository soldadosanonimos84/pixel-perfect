// Technical quality control from ffprobe output. Editorial/factual checks are separate and will plug in later
// as additional QCCheck producers with category "editorial" | "sources" | "subtitles" | "audio".
import fs from "node:fs";
import { run } from "./exec.ts";

export interface QCCheck {
  name: string;
  category: "technical";
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
