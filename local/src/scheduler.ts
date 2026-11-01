// Persistent production scheduler. Disabled by default. Each (date, time) slot creates at most one job (unique index).
import { z } from "zod";
import type { JobStore } from "./db.ts";

export const scheduleSchema = z.object({
  enabled: z.boolean().default(false),
  paused: z.boolean().default(false),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Fuso horário inválido").default("America/Sao_Paulo"),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")).min(1).max(12).default(["12:00", "18:00", "21:00"]),
  daily_limit: z.number().int().min(0).max(12).default(3),
  lead_minutes: z.number().int().min(15).max(720).default(120),
  topics: z.array(z.string().trim().min(5).max(200)).max(500).default([]),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export function getSchedule(store: JobStore): Schedule {
  return scheduleSchema.parse(store.getSetting("schedule") ?? {});
}
export function saveSchedule(store: JobStore, input: unknown): Schedule {
  const s = scheduleSchema.parse(input);
  store.setSetting("schedule", s);
  return s;
}

/** Local date parts in a timezone. */
function localParts(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

/** Convert local "YYYY-MM-DD HH:MM" in tz to a UTC Date. */
export function zonedToUtc(date: string, hm: string, tz: string): Date {
  const guess = new Date(`${date}T${hm}:00Z`);
  const lp = localParts(guess, tz);
  const asIfUtc = new Date(`${lp.date}T${lp.hm}:00Z`);
  return new Date(guess.getTime() - (asIfUtc.getTime() - guess.getTime()));
}

export interface Slot { key: string; at: Date }

/** Slots for "today" (in tz) that are inside the production window [at - lead, at). Past slots are skipped, not back-filled. */
export function dueSlots(now: Date, s: Schedule): Slot[] {
  const { date } = localParts(now, s.timezone);
  return [...new Set(s.times)].sort().slice(0, s.daily_limit).map((hm) => ({ key: `${date} ${hm} ${s.timezone}`, at: zonedToUtc(date, hm, s.timezone) }))
    .filter((x) => now.getTime() >= x.at.getTime() - s.lead_minutes * 60_000 && now.getTime() < x.at.getTime());
}

/** One scheduler tick: creates jobs for due slots using the next unused topic. Returns created job IDs and notes. */
export function schedulerTick(store: JobStore, now = new Date()): { created: string[]; notes: string[] } {
  const s = getSchedule(store);
  const out = { created: [] as string[], notes: [] as string[] };
  if (!s.enabled || s.paused) return out;
  const { date } = localParts(now, s.timezone);
  const today = (store.db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE origin='scheduler' AND scheduled_for LIKE ?`).get(`${date} %`) as { n: number }).n;
  let budget = s.daily_limit - today;
  for (const slot of dueSlots(now, s)) {
    if (budget <= 0) break;
    if (store.db.prepare(`SELECT 1 FROM jobs WHERE scheduled_for = ?`).get(slot.key)) continue;
    const used = new Set((store.db.prepare(`SELECT lower(topic) AS t FROM jobs`).all() as { t: string }[]).map((r) => r.t));
    const topic = s.topics.find((t) => !used.has(t.toLowerCase()));
    if (!topic) { out.notes.push(`Sem temas novos para o horário ${slot.key}. Adicione temas no agendamento.`); continue; }
    try {
      const j = store.create(topic, { origin: "scheduler", scheduled_for: slot.key });
      store.log(j.id, `Criado pelo agendador para publicação em ${slot.at.toISOString()}`);
      out.created.push(j.id);
      budget--;
    } catch (e) {
      out.notes.push(`Horário ${slot.key}: ${(e as Error).message}`);
    }
  }
  return out;
}
