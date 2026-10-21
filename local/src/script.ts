// Scene-based script generation via local Ollama + strict validation. Facts must cite research source IDs.
import { z } from "zod";
import { RecoverableError } from "./jobs.ts";
import type { Source } from "./research.ts";

export const sceneSchema = z.object({
  narration: z.string().trim().min(10).max(400),
  visual_query: z.string().trim().min(2).max(80),
  on_screen_text: z.string().trim().max(60).default(""),
});

export const scriptSchema = z.object({
  title: z.string().trim().min(3).max(140),
  scenes: z.array(sceneSchema).min(3).max(10),
  cta: z.string().trim().min(3).max(200),
  hashtags: z.array(z.string().regex(/^#?[\p{L}\p{N}_]{2,30}$/u)).max(6).default([]),
  factual_claims: z
    .array(z.object({ text: z.string().min(3), kind: z.enum(["fact", "analysis"]), source_ids: z.array(z.string()).default([]) }))
    .default([]),
}).superRefine((s, ctx) => {
  const words = s.scenes.map((x) => x.narration).join(" ").split(/\s+/).length;
  if (words < 40 || words > 200) ctx.addIssue({ code: "custom", path: ["scenes"], message: `narração com ${words} palavras (esperado 40–200)` });
});
export type GeneratedScript = z.infer<typeof scriptSchema>;

export const topicSchema = z
  .string()
  .trim()
  .min(5, "Tema muito curto")
  .max(200, "Tema muito longo")
  .refine((s) => !/[\u0000-\u001f]/.test(s), "Caracteres inválidos");

export const SYSTEM_PROMPT = `Você escreve roteiros curtos (30 a 60 segundos, 80 a 150 palavras no total) em português do Brasil sobre informação política e eleitoral, divididos em 4 a 7 cenas.
Regras obrigatórias:
- Conteúdo apenas informativo. Não persuada a favor ou contra candidatos, partidos ou ideologias.
- Use SOMENTE informações presentes nas FONTES fornecidas para afirmações factuais. Nunca invente estatísticas, citações, pesquisas, votos, leis, declarações ou notícias.
- Se as fontes não sustentam um dado, não o mencione.
- Liste cada afirmação em factual_claims com kind "fact" (cite os IDs em source_ids, ex.: ["S1"]) ou "analysis" (contexto/explicação).
- visual_query: 2 a 5 palavras descrevendo uma imagem genérica e neutra (ex.: "urna eletrônica", "Congresso Nacional"), nunca rostos de candidatos.
Responda SOMENTE com JSON: {"title","scenes":[{"narration","visual_query","on_screen_text"}],"cta","hashtags","factual_claims":[{"text","kind","source_ids"}]}`;

export function buildPrompt(topic: string, sources: Source[]): string {
  const src = sources.length
    ? sources.map((s) => `[${s.id}] ${s.title} (${s.url})\n${s.excerpt.slice(0, 1500)}`).join("\n\n")
    : "(nenhuma fonte disponível — não faça afirmações factuais específicas; explique apenas conceitos gerais e marque-os como analysis)";
  return `Tema: ${topic}\n\nFONTES:\n${src}`;
}

/** Parse + validate model output. Tolerates code fences / surrounding text. */
export function parseScript(raw: string): GeneratedScript {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new RecoverableError("O modelo não retornou JSON.");
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new RecoverableError("O modelo retornou JSON malformado.");
  }
  const res = scriptSchema.safeParse(obj);
  if (!res.success) throw new RecoverableError(`Roteiro inválido: ${res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return res.data;
}

export async function generateScript(
  topic: string,
  sources: Source[],
  opts: { url: string; model: string; timeoutMs: number; fetchImpl?: typeof fetch },
): Promise<GeneratedScript> {
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(`${opts.url}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: opts.model, system: SYSTEM_PROMPT, prompt: buildPrompt(topic, sources), stream: false, format: "json", options: { temperature: 0.3 } }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (e) {
    throw new RecoverableError(`Ollama indisponível em ${opts.url} (${(e as Error).message}). Execute "ollama serve".`);
  }
  if (res.status === 404) throw new Error(`Modelo "${opts.model}" não encontrado. Execute: ollama pull ${opts.model}`);
  if (!res.ok) throw new RecoverableError(`Ollama respondeu ${res.status}`);
  const data = (await res.json()) as { response?: string };
  return parseScript(data.response ?? "");
}
