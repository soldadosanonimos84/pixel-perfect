// Machine-specific configuration. Every value comes from env (.env.local), never from user input.
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

/** Minimal .env loader (no dependency). Existing process env wins. */
export function loadEnvFile(file = path.resolve(process.cwd(), ".env.local")) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const schema = z.object({
  OLLAMA_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen2.5:7b"),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(240_000),
  PIPER_EXE: z.string().min(1).default("piper"),
  PIPER_VOICE: z.string().default(""),
  FFMPEG_EXE: z.string().min(1).default("ffmpeg"),
  FFPROBE_EXE: z.string().min(1).default("ffprobe"),
  OUTPUT_DIR: z.string().min(1).default("./output"),
  DB_PATH: z.string().min(1).default("./output/factory.db"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  ALLOWED_ORIGINS: z.string().default("http://localhost:8080,http://127.0.0.1:8080"),
  MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  WORKER_POLL_MS: z.coerce.number().int().min(250).default(2000),
  MIN_DURATION_SEC: z.coerce.number().positive().default(15),
  MAX_DURATION_SEC: z.coerce.number().positive().default(90),
  PUBLISHING_ENABLED: z.enum(["true", "false"]).default("false"),
});

export type Config = z.infer<typeof schema> & { allowedOrigins: string[] };

export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const c = schema.parse(env);
  return {
    ...c,
    OUTPUT_DIR: path.resolve(c.OUTPUT_DIR),
    DB_PATH: path.resolve(c.DB_PATH),
    allowedOrigins: c.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  };
}
