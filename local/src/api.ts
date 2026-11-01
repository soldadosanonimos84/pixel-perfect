// Local HTTP API bound to 127.0.0.1. Only enqueues/reads/updates records; generation and uploads run in the worker.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadEnvFile, getConfig } from "./config.ts";
import { JobStore } from "./db.ts";
import { topicSchema } from "./script.ts";
import { diagnose } from "./doctor.ts";
import { checkPublishGate, buildCaption, PRIVACY_LEVELS } from "./publishing.ts";
import { getSchedule, saveSchedule } from "./scheduler.ts";
import { jobDir, recordReview } from "./pipeline.ts";
import { TikTokAuth, TikTokPublisher } from "./tiktok.ts";
import { validateUserUrl } from "./research.ts";

loadEnvFile();
const cfg = getConfig();
const store = new JobStore(cfg.DB_PATH);
const auth = new TikTokAuth(cfg, store);
const publisher = new TikTokPublisher(auth);
const ID = /^[0-9a-f-]{36}$/;

const createSchema = z.object({ topic: topicSchema, source_urls: z.array(z.string().max(500)).max(8).default([]) });
const reviewSchema = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().min(3, "Escreva uma observação").max(1000), confirm_facts_reviewed: z.boolean().optional() });
const publishSchema = z.object({ privacy_level: z.enum(PRIVACY_LEVELS) });

function send(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
function html(res: http.ServerResponse, code: number, msg: string) {
  res.writeHead(code, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:2rem">${msg.replace(/</g, "&lt;")}<p>Pode fechar esta aba e voltar ao painel.</p>`);
}
async function readJson(req: http.IncomingMessage): Promise<unknown> {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 100_000) throw new Error("Corpo muito grande");
  }
  return data ? JSON.parse(data) : {};
}
const readIf = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
const readJsonIf = (f: string) => { const t = readIf(f); return t ? JSON.parse(t) : null; };

function streamFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, type: string) {
  const size = fs.statSync(file).size;
  const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && cfg.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  } else if (origin && req.method !== "GET") {
    return send(res, 403, { error: "Origem não permitida. Adicione-a em ALLOWED_ORIGINS." });
  }
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, model: cfg.OLLAMA_MODEL, publishingEnabled: cfg.PUBLISHING_ENABLED === "true", diagnostics: await diagnose(cfg) });
    }
    // ---- schedule ----
    if (url.pathname === "/schedule") {
      if (req.method === "GET") return send(res, 200, getSchedule(store));
      if (req.method === "PUT") return send(res, 200, saveSchedule(store, await readJson(req)));
    }
    // ---- TikTok OAuth ----
    if (req.method === "GET" && url.pathname === "/tiktok/status") return send(res, 200, { ...auth.status(), publishingEnabled: cfg.PUBLISHING_ENABLED === "true" });
    if (req.method === "POST" && url.pathname === "/tiktok/connect") return send(res, 200, { url: auth.start() });
    if (req.method === "POST" && url.pathname === "/tiktok/disconnect") { auth.disconnect(); return send(res, 200, auth.status()); }
    if (req.method === "GET" && url.pathname === "/tiktok/creator-info") return send(res, 200, await publisher.creatorInfo());
    if (req.method === "GET" && url.pathname === "/tiktok/callback") {
      const err = url.searchParams.get("error");
      if (err) return html(res, 400, `TikTok recusou a autorização: ${err} ${url.searchParams.get("error_description") ?? ""}`);
      const code = url.searchParams.get("code"), state = url.searchParams.get("state");
      if (!code || !state) return html(res, 400, "Resposta da TikTok sem code/state.");
      try { await auth.callback(code, state); return html(res, 200, "Conta TikTok conectada."); }
      catch (e) { return html(res, 400, (e as Error).message); }
    }
    // ---- jobs ----
    if (req.method === "GET" && url.pathname === "/jobs") return send(res, 200, store.list().map((j) => store.toView(j)));
    if (req.method === "POST" && url.pathname === "/jobs") {
      const b = createSchema.safeParse(await readJson(req));
      if (!b.success) return send(res, 400, { error: b.error.issues[0]?.message ?? "Dados inválidos" });
      const urls = b.data.source_urls.map((u) => u.trim()).filter(Boolean).map(validateUserUrl);
      return send(res, 201, store.toView(store.create(b.data.topic, { source_urls: urls })));
    }
    if (parts[0] === "jobs" && parts[1] && ID.test(parts[1])) {
      const job = store.get(parts[1]);
      if (!job) return send(res, 404, { error: "Job não encontrado" });
      const dir = jobDir(cfg, job.id);
      const action = parts[2];
      if (req.method === "GET" && !action) {
        return send(res, 200, {
          ...store.toView(job),
          detail: {
            research: readJsonIf(path.join(dir, "research.json")),
            script: readJsonIf(path.join(dir, "script.json")),
            scenes: readJsonIf(path.join(dir, "scenes.json")),
            captions: readIf(path.join(dir, "captions.srt")),
            report: job.report_path ? readJsonIf(job.report_path) : null,
          },
        });
      }
      if (req.method === "POST") {
        if (action === "retry") { store.retry(job.id); return send(res, 200, store.toView(store.get(job.id)!)); }
        if (action === "pause") { store.pause(job.id); return send(res, 200, store.toView(store.get(job.id)!)); }
        if (action === "resume") { store.resume(job.id); return send(res, 200, store.toView(store.get(job.id)!)); }
        if (action === "cancel") { const r = store.cancel(job.id); return send(res, 200, { result: r, job: store.toView(store.get(job.id)!) }); }
        if (action === "review") {
          const b = reviewSchema.safeParse(await readJson(req));
          if (!b.success) return send(res, 400, { error: b.error.issues[0]?.message ?? "Dados inválidos" });
          if (b.data.decision === "approve" && b.data.confirm_facts_reviewed !== true) return send(res, 400, { error: "Confirme que conferiu as afirmações nas fontes antes de aprovar." });
          store.review(job.id, b.data.decision, b.data.note);
          recordReview(job.report_path, b.data.decision === "approve" ? "approved" : "rejected", b.data.note);
          return send(res, 200, store.toView(store.get(job.id)!));
        }
        if (action === "publish") {
          const b = publishSchema.safeParse(await readJson(req));
          const gate = await checkPublishGate(cfg, store, job.id, publisher, b.success ? b.data.privacy_level : undefined);
          if (!gate.allowed || !b.success) return send(res, 409, { queued: false, ...gate });
          const script = readJsonIf(path.join(dir, "script.json")) ?? { title: job.topic, cta: "" };
          const research = readJsonIf(path.join(dir, "research.json")) ?? { sources: [] };
          const scenes = (readJsonIf(path.join(dir, "scenes.json")) ?? []) as { visual?: { credit?: string } | null }[];
          const caption = buildCaption(script, research.sources, [...new Set(scenes.map((s) => s.visual?.credit).filter(Boolean) as string[])]);
          const p = store.requestPublication(job.id, "tiktok", b.data.privacy_level, caption);
          store.log(job.id, "Publicação TikTok enfileirada; o worker fará o upload.");
          return send(res, 202, { queued: true, publication: p, reasons: [] });
        }
      }
      if (req.method === "GET") {
        if (action === "script" && job.script_path && fs.existsSync(job.script_path)) return streamFile(req, res, job.script_path, "application/json; charset=utf-8");
        if (action === "report" && job.report_path && fs.existsSync(job.report_path)) return streamFile(req, res, job.report_path, "application/json; charset=utf-8");
        if (action === "captions" && fs.existsSync(path.join(dir, "captions.srt"))) return streamFile(req, res, path.join(dir, "captions.srt"), "text/plain; charset=utf-8");
        if (action === "video" && job.video_path && fs.existsSync(job.video_path)) return streamFile(req, res, job.video_path, "video/mp4");
        if (action === "scene" && parts[3] && /^\d{1,2}$/.test(parts[3])) {
          const scenes = (readJsonIf(path.join(dir, "scenes.json")) ?? []) as { index: number; visual?: { path: string } | null }[];
          const s = scenes.find((x) => x.index === Number(parts[3]));
          if (s?.visual?.path && fs.existsSync(s.visual.path)) return streamFile(req, res, s.visual.path, /\.png$/i.test(s.visual.path) ? "image/png" : "image/jpeg");
        }
      }
    }
    send(res, 404, { error: "Rota não encontrada" });
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message;
    send(res, 400, { error: msg });
  }
});

if (cfg.API_HOST !== "127.0.0.1" && cfg.API_HOST !== "localhost") console.warn("ATENÇÃO: API exposta fora do localhost.");
server.listen(cfg.API_PORT, cfg.API_HOST, () => console.log(`API local em http://${cfg.API_HOST}:${cfg.API_PORT}`));
