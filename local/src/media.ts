// Narration (Piper, one WAV per scene for exact timing) and rendering (FFmpeg, burned-in ASS captions).
import fs from "node:fs";
import { run } from "./exec.ts";
import { probe } from "./qc.ts";
import { SCENE_GAP_SEC } from "./captions.ts";

export async function synthesize(piperExe: string, voice: string, text: string, outWav: string) {
  if (!voice) throw new Error("PIPER_VOICE não configurado (caminho do modelo .onnx).");
  if (!fs.existsSync(voice)) throw new Error(`Modelo de voz Piper não encontrado: ${voice}`);
  const r = await run(piperExe, ["--model", voice, "--output_file", outWav], { input: text, timeoutMs: 180_000 });
  if (r.code !== 0 || !fs.existsSync(outWav)) throw new Error(`Piper falhou (código ${r.code}): ${r.stderr.slice(-400)}`);
}

export async function audioDuration(ffprobe: string, file: string): Promise<number> {
  const d = Number((await probe(ffprobe, file)).format?.duration);
  if (!Number.isFinite(d) || d <= 0) throw new Error("Não foi possível medir a duração do áudio.");
  return d;
}

/** Concatenate scene WAVs, padding each with SCENE_GAP_SEC of silence (matches caption timeline). */
export async function concatAudio(ffmpeg: string, wavs: string[], out: string) {
  const inputs = wavs.flatMap((w) => ["-i", w]);
  const pads = wavs.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=mono,apad=pad_dur=${SCENE_GAP_SEC}[a${i}]`).join(";");
  const filter = `${pads};${wavs.map((_, i) => `[a${i}]`).join("")}concat=n=${wavs.length}:v=0:a=1[out]`;
  const r = await run(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", filter, "-map", "[out]", "-c:a", "pcm_s16le", out], { timeoutMs: 120_000 });
  if (r.code !== 0) throw new Error(`FFmpeg (áudio) falhou: ${r.stderr.slice(-400)}`);
}

export interface RenderInput {
  cwd: string; // job directory; captions file is referenced relative to it (no Windows filter-path escaping)
  scenes: { duration: number; image: string | null }[];
  audio: string;
  assFile: string; // file name inside cwd
  out: string;
  duration: number;
}

export function renderArgs(i: RenderInput): string[] {
  const inputs: string[] = [];
  i.scenes.forEach((s) => {
    const d = s.duration.toFixed(3);
    if (s.image) inputs.push("-loop", "1", "-framerate", "30", "-t", d, "-i", s.image);
    else inputs.push("-f", "lavfi", "-t", d, "-i", "color=c=0x0b0f14:s=1080x1920:r=30");
  });
  inputs.push("-i", i.audio);
  const n = i.scenes.length;
  const vf = i.scenes
    .map((_, k) => `[${k}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p[v${k}]`)
    .join(";");
  const filter = `${vf};${i.scenes.map((_, k) => `[v${k}]`).join("")}concat=n=${n}:v=1:a=0[vc];[vc]subtitles=filename=${i.assFile}[vout];[${n}:a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`;
  return [
    "-y", "-hide_banner", "-loglevel", "error", ...inputs,
    "-filter_complex", filter, "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
    "-t", i.duration.toFixed(3), "-movflags", "+faststart", i.out,
  ];
}

export async function render(ffmpeg: string, input: RenderInput) {
  const r = await run(ffmpeg, renderArgs(input), { timeoutMs: 900_000, cwd: input.cwd });
  if (r.code !== 0) throw new Error(`FFmpeg falhou (código ${r.code}): ${r.stderr.slice(-600)}`);
}

export async function measureVolume(ffmpeg: string, file: string): Promise<{ mean: number; max: number } | null> {
  const r = await run(ffmpeg, ["-hide_banner", "-i", file, "-map", "0:a", "-af", "volumedetect", "-f", "null", "-"], { timeoutMs: 120_000 });
  const mean = Number(r.stderr.match(/mean_volume:\s*(-?[\d.]+)/)?.[1]);
  const max = Number(r.stderr.match(/max_volume:\s*(-?[\d.]+)/)?.[1]);
  return Number.isFinite(mean) && Number.isFinite(max) ? { mean, max } : null;
}
