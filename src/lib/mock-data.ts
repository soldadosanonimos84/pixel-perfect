// Realistic MOCK data for the prototype. Sources point to real official institutions,
// but titles/dates are illustrative placeholders — replace with Research Agent output.
import congresso from "@/assets/thumb-congresso.jpg";
import urna from "@/assets/thumb-urna.jpg";
import constituicao from "@/assets/thumb-constituicao.jpg";
import type {
  ContentIdea, Job, LogEntry, Publication, Script, Settings, Source, Video, VideoAnalytics,
} from "./types";

export const THUMBS = [congresso, urna, constituicao];

export const sources: Source[] = [
  { id: "src-1", title: "Urna eletrônica — perguntas frequentes", publisher: "Tribunal Superior Eleitoral (TSE)", url: "https://www.tse.jus.br/eleicoes/urna-eletronica", publishedAt: "2026-08-12", retrievedAt: "2026-10-07", type: "electoral_authority", reliability: "verified" },
  { id: "src-2", title: "Constituição da República Federativa do Brasil de 1988", publisher: "Planalto — Presidência da República", url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm", publishedAt: "1988-10-05", retrievedAt: "2026-10-06", type: "legislation", reliability: "verified" },
  { id: "src-3", title: "Como tramita um projeto de lei", publisher: "Câmara dos Deputados", url: "https://www.camara.leg.br/entenda-o-processo-legislativo", publishedAt: "2025-03-20", retrievedAt: "2026-10-06", type: "congress", reliability: "verified" },
  { id: "src-4", title: "Atribuições do Senado Federal", publisher: "Senado Federal", url: "https://www12.senado.leg.br/institucional", publishedAt: "2025-06-02", retrievedAt: "2026-10-05", type: "congress", reliability: "verified" },
  { id: "src-5", title: "Competências do Supremo Tribunal Federal", publisher: "Supremo Tribunal Federal (STF)", url: "https://portal.stf.jus.br/", publishedAt: "2025-11-14", retrievedAt: "2026-10-05", type: "court", reliability: "verified" },
  { id: "src-6", title: "Portal da Transparência — gastos públicos", publisher: "Controladoria-Geral da União", url: "https://portaldatransparencia.gov.br/", publishedAt: "2026-09-30", retrievedAt: "2026-10-07", type: "official_government", reliability: "verified" },
  { id: "src-7", title: "Reportagem sobre calendário eleitoral (a verificar)", publisher: "Agência Brasil", url: "https://agenciabrasil.ebc.com.br/", publishedAt: "2026-10-01", retrievedAt: "2026-10-07", type: "reputable_news", reliability: "pending" },
];

export const ideas: ContentIdea[] = [
  { id: "idea-1", title: "Como a urna eletrônica é auditada", topic: "Auditoria da urna", category: "Sistema eleitoral", description: "Explicar etapas públicas de verificação da urna, com base em material do TSE.", sourceId: "src-1", publishedAt: "2026-08-12", relevance: 94, status: "COMPLETED", createdAt: "2026-10-06T09:10:00-03:00" },
  { id: "idea-2", title: "O que diz o Art. 14 da Constituição", topic: "Direitos políticos", category: "Questões constitucionais", description: "Voto obrigatório, facultativo e condições de elegibilidade segundo o texto constitucional.", sourceId: "src-2", publishedAt: "1988-10-05", relevance: 88, status: "PRODUCTION", createdAt: "2026-10-07T10:00:00-03:00" },
  { id: "idea-3", title: "Do projeto à lei: o caminho no Congresso", topic: "Processo legislativo", category: "Congresso", description: "Etapas de tramitação de um PL na Câmara e no Senado.", sourceId: "src-3", publishedAt: "2025-03-20", relevance: 82, status: "SCRIPTING", createdAt: "2026-10-07T14:20:00-03:00" },
  { id: "idea-4", title: "Para que serve o Senado?", topic: "Instituições", category: "Congresso", description: "Funções exclusivas do Senado Federal.", sourceId: "src-4", publishedAt: "2025-06-02", relevance: 76, status: "APPROVED", createdAt: "2026-10-08T08:00:00-03:00" },
  { id: "idea-5", title: "Como consultar gastos públicos", topic: "Transparência", category: "Políticas públicas", description: "Tutorial do Portal da Transparência.", sourceId: "src-6", publishedAt: "2026-09-30", relevance: 71, status: "RESEARCHED", createdAt: "2026-10-08T09:30:00-03:00" },
  { id: "idea-6", title: "O papel do STF no controle de constitucionalidade", topic: "Judiciário", category: "Questões constitucionais", description: "O que é ADI e quem pode propor.", sourceId: "src-5", publishedAt: "2025-11-14", relevance: 68, status: "IDEA", createdAt: "2026-10-08T11:00:00-03:00" },
];

export const scripts: Script[] = [
  {
    id: "scr-1", ideaId: "idea-1",
    hook: "Você sabe quem pode fiscalizar a urna eletrônica?",
    body: "Segundo o TSE, a urna passa por etapas públicas de verificação, como o teste público de segurança e a auditoria de funcionamento no dia da votação. Partidos, a OAB e o Ministério Público estão entre as entidades fiscalizadoras.",
    conclusion: "As etapas e os relatórios ficam disponíveis no site do TSE.",
    cta: "Confira a fonte oficial no link e siga para mais explicações sobre o sistema eleitoral.",
    estimatedDuration: 42, sourceIds: ["src-1"],
    claims: [
      { text: "A urna passa por teste público de segurança.", kind: "fact", sourceIds: ["src-1"] },
      { text: "Entidades como partidos, OAB e MP podem fiscalizar.", kind: "fact", sourceIds: ["src-1"] },
    ],
    createdAt: "2026-10-06T10:00:00-03:00",
  },
  {
    id: "scr-2", ideaId: "idea-2",
    hook: "Voto no Brasil é obrigatório para todo mundo?",
    body: "De acordo com o artigo 14 da Constituição, o voto é obrigatório para maiores de 18 anos e facultativo para analfabetos, maiores de 70 e jovens entre 16 e 18 anos.",
    conclusion: "Ou seja: a regra muda conforme a idade e a alfabetização.",
    cta: "Leia o artigo completo na fonte indicada.",
    estimatedDuration: 38, sourceIds: ["src-2"],
    claims: [
      { text: "Voto obrigatório para maiores de 18 anos.", kind: "fact", sourceIds: ["src-2"] },
      { text: "Facultativo para analfabetos, maiores de 70 e jovens de 16 a 18.", kind: "fact", sourceIds: ["src-2"] },
      { text: "Essa regra é pouco conhecida pelos jovens.", kind: "analysis", sourceIds: [] },
    ],
    createdAt: "2026-10-07T11:00:00-03:00",
  },
];

export const videos: Video[] = [
  { id: "vid-1", scriptId: "scr-1", title: "Como a urna eletrônica é auditada", thumbnail: urna, status: "READY", progress: 100, duration: 42, resolution: "1080×1920",
    qa: { passed: true, checks: [] }, createdAt: "2026-10-06T10:30:00-03:00" },
  { id: "vid-2", scriptId: "scr-2", title: "O que diz o Art. 14 da Constituição", thumbnail: constituicao, status: "FAILED", progress: 100, duration: 38, resolution: "1080×1920",
    error: "QA reprovado: afirmação de análise sem fonte.", createdAt: "2026-10-07T11:30:00-03:00" },
  { id: "vid-3", scriptId: "scr-1", title: "Congresso Nacional em 45 segundos", thumbnail: congresso, status: "READY", progress: 100, duration: 45, resolution: "1080×1920", createdAt: "2026-10-05T09:00:00-03:00" },
];

export const publications: Publication[] = [
  { id: "pub-1", videoId: "vid-3", platform: "tiktok", scheduledAt: "2026-10-07T18:00:00-03:00", status: "PUBLISHED", externalId: "mock-7351", note: "Simulado" },
  { id: "pub-2", videoId: "vid-1", platform: "tiktok", scheduledAt: "2026-10-08T18:00:00-03:00", status: "SCHEDULED" },
];

export const analytics: VideoAnalytics[] = [
  { videoId: "vid-3", views: 48210, likes: 3920, comments: 412, shares: 688, saves: 1240, avgWatch: 31.4, completion: 58 },
];

export const viewsSeries = [
  { day: "02/10", views: 12400, engagement: 7.1 },
  { day: "03/10", views: 15800, engagement: 7.8 },
  { day: "04/10", views: 14100, engagement: 6.9 },
  { day: "05/10", views: 22300, engagement: 8.4 },
  { day: "06/10", views: 26800, engagement: 9.1 },
  { day: "07/10", views: 48210, engagement: 10.2 },
  { day: "08/10", views: 31900, engagement: 9.4 },
];

export const topicPerformance = [
  { topic: "Sistema eleitoral", views: 92000 },
  { topic: "Constituição", views: 61000 },
  { topic: "Congresso", views: 48000 },
  { topic: "Transparência", views: 27000 },
  { topic: "Judiciário", views: 19000 },
];

export const timePerformance = [
  { time: "12:00", views: 21000, engagement: 7.2 },
  { time: "18:00", views: 38000, engagement: 9.6 },
  { time: "21:00", views: 44000, engagement: 10.4 },
];

export const jobs: Job[] = [
  { id: "job-101", type: "research", status: "completed", progress: 100, attempts: 1, createdAt: "2026-10-08T08:00:00-03:00", startedAt: "2026-10-08T08:00:02-03:00", completedAt: "2026-10-08T08:01:10-03:00" },
  { id: "job-102", type: "quality-control", videoId: "vid-2", status: "failed", progress: 100, attempts: 2, error: "Afirmação sem fonte", createdAt: "2026-10-07T11:40:00-03:00", startedAt: "2026-10-07T11:40:01-03:00", completedAt: "2026-10-07T11:40:20-03:00" },
  { id: "job-103", type: "analytics", status: "waiting", progress: 0, attempts: 0, createdAt: "2026-10-08T12:00:00-03:00" },
];

export const logs: LogEntry[] = [
  { id: "l1", at: "2026-10-08T08:01:10-03:00", level: "info", service: "research-agent", message: "6 tópicos coletados de fontes oficiais." },
  { id: "l2", at: "2026-10-07T11:40:20-03:00", level: "error", service: "qa-agent", message: "vid-2 reprovado: 1 afirmação sem fonte." },
  { id: "l3", at: "2026-10-07T18:00:03-03:00", level: "warn", service: "publishing-worker", message: "TikTok API não conectada — publicação simulada (pub-1)." },
];

export const defaultSettings: Settings = {
  videosPerDay: 3,
  times: ["12:00", "18:00", "21:00"],
  minQuality: 80,
  minDuration: 30,
  maxDuration: 60,
  language: "pt-BR",
  categories: ["Sistema eleitoral", "Congresso", "Questões constitucionais", "Políticas públicas"],
  llmProvider: "ollama",
  voiceProvider: "piper",
  imageProvider: "comfyui",
  transcriptionProvider: "whisper",
  autoPublish: false,
  autoRegenerate: true,
};
