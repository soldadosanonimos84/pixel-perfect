// Caption timeline from real per-scene audio durations → SRT (sidecar) + ASS (burned in by FFmpeg).
export const SCENE_GAP_SEC = 0.2;

export interface Cue { start: number; end: number; text: string }
export interface SceneTiming { start: number; end: number; speech: number }

export function sceneTimings(speechDurations: number[]): SceneTiming[] {
  let t = 0;
  return speechDurations.map((d) => {
    const s = { start: t, end: t + d + SCENE_GAP_SEC, speech: d };
    t = s.end;
    return s;
  });
}

/** Split text into short lines (≤ maxWords words, ≤ maxChars chars). */
export function chunkText(text: string, maxWords = 7, maxChars = 38): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = [...cur, w].join(" ");
    if (cur.length && (cur.length >= maxWords || next.length > maxChars)) { out.push(cur.join(" ")); cur = [w]; }
    else cur.push(w);
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

export function buildCues(narrations: string[], timings: SceneTiming[]): Cue[] {
  const cues: Cue[] = [];
  narrations.forEach((n, i) => {
    const tm = timings[i]!;
    const chunks = chunkText(n);
    const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
    let t = tm.start;
    for (const c of chunks) {
      const d = (c.length / total) * tm.speech;
      cues.push({ start: t, end: t + d, text: c });
      t += d;
    }
  });
  return cues;
}

const srtTs = (sec: number) => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
const assTs = (sec: number) => {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360_000), m = Math.floor((cs % 360_000) / 6000), s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${srtTs(c.start)} --> ${srtTs(c.end)}\n${c.text}\n`).join("\n");
}

export function escapeAss(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");
}

/** ASS with big readable captions (bottom) and per-scene image credits (top, small). */
export function toAss(cues: Cue[], credits: { start: number; end: number; text: string }[], font: string): string {
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${font},72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,80,80,420,1
Style: Credit,${font},30,&H00DDDDDD,&H00DDDDDD,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,8,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const ev = [
    ...cues.map((c) => `Dialogue: 1,${assTs(c.start)},${assTs(c.end)},Caption,,0,0,0,,${escapeAss(c.text)}`),
    ...credits.map((c) => `Dialogue: 0,${assTs(c.start)},${assTs(c.end)},Credit,,0,0,0,,${escapeAss(c.text)}`),
  ];
  return head + ev.join("\n") + "\n";
}
