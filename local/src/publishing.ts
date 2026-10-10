// Publishing gate. Disabled by default; no fake publishing. The TikTok Content Posting API adapter is not implemented yet.
import type { JobStore } from "./db.ts";
import type { Config } from "./config.ts";

export interface PlatformPublisher {
  platform: "tiktok" | "kwai";
  isAuthorized(): Promise<boolean>; // valid OAuth user token
  hasPermissions(): Promise<boolean>; // video.publish scope approved by TikTok review
  publish(input: { videoPath: string; caption: string }): Promise<{ externalId: string }>;
}

export class TikTokPublisherNotConfigured implements PlatformPublisher {
  platform = "tiktok" as const;
  async isAuthorized() { return false; }
  async hasPermissions() { return false; }
  async publish(): Promise<{ externalId: string }> { throw new Error("TikTok Content Posting API não conectada."); }
}

export interface GateResult { allowed: boolean; reasons: string[] }

export async function checkPublishGate(cfg: Config, store: JobStore, jobId: string, pub: PlatformPublisher): Promise<GateResult> {
  const reasons: string[] = [];
  const job = store.get(jobId);
  if (cfg.PUBLISHING_ENABLED !== "true") reasons.push("Publicação desativada (PUBLISHING_ENABLED=false).");
  if (!job) reasons.push("Job não encontrado.");
  else {
    if (job.status !== "approved") reasons.push("O vídeo não passou no controle de qualidade.");
    if (!job.video_path) reasons.push("Sem arquivo de vídeo.");
  }
  if (!(await pub.isAuthorized())) reasons.push("Conta TikTok não autorizada (OAuth pendente).");
  if (!(await pub.hasPermissions())) reasons.push("Permissões da Content Posting API não confirmadas.");
  const dup = store.db.prepare(`SELECT id FROM publications WHERE job_id = ? AND platform = ? AND status IN ('processing','published')`).get(jobId, pub.platform);
  if (dup) reasons.push("Este vídeo já foi publicado nesta plataforma.");
  if (job) store.log(jobId, `Verificação de publicação: ${reasons.length ? "bloqueada — " + reasons.join(" ") : "liberada"}`);
  return { allowed: reasons.length === 0, reasons };
}
