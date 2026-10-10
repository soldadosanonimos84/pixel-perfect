// Background worker: recovers unfinished jobs, then processes the queue one job at a time.
import { loadEnvFile, getConfig } from "./config.ts";
import { JobStore } from "./db.ts";
import { processJob } from "./pipeline.ts";

loadEnvFile();
const cfg = getConfig();
const store = new JobStore(cfg.DB_PATH);
const recovered = store.recoverUnfinished(cfg.MAX_ATTEMPTS);
console.log(`Worker iniciado. Banco: ${cfg.DB_PATH}. Jobs recuperados: ${recovered}`);

let stopping = false;
process.on("SIGINT", () => { stopping = true; console.log("Encerrando após o job atual..."); });

while (!stopping) {
  const job = store.claimNext();
  if (job) await processJob(cfg, store, job);
  else await new Promise((r) => setTimeout(r, cfg.WORKER_POLL_MS));
}
process.exit(0);
