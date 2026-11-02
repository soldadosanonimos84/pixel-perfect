// Dependency diagnostics, shared by the API (/health) and `npm run local:doctor`.
import fs from "node:fs";
import type { Config } from "./config.ts";
import { run, DependencyMissingError } from "./exec.ts";

export interface Diagnostic { name: string; ok: boolean; detail: string; fix?: string; optional?: boolean }

async function version(exe: string, args: string[]): Promise<Diagnostic["detail"] | null> {
  try {
    const r = await run(exe, args, { timeoutMs: 10_000 });
    return (r.stdout || r.stderr).split(/\r?\n/)[0]?.trim() || `código ${r.code}`;
  } catch (e) {
    if (e instanceof DependencyMissingError) return null;
    throw e;
  }
}

export async function diagnose(cfg: Config): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  const [maj, min] = process.versions.node.split(".").map(Number);
  out.push({ name: "Node.js", ok: maj! > 22 || (maj === 22 && min! >= 18), detail: process.versions.node, fix: "Instale Node.js 22.18+ ou 24 LTS" });

  try {
    const r = await fetch(`${cfg.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(4000) });
    const tags = ((await r.json()) as { models?: { name: string }[] }).models ?? [];
    const has = tags.some((t) => t.name === cfg.OLLAMA_MODEL || t.name.startsWith(`${cfg.OLLAMA_MODEL}:`));
    out.push({ name: "Ollama", ok: true, detail: `online em ${cfg.OLLAMA_URL}` });
    out.push({ name: `Modelo ${cfg.OLLAMA_MODEL}`, ok: has, detail: has ? "instalado" : "não instalado", fix: `ollama pull ${cfg.OLLAMA_MODEL}` });
  } catch {
    out.push({ name: "Ollama", ok: false, detail: `sem resposta em ${cfg.OLLAMA_URL}`, fix: "Instale o Ollama e execute: ollama serve" });
  }

  const ff = await version(cfg.FFMPEG_EXE, ["-version"]);
  out.push({ name: "FFmpeg", ok: !!ff, detail: ff ?? "não encontrado", fix: "winget install Gyan.FFmpeg ou defina FFMPEG_EXE" });
  const fp = await version(cfg.FFPROBE_EXE, ["-version"]);
  out.push({ name: "FFprobe", ok: !!fp, detail: fp ?? "não encontrado", fix: "Vem junto com o FFmpeg; defina FFPROBE_EXE" });
  const pp = await version(cfg.PIPER_EXE, ["--help"]);
  out.push({ name: "Piper", ok: !!pp, detail: pp ? "encontrado" : "não encontrado", fix: "Baixe o Piper (Windows amd64) e defina PIPER_EXE" });
  const voiceOk = !!cfg.PIPER_VOICE && fs.existsSync(cfg.PIPER_VOICE);
  out.push({ name: "Voz Piper (pt-BR)", ok: voiceOk, detail: voiceOk ? "modelo encontrado" : "PIPER_VOICE ausente ou inválido", fix: "Baixe pt_BR-faber-medium.onnx (+ .onnx.json) e defina PIPER_VOICE" });

  try {
    const r = await run(cfg.FFMPEG_EXE, ["-hide_banner", "-filters"], { timeoutMs: 10_000 });
    const ok = / subtitles /.test(r.stdout);
    out.push({ name: "FFmpeg com libass", ok, detail: ok ? "filtro subtitles disponível" : "sem filtro subtitles", fix: "Use a build completa do FFmpeg (Gyan full) para legendas gravadas" });
  } catch { /* FFmpeg ausente já reportado */ }

  const libOk = fs.existsSync(cfg.ASSETS_DIR);
  out.push({ name: "Biblioteca de imagens", ok: libOk, optional: true, detail: libOk ? cfg.ASSETS_DIR : "pasta ausente (opcional)", fix: `Crie ${cfg.ASSETS_DIR} e coloque suas imagens (+ .json com licença)` });
  for (const [name, url, on] of [["Wikipédia (pesquisa)", `https://${cfg.WIKIPEDIA_LANG}.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json`, cfg.RESEARCH_ENABLED], ["Wikimedia Commons (imagens)", "https://commons.wikimedia.org/w/api.php?action=query&meta=siteinfo&format=json", cfg.COMMONS_ENABLED]] as const) {
    if (on !== "true") { out.push({ name, ok: true, optional: true, detail: "desativado" }); continue; }
    try { const r = await fetch(url, { headers: { "User-Agent": cfg.HTTP_USER_AGENT }, signal: AbortSignal.timeout(5000) }); out.push({ name, ok: r.ok, optional: true, detail: r.ok ? "acessível" : `HTTP ${r.status}` }); }
    catch { out.push({ name, ok: false, optional: true, detail: "sem acesso à internet", fix: "Sem internet, os vídeos usam fundo neutro e só fontes informadas por você" }); }
  }
  const tk = !!cfg.TIKTOK_CLIENT_KEY && !!cfg.TIKTOK_CLIENT_SECRET;
  out.push({ name: "TikTok API", ok: tk, optional: true, detail: tk ? `credenciais definidas · publicação ${cfg.PUBLISHING_ENABLED === "true" ? "ativada" : "desativada"}` : "não configurado (publicação indisponível)", fix: "Veja docs/LOCAL_FACTORY.md › TikTok" });

  try {
    fs.mkdirSync(cfg.OUTPUT_DIR, { recursive: true });
    fs.accessSync(cfg.OUTPUT_DIR, fs.constants.W_OK);
    out.push({ name: "Pasta de saída", ok: true, detail: "gravável" });
  } catch {
    out.push({ name: "Pasta de saída", ok: false, detail: "sem permissão de escrita", fix: "Ajuste OUTPUT_DIR" });
  }
  return out;
}
