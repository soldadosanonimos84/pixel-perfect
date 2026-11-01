// Publishing gate. Disabled by default; never simulates publishing. Requires: flag on, technical QC passed,
// explicit human approval, valid TikTok authorization with video.publish, allowed privacy level, no duplicate.
import type { JobStore } from "./db.ts";
import type { Config } from "./config.ts";

export interface PlatformPublisher {
  platform: "tiktok" | "kwai";
  isAuthorized(): Promise<boolean>;
  hasPermissions(): Promise<boolean>;
  publish(input: { videoPath: string; caption: string; privacyLevel: string }): Promise<{ externalId: string }>;
  status?(externalId: string): Promise<{ status: string; fail_reason?: string }>;
}

export class TikTokPublisherNotConfigured implements PlatformPublisher {
  platform = "tiktok" as const;
  async isAuthorized() { return false; }
  async hasPermissions() { return false; }
  async publish(): Promise<{ externalId: string }> { throw new Error("TikTok não configurado (TIKTOK_CLIENT_KEY/SECRET)."); }
}

export interface GateResult { allowed: boolean; reasons: string[] }

export const PRIVACY_LEVELS = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"] as const;

export async function checkPublishGate(cfg: Config, store: JobStore, jobId: string, pub: PlatformPublisher, privacyLevel?: string): Promise<GateResult> {
  const reasons: string[] = [];
  const job = store.get(jobId);
  if (cfg.PUBLISHING_ENABLED !== "true") reasons.push("Publicação desativada (PUBLISHING_ENABLED=false).");
  if (!job) reasons.push("Job não encontrado.");
  else {
    if (job.qc_passed !== 1) reasons.push("O vídeo não passou no controle de qualidade técnico.");
    if (job.status !== "approved") reasons.push("Falta aprovação humana explícita (revisão de fatos e conteúdo).");
    if (!job.video_path) reasons.push("Sem arquivo de vídeo.");
  }
  if (!privacyLevel || !(PRIVACY_LEVELS as readonly string[]).includes(privacyLevel)) reasons.push("Escolha o nível de privacidade da postagem.");
  if (!(await pub.isAuthorized())) reasons.push("Conta TikTok não autorizada (conecte pelo painel).");
  if (!(await pub.hasPermissions())) reasons.push("Escopo video.publish não concedido pela TikTok.");
  const dup = store.db.prepare(`SELECT id FROM publications WHERE job_id = ? AND platform = ? AND status IN ('pending','processing','submitted','published')`).get(jobId, pub.platform);
  if (dup) reasons.push("Este vídeo já foi enviado ou está em envio nesta plataforma.");
  if (job) store.log(jobId, `Verificação de publicação: ${reasons.length ? "bloqueada — " + reasons.join(" ") : "liberada"}`);
  return { allowed: reasons.length === 0, reasons };
}

/** Caption with sources and image credits (TikTok limit 2200 chars). */
export function buildCaption(script: { title: string; cta: string; hashtags?: string[] }, sources: { title: string; url: string }[], credits: string[]): string {
  const tags = (script.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  const src = sources.length ? `Fontes: ${sources.map((s) => s.url).join(" ")}` : "";
  const cred = credits.length ? credits.join(" | ") : "";
  return [script.title, script.cta, tags, src, cred, "Conteúdo informativo produzido com auxílio de IA e revisado por humano."].filter(Boolean).join("\n").slice(0, 2200);
}
