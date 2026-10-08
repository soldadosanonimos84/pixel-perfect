import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, Server } from "lucide-react";
import { useStore, updateSettings } from "@/lib/store";
import { PageHeader, Panel, StatusBadge } from "@/components/app/ui-bits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Settings } from "@/lib/types";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/ia")({
  head: () => seo("Configuração de IA", "Provedores locais substituíveis: Ollama, ComfyUI, Whisper, TTS local e FFmpeg."),
  component: AIConfig,
});

const PROVIDERS: { key: keyof Settings; iface: string; options: { v: string; l: string }[]; endpoint: string }[] = [
  { key: "llmProvider", iface: "LLMProvider", endpoint: "OLLAMA_URL", options: [{ v: "ollama", l: "Ollama (local)" }, { v: "mock", l: "Mock" }] },
  { key: "imageProvider", iface: "ImageProvider", endpoint: "COMFYUI_URL", options: [{ v: "comfyui", l: "ComfyUI (local)" }, { v: "mock", l: "Mock" }] },
  { key: "voiceProvider", iface: "TTSProvider", endpoint: "TTS_URL", options: [{ v: "piper", l: "Piper TTS (local)" }, { v: "coqui", l: "Coqui XTTS (local)" }, { v: "mock", l: "Mock" }] },
  { key: "transcriptionProvider", iface: "TranscriptionProvider", endpoint: "WHISPER_URL", options: [{ v: "whisper", l: "Whisper (local)" }, { v: "mock", l: "Mock" }] },
];

const AGENTS = [
  ["Research Agent", "research", "LLMProvider"],
  ["Script Agent", "script", "LLMProvider"],
  ["Asset Agent", "assets", "ImageProvider"],
  ["Voice Agent", "voice", "TTSProvider"],
  ["Video Render Worker", "render", "VideoRenderer (FFmpeg)"],
  ["Subtitle Worker", "subtitles", "TranscriptionProvider"],
  ["Quality Control Agent", "quality-control", "LLMProvider + ffprobe"],
  ["Publishing Worker", "publishing", "PlatformPublisher (TikTok)"],
];

function AIConfig() {
  const s = useStore();
  return (
    <>
      <PageHeader title="Configuração de IA" subtitle="Toda inferência roda no servidor. Nenhuma credencial é exposta ao navegador." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-4 md:grid-cols-2">
          {PROVIDERS.map((p) => (
            <Panel key={p.key} title={p.iface} action={<StatusBadge status="pending" label="não conectado" />}>
              <Select value={String(s.settings[p.key])} onValueChange={(v) => updateSettings({ [p.key]: v } as Partial<Settings>)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{p.options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
              <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground"><Server className="size-3.5" /> env: {p.endpoint}</div>
            </Panel>
          ))}
          <Panel title="VideoRenderer" action={<StatusBadge status="pending" label="não conectado" />}>
            <div className="text-sm">FFmpeg · H.264 · AAC · 1080×1920 · 30fps</div>
            <div className="mt-3 font-mono text-[11px] text-muted-foreground">env: FFMPEG_PATH</div>
          </Panel>
          <Panel title="Fila de jobs" action={<StatusBadge status="pending" label="não conectado" />}>
            <div className="text-sm">Redis + BullMQ · 9 filas</div>
            <div className="mt-3 font-mono text-[11px] text-muted-foreground">env: REDIS_URL</div>
          </Panel>
        </div>
        <Panel title="Arquitetura de agentes">
          <div className="space-y-1">
            {AGENTS.map(([name, q, prov], i) => (
              <div key={name}>
                <div className="rounded-lg border bg-surface p-2.5">
                  <div className="flex items-center justify-between text-sm font-medium">{name}<span className="font-mono text-[10px] text-primary">{q}</span></div>
                  <div className="font-mono text-[10.5px] text-muted-foreground">{prov}</div>
                </div>
                {i < AGENTS.length - 1 && <ArrowDown className="mx-auto my-0.5 size-3.5 text-muted-foreground/50" />}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
