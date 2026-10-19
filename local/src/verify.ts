// Automatic claim ↔ source matching. A textual heuristic, never a fact-check: humans must still review every claim.
import type { Source } from "./research.ts";
import { tokens, numbers, normalize } from "./text.ts";

export type ClaimSupport = "analysis" | "unsupported" | "weak_evidence" | "textual_evidence";

export interface CheckedClaim {
  text: string;
  kind: "fact" | "analysis";
  source_ids: string[];
  support: ClaimSupport;
  detail: string;
}

export const SUPPORT_LABEL: Record<ClaimSupport, string> = {
  analysis: "Análise/contexto (não é afirmação factual)",
  unsupported: "SEM FONTE — revisão manual obrigatória",
  weak_evidence: "Fonte citada, mas o trecho não confirma claramente — revisar",
  textual_evidence: "Trecho da fonte contém os termos da afirmação (heurística, não é checagem)",
};

export function checkClaim(c: { text: string; kind: "fact" | "analysis"; source_ids: string[] }, sources: Source[]): CheckedClaim {
  if (c.kind === "analysis") return { ...c, support: "analysis", detail: "Marcado como análise pelo roteirista." };
  const cited = sources.filter((s) => c.source_ids.includes(s.id));
  if (!cited.length) return { ...c, support: "unsupported", detail: c.source_ids.length ? `IDs citados não existem: ${c.source_ids.join(", ")}` : "Nenhuma fonte citada." };
  const ct = [...new Set(tokens(c.text))];
  const nums = numbers(c.text);
  let best = 0;
  let bestId = "";
  let numsOk = false;
  for (const s of cited) {
    const ex = normalize(s.excerpt);
    const exTokens = new Set(tokens(s.excerpt));
    const ratio = ct.length ? ct.filter((t) => exTokens.has(t)).length / ct.length : 0;
    const exNums = new Set(numbers(ex));
    const allNums = nums.every((n) => exNums.has(n));
    if (ratio > best || (ratio === best && allNums)) { best = ratio; bestId = s.id; numsOk = allNums; }
  }
  const pct = Math.round(best * 100);
  if (best >= 0.6 && numsOk) return { ...c, support: "textual_evidence", detail: `${pct}% dos termos encontrados em ${bestId}${nums.length ? "; números conferem" : ""}.` };
  return { ...c, support: "weak_evidence", detail: `${pct}% dos termos em ${bestId}${nums.length && !numsOk ? "; números NÃO encontrados no trecho" : ""}.` };
}

export function checkClaims(claims: { text: string; kind: "fact" | "analysis"; source_ids: string[] }[], sources: Source[]): CheckedClaim[] {
  return claims.map((c) => checkClaim(c, sources));
}
