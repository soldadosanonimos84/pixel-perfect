// Source research: Wikipedia (secondary source, official MediaWiki API) + user-provided URLs.
// Every source keeps its URL and retrieval timestamp. This is NOT fact-checking; it only collects material for review.
import { stripHtml } from "./text.ts";

export interface Source {
  id: string; // S1, S2...
  title: string;
  url: string;
  publisher: string;
  kind: "wikipedia" | "user";
  retrieved_at: string;
  excerpt: string;
}

export interface ResearchOpts {
  lang: string;
  maxSources: number;
  userUrls: string[];
  userAgent: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function validateUserUrl(u: string): string {
  const url = new URL(u);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`URL não suportada: ${u}`);
  return url.toString();
}

async function getJson(f: typeof fetch, url: string, ua: string, timeoutMs: number): Promise<unknown> {
  const r = await f(url, { headers: { "User-Agent": ua, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${new URL(url).host}`);
  return r.json();
}

export async function researchTopic(topic: string, o: ResearchOpts): Promise<{ sources: Source[]; warnings: string[] }> {
  const f = o.fetchImpl ?? fetch;
  const timeout = o.timeoutMs ?? 15_000;
  const sources: Source[] = [];
  const warnings: string[] = [];
  const add = (s: Omit<Source, "id">) => { if (s.excerpt.length > 40) sources.push({ ...s, id: `S${sources.length + 1}` }); };

  for (const raw of o.userUrls) {
    try {
      const url = validateUserUrl(raw);
      const r = await f(url, { headers: { "User-Agent": o.userAgent }, signal: AbortSignal.timeout(timeout) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = (await r.text()).slice(0, 2_000_000);
      const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url).slice(0, 200);
      add({ title, url, publisher: new URL(url).host, kind: "user", retrieved_at: new Date().toISOString(), excerpt: stripHtml(html).slice(0, 3000) });
    } catch (e) {
      warnings.push(`Fonte do usuário inacessível (${raw}): ${(e as Error).message}`);
    }
  }

  const remaining = Math.max(0, o.maxSources - sources.length);
  if (remaining > 0) {
    const base = `https://${o.lang}.wikipedia.org/w/api.php`;
    try {
      const search = (await getJson(f, `${base}?action=query&list=search&format=json&srlimit=${remaining}&srsearch=${encodeURIComponent(topic)}`, o.userAgent, timeout)) as {
        query?: { search?: { title: string; pageid: number }[] };
      };
      const hits = search.query?.search ?? [];
      if (hits.length) {
        const ids = hits.map((h) => h.pageid).join("|");
        const ex = (await getJson(f, `${base}?action=query&prop=extracts|info&inprop=url&explaintext=1&exintro=1&format=json&pageids=${ids}`, o.userAgent, timeout)) as {
          query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string; pageid: number }> };
        };
        for (const h of hits) {
          const p = ex.query?.pages?.[String(h.pageid)];
          if (!p?.extract) continue;
          add({
            title: p.title, url: p.fullurl ?? `https://${o.lang}.wikipedia.org/?curid=${p.pageid}`,
            publisher: "Wikipédia (fonte secundária — confirme em fonte primária)", kind: "wikipedia",
            retrieved_at: new Date().toISOString(), excerpt: p.extract.slice(0, 2500),
          });
        }
      } else warnings.push("A Wikipédia não retornou resultados para o tema.");
    } catch (e) {
      warnings.push(`Pesquisa na Wikipédia indisponível: ${(e as Error).message}`);
    }
  }
  return { sources, warnings };
}
