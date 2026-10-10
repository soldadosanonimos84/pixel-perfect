// Script generation via local Ollama + strict validation.
import { z } from "zod";
import { RecoverableError } from "./jobs.ts";

export const scriptSchema = z.object({
  title: z.string().min(3).max(140),
  hook: z.string().min(5).max(300),
  body: z.string().min(20).max(2000),
  conclusion: z.string().min(5).max(400),
  cta: z.string().min(3).max(200),
  estimated_duration: z.number().min(10).max(120),
  factual_claims: z
    .array(z.object({ text: z.string().min(3), kind: z.enum(["fact", "analysis"]), source: z.string().default("") }))
    .default([]),
});
export type GeneratedScript = z.infer<typeof scriptSchema>;

export const topicSchema = z
  .string()
  .trim()
  .min(5, "Tema muito curto")
  .max(200, "Tema muito longo")
  .refine((s) => !/[\u0000-\u001f]/.test(s), "Caracteres inválidos");

export const SYSTEM_PROMPT = `Você escreve roteiros curtos (30 a 60 segundos) em português do Brasil sobre informação política e eleitoral.
Regras obrigatórias:
- Conteúdo apenas informativo. Não persuada a favor ou contra candidatos, partidos ou ideologias.
- Nunca invente estatísticas, citações, pesquisas, votos, leis, declarações ou notícias.
- Se não tiver certeza de um dado, não o mencione.
- Classifique cada afirmação em factual_claims como "fact" ou "analysis" e indique a fonte esperada (ex.: "TSE", "Constituição Federal art. 14"); use "" se não houver fonte.
Responda SOMENTE com JSON válido com as chaves: title, hook, body, conclusion, cta, estimated_duration (número, segundos), factual_claims.`;

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

export function narrationText(s: GeneratedScript): string {
  return [s.hook, s.body, s.conclusion, s.cta].map((x) => x.trim()).join(" ");
}

export async function generateScript(
  topic: string,
  opts: { url: string; model: string; timeoutMs: number; fetchImpl?: typeof fetch },
): Promise<GeneratedScript> {
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(`${opts.url}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: opts.model, system: SYSTEM_PROMPT, prompt: `Tema: ${topic}`, stream: false, format: "json", options: { temperature: 0.4 } }),
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
