// Scene visuals: user library first (ASSETS_DIR, optional JSON sidecar with license), then Wikimedia Commons
// restricted to free licenses (CC0 / public domain / CC BY / CC BY-SA) with attribution recorded. Otherwise no image.
import fs from "node:fs";
import path from "node:path";
import { tokens, stripHtml } from "./text.ts";

export interface Visual {
  path: string;
  origin: "user" | "wikimedia_commons";
  license: string;
  author: string;
  source_url: string;
  credit: string; // burned-in attribution line
}

const IMG = /\.(jpe?g|png)$/i;
export const FREE_LICENSE = /^(cc0|cc[- ]by(-sa)?([- ][\d.]+)?|public domain|pd\b|pd-)/i;

export function pickFromLibrary(dir: string, query: string): Visual | null {
  if (!dir || !fs.existsSync(dir)) return null;
  const q = new Set(tokens(query));
  let best: { file: string; score: number; meta: Record<string, unknown> } | null = null;
  for (const f of fs.readdirSync(dir)) {
    if (!IMG.test(f)) continue;
    const side = path.join(dir, f.replace(IMG, ".json"));
    let meta: Record<string, unknown> = {};
    if (fs.existsSync(side)) try { meta = JSON.parse(fs.readFileSync(side, "utf8")) as Record<string, unknown>; } catch { /* ignore bad sidecar */ }
    const tags = [...tokens(f.replace(IMG, "")), ...((meta.tags as string[] | undefined) ?? []).flatMap((t) => tokens(t))];
    const score = tags.filter((t) => q.has(t)).length;
    if (score > 0 && (!best || score > best.score)) best = { file: f, score, meta };
  }
  if (!best) return null;
  const license = String(best.meta.license ?? "Fornecida pelo usuário");
  const author = String(best.meta.author ?? "");
  return {
    path: path.join(dir, best.file), origin: "user", license, author, source_url: String(best.meta.source_url ?? ""),
    credit: best.meta.license ? `Imagem: ${author || "autor"} · ${license}` : "",
  };
}

interface CommonsPage { title: string; imageinfo?: { thumburl?: string; url: string; mime: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }

export async function pickFromCommons(query: string, outFile: string, ua: string, fetchImpl: typeof fetch = fetch): Promise<Visual | null> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=1080`;
  const r = await fetchImpl(url, { headers: { "User-Agent": ua }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Commons HTTP ${r.status}`);
  const pages = Object.values(((await r.json()) as { query?: { pages?: Record<string, CommonsPage> } }).query?.pages ?? {});
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    const lic = ii?.extmetadata?.LicenseShortName?.value ?? "";
    if (!ii || !/image\/(jpeg|png)/.test(ii.mime) || !FREE_LICENSE.test(lic)) continue;
    const img = await fetchImpl(ii.thumburl ?? ii.url, { headers: { "User-Agent": ua }, signal: AbortSignal.timeout(30_000) });
    if (!img.ok) continue;
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 5_000 || buf.length > 15_000_000) continue;
    fs.writeFileSync(outFile, buf);
    const author = stripHtml(ii.extmetadata?.Artist?.value ?? "desconhecido").slice(0, 80);
    return { path: outFile, origin: "wikimedia_commons", license: lic, author, source_url: ii.descriptionurl, credit: `Imagem: ${author} · ${lic} · Wikimedia Commons` };
  }
  return null;
}
