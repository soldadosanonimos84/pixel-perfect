// Background worker: recovers unfinished jobs, runs the scheduler, processes the queue one job at a time,
// and performs approved TikTok uploads + status polling.
import { loadEnvFile, getConfig } from "./config.ts";
import { JobStore } from "./db.ts";
import { processJob } from "./pipeline.ts";
import { schedulerTick } from "./scheduler.ts";
import { TikTokAuth, TikTokPublisher } from "./tiktok.ts";
import { checkPublishGate } from "./publishing.ts";

loadEnvFile();
const cfg = getConfig();
const store = new JobStore(cfg.DB_PATH);
const publisher = new TikTokPublisher(new TikTokAuth(cfg, store));
const recovered = store.recoverUnfinished(cfg.MAX_ATTEMPTS);
// Uploads interrupted mid-way cannot be resumed safely: mark them failed so a human decides.
for (const p of store.publicationsIn(["processing"])) store.updatePublication(p.id, { status: "failed", message: "Upload interrompido por reinício; solicite novamente." });
console.log(`Worker iniciado. Banco: ${cfg.DB_PATH}. Jobs recuperados: ${recovered}`);

let stopping = false;
process.on("SIGINT", () => { stopping = true; console.log("Encerrando após a etapa atual..."); });

let lastTick = 0;
async function publishingTick() {
  for (const p of store.publicationsIn(["pending"])) {
    const job = store.get(p.job_id);
    // Re-check the gate at upload time (approval, QC, auth may have changed).
    const gate = await checkPublishGate(cfg, store, p.job_id, publisher, p.privacy_level ?? undefined).catch((e) => ({ allowed: false, reasons: [(e as Error).message] }));
    const blocking = gate.reasons.filter((r) => !r.startsWith("Este vídeo já foi enviado"));
    if (blocking.length || !job?.video_path) { store.updatePublication(p.id, { status: "failed", message: blocking.join(" ") || "Sem vídeo" }); continue; }
    store.updatePublication(p.id, { status: "processing", message: "Enviando para a TikTok" });
    try {
      const r = await publisher.publish({ videoPath: job.video_path, caption: p.caption ?? job.topic, privacyLevel: p.privacy_level! });
      store.updatePublication(p.id, { status: "submitted", external_id: r.externalId, message: "Enviado; aguardando processamento da TikTok" });
      store.log(job.id, `TikTok: upload concluído (publish_id ${r.externalId})`);
    } catch (e) {
      store.updatePublication(p.id, { status: "failed", message: (e as Error).message });
      store.log(job.id, `TikTok: falha — ${(e as Error).message}`);
    }
  }
  for (const p of store.publicationsIn(["submitted"])) {
    try {
      const s = await publisher.status(p.external_id!);
      if (s.status === "PUBLISH_COMPLETE") store.updatePublication(p.id, { status: "published", message: "Publicado (confirmado pela TikTok)" });
      else if (s.status === "FAILED") store.updatePublication(p.id, { status: "failed", message: `TikTok: ${s.fail_reason ?? "falhou"}` });
      else store.updatePublication(p.id, { status: "submitted", message: `TikTok: ${s.status}` });
    } catch (e) { console.error(`Status TikTok: ${(e as Error).message}`); }
  }
}

while (!stopping) {
  if (Date.now() - lastTick >= cfg.SCHEDULER_TICK_MS) {
    lastTick = Date.now();
    try {
      const t = schedulerTick(store);
      if (t.created.length) console.log(`Agendador criou ${t.created.length} job(s)`);
      for (const n of t.notes) console.warn(`Agendador: ${n}`);
      await publishingTick();
    } catch (e) { console.error(`Tick: ${(e as Error).message}`); }
  }
  const job = store.claimNext();
  if (job) await processJob(cfg, store, job);
  else await new Promise((r) => setTimeout(r, cfg.WORKER_POLL_MS));
}
process.exit(0);
