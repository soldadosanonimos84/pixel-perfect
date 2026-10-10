// CLI: `doctor` checks dependencies; `generate "<tema>"` runs one job synchronously (end-to-end test).
import { loadEnvFile, getConfig } from "./config.ts";
import { JobStore } from "./db.ts";
import { diagnose } from "./doctor.ts";
import { processJob } from "./pipeline.ts";
import { topicSchema } from "./script.ts";

loadEnvFile();
const cfg = getConfig();
const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "doctor") {
  const d = await diagnose(cfg);
  for (const x of d) console.log(`${x.ok ? "OK  " : "FALHA"} ${x.name.padEnd(22)} ${x.detail}${!x.ok && x.fix ? `\n      → ${x.fix}` : ""}`);
  process.exit(d.every((x) => x.ok) ? 0 : 1);
} else if (cmd === "generate") {
  const topic = topicSchema.parse(rest.join(" ") || "Como funciona a urna eletrônica brasileira");
  const store = new JobStore(cfg.DB_PATH);
  store.create(`${topic} [teste ${new Date().toISOString()}]`);
  const job = store.claimNext()!;
  await processJob({ ...cfg, MAX_ATTEMPTS: 1 }, store, job);
  const final = store.get(job.id)!;
  console.log(`\nStatus: ${final.status}\nVídeo: ${final.video_path ?? "-"}\nErro: ${final.error ?? "-"}`);
  process.exit(final.status === "approved" ? 0 : 1);
} else {
  console.log('Uso: cli.ts doctor | cli.ts generate "tema"');
  process.exit(2);
}
