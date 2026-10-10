// Job lifecycle: explicit states + allowed transitions. Pure logic, unit-tested.
export const JOB_STATES = [
  "queued", "generating_script", "generating_voice", "rendering", "quality_check", "approved", "rejected", "failed",
] as const;
export type JobState = (typeof JOB_STATES)[number];

export const ACTIVE_STATES: JobState[] = ["generating_script", "generating_voice", "rendering", "quality_check"];
export const TERMINAL_STATES: JobState[] = ["approved", "rejected", "failed"];

const TRANSITIONS: Record<JobState, JobState[]> = {
  queued: ["generating_script", "failed"],
  generating_script: ["generating_voice", "queued", "failed"],
  generating_voice: ["rendering", "queued", "failed"],
  rendering: ["quality_check", "queued", "failed"],
  quality_check: ["approved", "rejected", "queued", "failed"],
  approved: [],
  rejected: ["queued"], // manual retry
  failed: ["queued"], // manual retry
};

export function canTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobState, to: JobState) {
  if (!canTransition(from, to)) throw new Error(`Transição inválida: ${from} → ${to}`);
}

/** Errors that may succeed on a later attempt (service down, model produced bad JSON, timeout). */
export class RecoverableError extends Error {
  recoverable = true as const;
}

export function isRecoverable(err: unknown): boolean {
  return err instanceof RecoverableError;
}

/** Decide where a failed job goes next. */
export function nextAfterFailure(err: unknown, attempts: number, maxAttempts: number): "queued" | "failed" {
  return isRecoverable(err) && attempts < maxAttempts ? "queued" : "failed";
}

export function stageProgress(state: JobState): number {
  const order: JobState[] = ["queued", "generating_script", "generating_voice", "rendering", "quality_check", "approved"];
  const i = order.indexOf(state);
  return i < 0 ? 100 : Math.round((i / (order.length - 1)) * 100);
}
