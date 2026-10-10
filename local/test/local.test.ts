import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { parseScript, generateScript } from "../src/script.ts";
import { canTransition, nextAfterFailure, RecoverableError } from "../src/jobs.ts";
import { JobStore } from "../src/db.ts";
import { evaluateProbe } from "../src/qc.ts";
import { run, DependencyMissingError } from "../src/exec.ts";
import { processJob, type PipelineDeps } from "../src/pipeline.ts";
import { getConfig } from "../src/config.ts";
import { checkPublishGate, TikTokPublisherNotConfigured } from "../src/publishing.ts";

const valid = {
  title: "Urna eletrônica", hook: "Você sabe como a urna é auditada?", body: "A Justiça Eleitoral realiza testes públicos de segurança antes das eleições.",
  conclusion: "Os procedimentos são públicos.", cta: "Consulte o site do TSE.", estimated_duration: 40,
  factual_claims: [{ text: "Há testes públicos de segurança", kind: "fact", source: "TSE" }],
};

describe("script validation", () => {
  it("accepts valid JSON, even inside code fences", () => {
    expect(parseScript("```json\n" + JSON.stringify(valid) + "\n```").title).toBe("Urna eletrônica");
  });
  it("rejects non-JSON and invalid shape as recoverable", () => {
    expect(() => parseScript("desculpe")).toThrow(RecoverableError);
    expect(() => parseScript(JSON.stringify({ ...valid, hook: "" }))).toThrow(/hook/);
  });
  it("marks Ollama unavailable as recoverable", async () => {
    const fetchImpl = (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;
    await expect(generateScript("tema", { url: "http://x", model: "m", timeoutMs: 1000, fetchImpl })).rejects.toBeInstanceOf(RecoverableError);
  });
});

describe("job state transitions", () => {
  it("allows only defined transitions", () => {
    expect(canTransition("queued", "generating_script")).toBe(true);
    expect(canTransition("queued", "approved")).toBe(false);
    expect(canTransition("approved", "queued")).toBe(false);
  });
  it("store enforces transitions and atomic claim", () => {
    const s = new JobStore(":memory:");
    const j = s.create("Como funciona o TSE");
    expect(() => s.transition(j.id, "approved")).toThrow();
    expect(s.claimNext()?.id).toBe(j.id);
    expect(s.claimNext()).toBeUndefined(); // no double processing
    expect(() => s.create("como funciona o tse")).toThrow(/Já existe/);
  });
  it("recovers unfinished jobs after restart", () => {
    const s = new JobStore(":memory:");
    const j = s.create("Recuperação de jobs");
    s.claimNext();
    expect(s.recoverUnfinished(3)).toBe(1);
    expect(s.get(j.id)?.status).toBe("queued");
  });
});

describe("retry behavior", () => {
  it("retries recoverable errors until max attempts", () => {
    expect(nextAfterFailure(new RecoverableError("x"), 1, 3)).toBe("queued");
    expect(nextAfterFailure(new RecoverableError("x"), 3, 3)).toBe("failed");
    expect(nextAfterFailure(new Error("fatal"), 1, 3)).toBe("failed");
  });
  it("pipeline requeues on recoverable failure and fails on fatal", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-"));
    const cfg = getConfig({ OUTPUT_DIR: dir, DB_PATH: ":memory:" } as NodeJS.ProcessEnv);
    const s = new JobStore(":memory:");
    const j = s.create("Teste de nova tentativa");
    const deps = { generateScript: async () => { throw new RecoverableError("Ollama off"); } } as unknown as PipelineDeps;
    await processJob(cfg, s, s.claimNext()!, deps);
    expect(s.get(j.id)?.status).toBe("queued");
    const fatal = { generateScript: async () => { throw new Error("modelo ausente"); } } as unknown as PipelineDeps;
    await processJob(cfg, s, s.claimNext()!, fatal);
    expect(s.get(j.id)?.status).toBe("failed");
    s.retry(j.id);
    expect(s.get(j.id)?.status).toBe("queued");
  });
});

describe("failed dependencies", () => {
  it("reports missing executables clearly", async () => {
    await expect(run("definitely-not-a-binary-xyz", ["-v"])).rejects.toBeInstanceOf(DependencyMissingError);
  });
});

describe("ffprobe checks", () => {
  const limits = { minDuration: 15, maxDuration: 90 };
  it("passes a valid vertical mp4", () => {
    const r = evaluateProbe({ streams: [{ codec_type: "video", width: 1080, height: 1920, codec_name: "h264" }, { codec_type: "audio", codec_name: "aac" }], format: { duration: "42.1", format_name: "mov,mp4,m4a,3gp,3g2,mj2" } }, limits);
    expect(r.checks.every((c) => c.passed)).toBe(true);
  });
  it("fails on missing audio, wrong resolution, bad duration", () => {
    const r = evaluateProbe({ streams: [{ codec_type: "video", width: 1920, height: 1080 }], format: { duration: "5", format_name: "matroska" } }, limits);
    expect(r.checks.filter((c) => !c.passed).map((c) => c.name)).toEqual(["Fluxo de áudio", "Resolução 1080x1920", "Duração válida", "Formato MP4"]);
  });
});

describe("publishing gate", () => {
  it("blocks by default", async () => {
    const s = new JobStore(":memory:");
    const j = s.create("Publicação bloqueada");
    const g = await checkPublishGate(getConfig({} as NodeJS.ProcessEnv), s, j.id, new TikTokPublisherNotConfigured());
    expect(g.allowed).toBe(false);
    expect(g.reasons.length).toBeGreaterThan(2);
  });
});
