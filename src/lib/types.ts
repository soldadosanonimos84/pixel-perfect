// Domain types — mirror db/schema.sql. Shared between UI and future backend.

export type IdeaStatus = "IDEA" | "RESEARCHED" | "APPROVED" | "SCRIPTING" | "PRODUCTION" | "COMPLETED";
export const IDEA_FLOW: IdeaStatus[] = ["IDEA", "RESEARCHED", "APPROVED", "SCRIPTING", "PRODUCTION", "COMPLETED"];

export type VideoStatus =
  | "QUEUED"
  | "RESEARCHING"
  | "SCRIPTING"
  | "GENERATING_ASSETS"
  | "GENERATING_AUDIO"
  | "RENDERING"
  | "GENERATING_SUBTITLES"
  | "QUALITY_CONTROL"
  | "READY"
  | "FAILED";

export const VIDEO_FLOW: VideoStatus[] = [
  "QUEUED",
  "RESEARCHING",
  "SCRIPTING",
  "GENERATING_ASSETS",
  "GENERATING_AUDIO",
  "RENDERING",
  "GENERATING_SUBTITLES",
  "QUALITY_CONTROL",
  "READY",
];

export type PublicationStatus = "SCHEDULED" | "PROCESSING" | "PUBLISHED" | "FAILED";
export type JobStatus = "waiting" | "active" | "completed" | "failed";
export type QueueName =
  | "research"
  | "script"
  | "assets"
  | "voice"
  | "render"
  | "subtitles"
  | "quality-control"
  | "publishing"
  | "analytics";

export type SourceType =
  | "official_government"
  | "electoral_authority"
  | "congress"
  | "court"
  | "legislation"
  | "reputable_news"
  | "academic"
  | "other";

export type Reliability = "verified" | "pending" | "disputed";

export interface Source {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
  retrievedAt: string;
  type: SourceType;
  reliability: Reliability;
}

export interface ContentIdea {
  id: string;
  title: string;
  topic: string;
  category: string;
  description: string;
  sourceId: string;
  publishedAt: string;
  relevance: number;
  status: IdeaStatus;
  createdAt: string;
}

export interface FactualClaim {
  text: string;
  kind: "fact" | "analysis";
  sourceIds: string[];
}

export interface Script {
  id: string;
  ideaId: string;
  hook: string;
  body: string;
  conclusion: string;
  cta: string;
  estimatedDuration: number;
  sourceIds: string[];
  claims: FactualClaim[];
  createdAt: string;
}

export interface QACheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface Video {
  id: string;
  scriptId: string;
  title: string;
  thumbnail: string;
  status: VideoStatus;
  progress: number;
  duration: number;
  resolution: string;
  qa?: { passed: boolean; checks: QACheck[] };
  error?: string | undefined;
  createdAt: string;
}

export interface Job {
  id: string;
  type: QueueName;
  videoId?: string | undefined;
  status: JobStatus;
  progress: number;
  attempts: number;
  error?: string | undefined;
  createdAt: string;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
}

export interface Publication {
  id: string;
  videoId: string;
  platform: "tiktok" | "kwai";
  scheduledAt: string;
  status: PublicationStatus;
  externalId?: string | undefined;
  note?: string | undefined;
}

export interface VideoAnalytics {
  videoId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  avgWatch: number;
  completion: number;
}

export interface LogEntry {
  id: string;
  at: string;
  level: "info" | "warn" | "error";
  service: string;
  message: string;
}

export interface Settings {
  videosPerDay: number;
  times: string[];
  minQuality: number;
  minDuration: number;
  maxDuration: number;
  language: string;
  categories: string[];
  llmProvider: string;
  voiceProvider: string;
  imageProvider: string;
  transcriptionProvider: string;
  autoPublish: boolean;
  autoRegenerate: boolean;
}

export const CATEGORIES = [
  "Política brasileira",
  "Governo",
  "Congresso",
  "Eleições",
  "Políticas públicas",
  "Economia",
  "História",
  "Questões constitucionais",
  "Checagem de fatos",
  "Sistema eleitoral",
];

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  official_government: "Governo oficial",
  electoral_authority: "Autoridade eleitoral",
  congress: "Congresso",
  court: "Tribunal",
  legislation: "Legislação",
  reputable_news: "Imprensa reconhecida",
  academic: "Acadêmico",
  other: "Outro",
};
