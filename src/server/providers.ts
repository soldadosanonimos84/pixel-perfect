// Server-only provider contracts. Each implementation is swappable via env/settings.
// Never import this from client components; credentials are read from process.env inside handlers.
import type { FactualClaim } from "@/lib/types";

export interface LLMProvider {
  generate(input: { system: string; prompt: string; json?: boolean }): Promise<string>;
}
export interface TTSProvider {
  synthesize(input: { text: string; voice: string; lang: "pt-BR" }): Promise<{ audioPath: string; durationSec: number }>;
}
export interface ImageProvider {
  generate(input: { prompt: string; width: 1080; height: 1920 }): Promise<{ imagePath: string }>;
}
export interface TranscriptionProvider {
  transcribe(input: { audioPath: string; lang: "pt-BR" }): Promise<{ srtPath: string }>;
}
export interface VideoRenderer {
  render(input: { images: string[]; audioPath: string; srtPath: string; out: string }): Promise<{ videoPath: string; durationSec: number }>;
}
export interface PlatformPublisher {
  platform: "tiktok" | "kwai";
  publish(input: { videoPath: string; caption: string }): Promise<{ externalId: string }>;
}

export interface ScriptOutput {
  hook: string;
  body: string;
  conclusion: string;
  cta: string;
  estimated_duration: number;
  sources: string[];
  factual_claims: FactualClaim[];
}

/** Ollama — POST {OLLAMA_URL}/api/generate. Placeholder until connected. */
export class OllamaLLM implements LLMProvider {
  constructor(private baseUrl: string, private model: string) {}
  async generate({ system, prompt, json }: { system: string; prompt: string; json?: boolean }) {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, system, prompt, stream: false, format: json ? "json" : undefined }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    return ((await res.json()) as { response: string }).response;
  }
}

/** TikTok Content Posting API placeholder. Uses official OAuth tokens held server-side only. */
export class TikTokPublisher implements PlatformPublisher {
  platform = "tiktok" as const;
  async publish(): Promise<{ externalId: string }> {
    throw new Error("TikTok Content Posting API not connected yet");
  }
}

export const SCRIPT_SYSTEM_PROMPT = `Você gera roteiros informativos (pt-BR) sobre política brasileira.
Regras: não persuadir a favor ou contra candidatos, partidos ou ideologias; não inventar dados, citações,
pesquisas, votos ou leis; cada afirmação factual deve citar IDs das fontes fornecidas; rotule "fact" ou "analysis".
Responda apenas em JSON com: hook, body, conclusion, cta, estimated_duration, sources, factual_claims.`;
