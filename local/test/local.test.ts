import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { parseScript, generateScript } from "../src/script.ts";
import { canTransition, nextAfterFailure, RecoverableError } from "../src/jobs.ts";
import { JobStore } from "../src/db.ts";
import { evaluateProbe, evaluateSync, evaluateCaptions, evaluateAudioLevel } from "../src/qc.ts";
import { run, DependencyMissingError } from "../src/exec.ts";
import { processJob, type PipelineDeps } from "../src/pipeline.ts";
import { getConfig } from "../src/config.ts";
import { checkPublishGate, TikTokPublisherNotConfigured, type PlatformPublisher } from "../src/publishing.ts";
import { checkClaim } from "../src/verify.ts";
import { sceneTimings, buildCues, chunkText, toAss, escapeAss, SCENE_GAP_SEC } from "../src/captions.ts";
import { dueSlots, schedulerTick, saveSchedule, getSchedule, zonedToUtc } from "../src/scheduler.ts";
import { planChunks, buildAuthUrl, pkceChallenge } from "../src/tiktok.ts";
import { FREE_LICENSE } from "../src/assets.ts";
import type { Source } from "../src/research.ts";

const narr = "A Justiça Eleitoral realiza testes públicos de segurança nas urnas eletrônicas antes de cada eleição no Brasil.";
const valid = {
  title: "Urna eletrônica",
  scenes: [
    { narration: narr, visual_query: "urna eletrônica" },
    { narration: narr, visual_query: "tribunal" },
    { narration: narr, visual_query: "votação" },
  ],
  cta: "Consulte o site do TSE.",
  factual_claims: [{ text: "Há testes públicos de segurança", kind: "fact", source_ids: ["S1"] }],
};
const src = (excerpt: string): Source => ({ id: "S1", title: "t", url: "https://x", publisher: "p", kind: "user", retrieved_at: "", excerpt });

describe("script validation", () => {
  it("accepts a valid scene script, even inside code fences", () => {
    expect(parseScript("```json\n" + JSON.stringify(valid) + "\n```").scenes).toHaveLength(3);
  });
  it("rejects non-JSON, too few scenes and too few words as recoverable", () => {
    expect(() => parseScript("desculpe")).toThrow(RecoverableError);
    expect(() => parseScript(JSON.stringify({ ...valid, scenes: valid.scenes.slice(0, 2) }))).toThrow(/scenes/);
    const short = { ...valid, scenes: valid.scenes.map((s) => ({ ...s, narration: "Texto curto demais aqui." })) };
    expect(() => parseScript(JSON.stringify(short))).toThrow(/palavras/);
  });
  it("marks Ollama unavailable as recoverable", async () => {
    const fetchImpl = (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;
    await expect(generateScript("tema", [], { url: "http://x", model: "m", timeoutMs: 1000, fetchImpl })).rejects.toBeInstanceOf(RecoverableError);
  });
});

describe("claim support (never a fact-check)", () => {
  it("flags facts without sources as unsupported", () => {
    expect(checkClaim({ text: "A urna tem 10 anos", kind: "fact", source_ids: [] }, []).support).toBe("unsupported");
    expect(checkClaim({ text: "A urna tem 10 anos", kind: "fact", source_ids: ["S9"] }, [src("x")]).support).toBe("unsupported");
  });
  it("finds textual evidence only when terms and numbers match", () => {
    const s = [src("A urna eletrônica foi adotada em 1996 pela Justiça Eleitoral.")];
    expect(checkClaim({ text: "A urna eletrônica foi adotada em 1996", kind: "fact", source_ids: ["S1"] }, s).support).toBe("textual_evidence");
    expect(checkClaim({ text: "A urna eletrônica foi adotada em 1998", kind: "fact", source_ids: ["S1"] }, s).support).toBe("weak_evidence");
  });
  it("keeps analysis separate", () => {
    expect(checkClaim({ text: "Isso aumenta a confiança", kind: "analysis", source_ids: [] }, []).support).toBe("analysis");
  });
});

describe("captions", () => {
  it("timeline follows real scene durations plus gaps", () => {
    const t = sceneTimings([3, 4]);
    expect(t[1]!.start).toBeCloseTo(3 + SCENE_GAP_SEC);
    expect(t[1]!.end).toBeCloseTo(7 + 2 * SCENE_GAP_SEC);
    const cues = buildCues([narr, narr], t);
    expect(cues.at(-1)!.end).toBeCloseTo(t[1]!.start + 4);
    expect(cues.every((c) => c.text.length <= 38 || !c.text.includes(" "))).toBe(true);
  });
  it("chunks and escapes text for ASS", () => {
    expect(chunkText("um dois três quatro cinco seis sete oito")).toEqual(["um dois três quatro cinco seis sete", "oito"]);
    expect(escapeAss("a{b}\\c")).toBe("ab\\\\c");
    expect(toAss([{ start: 0, end: 1, text: "Oi" }], [], "Arial")).toMatch(/Dialogue: 1,0:00:00.00,0:00:01.00,Caption/);
  });
});

describe("job states and controls", () => {
  it("allows only defined transitions; QC pass never means approved", () => {
    expect(canTransition("queued", "researching")).toBe(true);
    expect(canTransition("quality_check", "approved")).toBe(false);
    expect(canTransition("awaiting_review", "approved")).toBe(true);
  });
  it("atomic claim, duplicate protection, pause/resume/cancel/retry", () => {
    const s = new JobStore(":memory:");
    const j = s.create("Como funciona o TSE");
    expect(() => s.create("como funciona o tse")).toThrow(/Já existe/);
    s.pause(j.id); expect(s.claimNext()).toBeUndefined();
    s.resume(j.id); expect(s.claimNext()?.id).toBe(j.id);
    expect(s.claimNext()).toBeUndefined();
    expect(s.cancel(j.id)).toBe("requested");
    expect(s.recoverUnfinished(3)).toBe(1);
    expect(s.get(j.id)?.status).toBe("cancelled");
    s.retry(j.id); expect(s.get(j.id)?.status).toBe("queued");
  });
  it("human approval requires awaiting_review and passed QC", () => {
    const s = new JobStore(":memory:");
    const j = s.create("Revisão humana obrigatória");
    expect(() => s.review(j.id, "approve", "ok")).toThrow(/revisão humana/);
  });
});

describe("retry behavior", () => {
  it("bounded retries", () => {
    expect(nextAfterFailure(new RecoverableError("x"), 1, 3)).toBe("queued");
    expect(nextAfterFailure(new RecoverableError("x"), 3, 3)).toBe("failed");
    expect(nextAfterFailure(new Error("fatal"), 1, 3)).toBe("failed");
  });
  it("pipeline requeues on recoverable failure and fails on fatal", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-"));
    const cfg = getConfig({ OUTPUT_DIR: dir, DB_PATH: ":memory:", RESEARCH_ENABLED: "false" } as NodeJS.ProcessEnv);
    const s = new JobStore(":memory:");
    const j = s.create("Teste de nova tentativa");
    await processJob(cfg, s, s.claimNext()!, { generateScript: async () => { throw new RecoverableError("Ollama off"); } });
    expect(s.get(j.id)?.status).toBe("queued");
    await processJob(cfg, s, s.claimNext()!, { generateScript: async () => { throw new Error("modelo ausente"); } });
    expect(s.get(j.id)?.status).toBe("failed");
  });
  it("reports missing executables clearly", async () => {
    await expect(run("definitely-not-a-binary-xyz", ["-v"])).rejects.toBeInstanceOf(DependencyMissingError);
  });
});

describe("quality checks", () => {
  const limits = { minDuration: 15, maxDuration: 90 };
  it("passes a valid vertical mp4 and fails a bad one", () => {
    expect(evaluateProbe({ streams: [{ codec_type: "video", width: 1080, height: 1920, codec_name: "h264" }, { codec_type: "audio", codec_name: "aac" }], format: { duration: "42.1", format_name: "mov,mp4" } }, limits).checks.every((c) => c.passed)).toBe(true);
    const r = evaluateProbe({ streams: [{ codec_type: "video", width: 1920, height: 1080 }], format: { duration: "5", format_name: "matroska" } }, limits);
    expect(r.checks.filter((c) => !c.passed).map((c) => c.name)).toEqual(["Fluxo de áudio", "Resolução 1080x1920", "Duração válida", "Formato MP4"]);
  });
  it("sync, captions and audio level checks", () => {
    expect(evaluateSync({ audio: 30, video: 30.2, scenesTotal: 30, lastCaptionEnd: 29.8 }).every((c) => c.passed)).toBe(true);
    expect(evaluateSync({ audio: 30, video: 25, scenesTotal: 30, lastCaptionEnd: 29.8 }).some((c) => !c.passed)).toBe(true);
    expect(evaluateCaptions("", true).every((c) => !c.passed)).toBe(true);
    expect(evaluateAudioLevel({ mean: -45, max: -10 })[0]!.passed).toBe(false);
  });
});

describe("scheduler", () => {
  it("is disabled by default and creates nothing", () => {
    const s = new JobStore(":memory:");
    expect(getSchedule(s).enabled).toBe(false);
    expect(getSchedule(s).times).toEqual(["12:00", "18:00", "21:00"]);
    expect(schedulerTick(s).created).toHaveLength(0);
  });
  it("converts São Paulo local time to UTC", () => {
    expect(zonedToUtc("2026-10-19", "12:00", "America/Sao_Paulo").toISOString()).toBe("2026-10-19T15:00:00.000Z");
  });
  it("creates one job per due slot, never duplicates, respects daily limit", () => {
    const s = new JobStore(":memory:");
    saveSchedule(s, { enabled: true, topics: ["Como funciona o segundo turno", "O que faz o TSE", "Como votar em trânsito"], lead_minutes: 120, daily_limit: 3 });
    const now = new Date("2026-10-19T14:00:00Z"); // 11:00 SP → 12:00 slot due
    expect(dueSlots(now, getSchedule(s))).toHaveLength(1);
    expect(schedulerTick(s, now).created).toHaveLength(1);
    expect(schedulerTick(s, now).created).toHaveLength(0);
    saveSchedule(s, { ...getSchedule(s), daily_limit: 1 });
    expect(schedulerTick(s, new Date("2026-10-19T20:30:00Z")).created).toHaveLength(0);
  });
  it("paused scheduler does nothing", () => {
    const s = new JobStore(":memory:");
    saveSchedule(s, { enabled: true, paused: true, topics: ["Tema de teste válido"] });
    expect(schedulerTick(s, new Date("2026-10-19T14:00:00Z")).created).toHaveLength(0);
  });
});

describe("publishing + TikTok", () => {
  const okPub: PlatformPublisher = { platform: "tiktok", isAuthorized: async () => true, hasPermissions: async () => true, publish: async () => ({ externalId: "x" }) };
  it("blocks by default", async () => {
    const s = new JobStore(":memory:");
    const j = s.create("Publicação bloqueada");
    const g = await checkPublishGate(getConfig({} as NodeJS.ProcessEnv), s, j.id, new TikTokPublisherNotConfigured(), "SELF_ONLY");
    expect(g.allowed).toBe(false);
  });
  it("blocks without human approval even when enabled and authorized", async () => {
    const s = new JobStore(":memory:");
    const j = s.create("Sem aprovação humana");
    s.db.prepare(`UPDATE jobs SET status='awaiting_review', qc_passed=1, video_path='v.mp4' WHERE id=?`).run(j.id);
    const g = await checkPublishGate(getConfig({ PUBLISHING_ENABLED: "true" } as NodeJS.ProcessEnv), s, j.id, okPub, "SELF_ONLY");
    expect(g.reasons).toEqual(["Falta aprovação humana explícita (revisão de fatos e conteúdo)."]);
    s.review(j.id, "approve", "conferido");
    expect((await checkPublishGate(getConfig({ PUBLISHING_ENABLED: "true" } as NodeJS.ProcessEnv), s, j.id, okPub, "SELF_ONLY")).allowed).toBe(true);
  });
  it("chunk plan follows TikTok limits", () => {
    expect(planChunks(30 * 1024 * 1024)).toEqual({ chunkSize: 30 * 1024 * 1024, total: 1 });
    expect(planChunks(105 * 1024 * 1024)).toEqual({ chunkSize: 10 * 1024 * 1024, total: 10 });
  });
  it("auth URL carries scopes, state and PKCE for desktop", () => {
    const u = new URL(buildAuthUrl(getConfig({ TIKTOK_CLIENT_KEY: "k" } as NodeJS.ProcessEnv), "st", "ver"));
    expect(u.searchParams.get("scope")).toBe("user.info.basic,video.publish");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("code_challenge")).toBe(pkceChallenge("ver"));
  });
  it("accepts only free licenses for images", () => {
    expect(["CC BY-SA 4.0", "CC0", "Public domain", "CC BY 2.0"].every((l) => FREE_LICENSE.test(l))).toBe(true);
    expect(["Fair use", "All rights reserved", "CC BY-NC 4.0"].some((l) => FREE_LICENSE.test(l))).toBe(false);
  });
});

// Real FFmpeg render on this machine (Linux). Piper/Ollama are replaced by a tone generator + fixed script.
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
describe.skipIf(!hasFfmpeg)("real render with burned captions (ffmpeg, no Piper/Ollama)", () => {
  it("produces a 1080x1920 MP4 that passes technical QC and waits for human review", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-render-"));
    const cfg = getConfig({ OUTPUT_DIR: dir, DB_PATH: ":memory:", RESEARCH_ENABLED: "false", COMMONS_ENABLED: "false", ASSETS_DIR: path.join(dir, "none"), MIN_DURATION_SEC: "5" } as NodeJS.ProcessEnv);
    const s = new JobStore(":memory:");
    const j = s.create("Teste de render real");
    const deps: Partial<PipelineDeps> = {
      generateScript: async () => parseScript(JSON.stringify(valid)),
      synthesize: async (_e, _v, _t, out) => {
        const r = await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2.5", "-af", "volume=0.3", out]);
        if (r.code !== 0) throw new Error(r.stderr);
      },
    };
    await processJob(cfg, s, s.claimNext()!, deps);
    const final = s.get(j.id)!;
    expect(final.error).toBeNull();
    expect(final.status).toBe("awaiting_review");
    expect(final.resolution).toBe("1080x1920");
    const report = JSON.parse(fs.readFileSync(final.report_path!, "utf8"));
    expect(report.technical.passed).toBe(true);
    expect(report.factual.status).toBe("manual_review_required");
    expect(report.factual.unsupported).toBe(1);
  }, 120_000);
});
