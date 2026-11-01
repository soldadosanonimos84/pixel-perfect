// Official TikTok Login Kit (OAuth v2) + Content Posting API (Direct Post, FILE_UPLOAD). No simulation:
// every success comes from TikTok's real responses. Requires an app approved by TikTok with scope video.publish.
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import type { Config } from "./config.ts";
import type { JobStore } from "./db.ts";
import type { PlatformPublisher } from "./publishing.ts";

export const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const API = "https://open.tiktokapis.com/v2";
export const SCOPES = ["user.info.basic", "video.publish"];
const MB = 1024 * 1024;

export function isConfigured(cfg: Config) {
  return !!cfg.TIKTOK_CLIENT_KEY && !!cfg.TIKTOK_CLIENT_SECRET;
}

/** TikTok desktop PKCE uses the hex-encoded SHA-256 of the verifier. */
export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("hex");
}

export function buildAuthUrl(cfg: Config, state: string, verifier: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_key", cfg.TIKTOK_CLIENT_KEY);
  u.searchParams.set("scope", SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", cfg.TIKTOK_REDIRECT_URI);
  u.searchParams.set("state", state);
  if (cfg.TIKTOK_APP_TYPE === "desktop") {
    u.searchParams.set("code_challenge", pkceChallenge(verifier));
    u.searchParams.set("code_challenge_method", "S256");
  }
  return u.toString();
}

/** TikTok rules: ≤64 MB may go as one chunk; otherwise 5–64 MB chunks, last chunk absorbs the remainder. */
export function planChunks(size: number): { chunkSize: number; total: number } {
  if (size <= 0) throw new Error("Arquivo vazio");
  if (size <= 64 * MB) return { chunkSize: size, total: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, total: Math.floor(size / chunkSize) };
}

interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; refresh_expires_in?: number; open_id?: string; scope?: string; error?: string; error_description?: string }

export class TikTokAuth {
  store: JobStore; cfg: Config; f: typeof fetch;
  constructor(cfg: Config, store: JobStore, fetchImpl: typeof fetch = fetch) { this.cfg = cfg; this.store = store; this.f = fetchImpl; }

  start(): string {
    if (!isConfigured(this.cfg)) throw new Error("Defina TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET no .env.local.");
    const state = randomBytes(16).toString("hex");
    const verifier = randomBytes(32).toString("hex");
    this.store.db.prepare(`DELETE FROM oauth_states WHERE created_at < ?`).run(new Date(Date.now() - 15 * 60_000).toISOString());
    this.store.db.prepare(`INSERT INTO oauth_states (state, verifier, created_at) VALUES (?, ?, ?)`).run(state, verifier, new Date().toISOString());
    return buildAuthUrl(this.cfg, state, verifier);
  }

  private async token(body: Record<string, string>): Promise<void> {
    const r = await this.f(`${API}/oauth/token/`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: new URLSearchParams({ client_key: this.cfg.TIKTOK_CLIENT_KEY, client_secret: this.cfg.TIKTOK_CLIENT_SECRET, ...body }),
    });
    const j = (await r.json().catch(() => ({}))) as TokenResponse;
    if (!r.ok || j.error || !j.access_token) throw new Error(`TikTok OAuth falhou [${r.status}]: ${j.error ?? ""} ${j.error_description ?? ""}`.trim());
    const now = Date.now();
    this.store.db.prepare(`INSERT INTO oauth_tokens (platform, open_id, scope, access_token, refresh_token, expires_at, refresh_expires_at, updated_at)
      VALUES ('tiktok', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(platform) DO UPDATE SET open_id=excluded.open_id, scope=excluded.scope, access_token=excluded.access_token,
      refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, refresh_expires_at=excluded.refresh_expires_at, updated_at=excluded.updated_at`)
      .run(j.open_id ?? null, j.scope ?? "", j.access_token, j.refresh_token ?? null, new Date(now + (j.expires_in ?? 0) * 1000).toISOString(),
        j.refresh_expires_in ? new Date(now + j.refresh_expires_in * 1000).toISOString() : null, new Date(now).toISOString());
  }

  async callback(code: string, state: string) {
    const row = this.store.db.prepare(`SELECT verifier, created_at FROM oauth_states WHERE state = ?`).get(state) as { verifier: string; created_at: string } | undefined;
    this.store.db.prepare(`DELETE FROM oauth_states WHERE state = ?`).run(state);
    if (!row || Date.now() - Date.parse(row.created_at) > 15 * 60_000) throw new Error("Estado OAuth inválido ou expirado. Inicie a conexão novamente.");
    const body: Record<string, string> = { code, grant_type: "authorization_code", redirect_uri: this.cfg.TIKTOK_REDIRECT_URI };
    if (this.cfg.TIKTOK_APP_TYPE === "desktop") body.code_verifier = row.verifier;
    await this.token(body);
  }

  row() {
    return this.store.db.prepare(`SELECT * FROM oauth_tokens WHERE platform='tiktok'`).get() as
      { open_id: string | null; scope: string; access_token: string; refresh_token: string | null; expires_at: string; refresh_expires_at: string | null; updated_at: string } | undefined;
  }

  /** Valid access token, refreshing when needed; null when not authorized. */
  async accessToken(): Promise<string | null> {
    const r = this.row();
    if (!r) return null;
    if (Date.parse(r.expires_at) - Date.now() > 60_000) return r.access_token;
    if (!r.refresh_token || (r.refresh_expires_at && Date.parse(r.refresh_expires_at) < Date.now())) return null;
    await this.token({ grant_type: "refresh_token", refresh_token: r.refresh_token });
    return this.row()?.access_token ?? null;
  }

  disconnect() { this.store.db.prepare(`DELETE FROM oauth_tokens WHERE platform='tiktok'`).run(); }

  status() {
    const r = this.row();
    return { configured: isConfigured(this.cfg), connected: !!r, open_id: r?.open_id ?? null, scopes: r?.scope ? r.scope.split(",") : [], expires_at: r?.expires_at ?? null, redirect_uri: this.cfg.TIKTOK_REDIRECT_URI, app_type: this.cfg.TIKTOK_APP_TYPE };
  }
}

interface ApiEnvelope<T> { data?: T; error?: { code: string; message: string; log_id?: string } }

export class TikTokPublisher implements PlatformPublisher {
  platform = "tiktok" as const;
  auth: TikTokAuth; f: typeof fetch;
  constructor(auth: TikTokAuth, fetchImpl: typeof fetch = fetch) { this.auth = auth; this.f = fetchImpl; }

  async isAuthorized() { try { return !!(await this.auth.accessToken()); } catch { return false; } }
  async hasPermissions() { return (this.auth.row()?.scope ?? "").split(",").includes("video.publish"); }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const token = await this.auth.accessToken();
    if (!token) throw new Error("Conta TikTok não autorizada.");
    const r = await this.f(`${API}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as ApiEnvelope<T>;
    if (!r.ok || (j.error && j.error.code !== "ok")) throw new Error(`TikTok ${path} [${r.status}]: ${j.error?.code ?? ""} ${j.error?.message ?? ""}`.trim());
    return j.data as T;
  }

  creatorInfo() {
    return this.post<{ privacy_level_options: string[]; creator_username?: string; max_video_post_duration_sec?: number }>("/post/publish/creator_info/query/", {});
  }

  async publish(input: { videoPath: string; caption: string; privacyLevel: string }): Promise<{ externalId: string }> {
    const info = await this.creatorInfo();
    if (!info.privacy_level_options.includes(input.privacyLevel)) throw new Error(`Privacidade "${input.privacyLevel}" não permitida para esta conta (${info.privacy_level_options.join(", ")}).`);
    const size = fs.statSync(input.videoPath).size;
    const { chunkSize, total } = planChunks(size);
    const init = await this.post<{ publish_id: string; upload_url: string }>("/post/publish/video/init/", {
      post_info: { title: input.caption.slice(0, 2200), privacy_level: input.privacyLevel, disable_duet: false, disable_comment: false, disable_stitch: false, video_cover_timestamp_ms: 1000, is_aigc: true },
      source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: total },
    });
    const fd = fs.openSync(input.videoPath, "r");
    try {
      for (let i = 0; i < total; i++) {
        const start = i * chunkSize;
        const end = i === total - 1 ? size - 1 : start + chunkSize - 1;
        const buf = Buffer.alloc(end - start + 1);
        fs.readSync(fd, buf, 0, buf.length, start);
        const r = await this.f(init.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(buf.length), "Content-Range": `bytes ${start}-${end}/${size}` }, body: buf });
        if (!r.ok) throw new Error(`Upload TikTok falhou no bloco ${i + 1}/${total} [${r.status}]: ${(await r.text()).slice(0, 300)}`);
      }
    } finally { fs.closeSync(fd); }
    return { externalId: init.publish_id };
  }

  async status(publishId: string): Promise<{ status: string; fail_reason?: string }> {
    return this.post("/post/publish/status/fetch/", { publish_id: publishId });
  }
}
