// Local HTTP API bound to 127.0.0.1. Only enqueues and reads jobs; generation runs in the worker process.
import http from "node:http";
import fs from "node:fs";
import { loadEnvFile, getConfig } from "./config.ts";
import { JobStore } from "./db.ts";
import { topicSchema } from "./script.ts";
import { diagnose } from "./doctor.ts";
import { checkPublishGate, TikTokPublisherNotConfigured } from "./publishing.ts";

loadEnvFile();
const cfg = getConfig();
const store = new JobStore(cfg.DB_PATH);
const ID = /^[0-9a-f-]{36}$/;

function send(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 10_000) throw new Error("Corpo muito grande");
  }
  return data ? JSON.parse(data) : {};
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && cfg.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  } else if (origin) {
    return send(res, 403, { error: "Origem não permitida. Adicione-a em ALLOWED_ORIGINS." });
  }
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, model: cfg.OLLAMA_MODEL, publishingEnabled: cfg.PUBLISHING_ENABLED === "true", diagnostics: await diagnose(cfg) });
    }
    if (req.method === "GET" && url.pathname === "/jobs") return send(res, 200, store.list().map((j) => store.toView(j)));
    if (req.method === "POST" && url.pathname === "/jobs") {
      const body = (await readJson(req)) as { topic?: unknown };
      const t = topicSchema.safeParse(body.topic);
      if (!t.success) return send(res, 400, { error: t.error.issues[0]?.message ?? "Tema inválido" });
      return send(res, 201, store.toView(store.create(t.data)));
    }
    if (parts[0] === "jobs" && parts[1] && ID.test(parts[1])) {
      const job = store.get(parts[1]);
      if (!job) return send(res, 404, { error: "Job não encontrado" });
      if (req.method === "GET" && parts.length === 2) return send(res, 200, store.toView(job));
      if (req.method === "POST" && parts[2] === "retry") { store.retry(job.id); return send(res, 200, store.toView(store.get(job.id)!)); }
      if (req.method === "GET" && parts[2] === "script" && job.script_path) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        return fs.createReadStream(job.script_path).pipe(res);
      }
      if (req.method === "GET" && parts[2] === "video" && job.video_path && fs.existsSync(job.video_path)) {
        const size = fs.statSync(job.video_path).size;
        const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
        if (range) {
          const start = Number(range[1]);
          const end = range[2] ? Number(range[2]) : size - 1;
          res.writeHead(206, { "Content-Type": "video/mp4", "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
          return fs.createReadStream(job.video_path, { start, end }).pipe(res);
        }
        res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": size, "Accept-Ranges": "bytes" });
        return fs.createReadStream(job.video_path).pipe(res);
      }
      if (req.method === "POST" && parts[2] === "publish") {
        const gate = await checkPublishGate(cfg, store, job.id, new TikTokPublisherNotConfigured());
        return send(res, gate.allowed ? 501 : 409, { published: false, ...gate, note: gate.allowed ? "Adaptador TikTok ainda não implementado." : undefined });
      }
    }
    send(res, 404, { error: "Rota não encontrada" });
  } catch (e) {
    send(res, 400, { error: (e as Error).message });
  }
});

if (cfg.API_HOST !== "127.0.0.1" && cfg.API_HOST !== "localhost") console.warn("ATENÇÃO: API exposta fora do localhost.");
server.listen(cfg.API_PORT, cfg.API_HOST, () => console.log(`API local em http://${cfg.API_HOST}:${cfg.API_PORT}`));
