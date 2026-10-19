// Job lifecycle: explicit states + allowed transitions. Pure logic, unit-tested.
// Technical QC, factual review and human approval are separate: QC pass → awaiting_review; only a human moves it to approved.
export const JOB_STATES = [
  "queued", "paused", "researching", "generating_script", "generating_voice", "rendering", "quality_check",
  "awaiting_review", "approved", "rejected", "failed", "cancelled",
] as const;
export type JobState = (typeof JOB_STATES)[number];

export const ACTIVE_STATES: JobState[] = ["researching", "generating_script", "generating_voice", "rendering", "quality_check"];
export const TERMINAL_STATES: JobState[] = ["approved", "rejected", "failed", "cancelled"];

const TRANSITIONS: Record<JobState, JobState[]> = {
  queued: ["researching", "paused", "cancelled", "failed"],
  paused: ["queued", "cancelled"],
  researching: ["generating_script", "queued", "failed", "cancelled"],
  generating_script: ["generating_voice", "queued", "failed", "cancelled"],
  generating_voice: ["rendering", "queued", "failed", "cancelled"],
  rendering: ["quality_check", "queued", "failed", "cancelled"],
  quality_check: ["awaiting_review", "rejected", "queued", "failed", "cancelled"],
  awaiting_review: ["approved", "rejected", "cancelled"], // human decision only
  approved: [],
  rejected: ["queued"], // manual retry
  failed: ["queued"], // manual retry
  cancelled: ["queued"], // manual retry
};

export function canTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: JobState, to: JobState) {
  if (!canTransition(from, to)) throw new Error(`Transição inválida: ${from} → ${to}`);
}

/** Errors that may succeed on a later attempt (service down, model produced bad JSON, timeout). */
export class RecoverableError extends Error {
  recoverable = true as const;
}
export class CancelledError extends Error {
  constructor() { super("Cancelado pelo usuário"); }
}

export function isRecoverable(err: unknown): boolean {
  return err instanceof RecoverableError;
}

/** Decide where a failed job goes next (bounded retries). */
export function nextAfterFailure(err: unknown, attempts: number, maxAttempts: number): "queued" | "failed" {
  return isRecoverable(err) && attempts < maxAttempts ? "queued" : "failed";
}
