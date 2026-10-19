// Small text helpers shared by research, claim matching and asset matching.
const STOP = new Set(
  "a o as os um uma uns umas de da do das dos em na no nas nos por para com sem sob sobre que e ou se ao aos à às pelo pela pelos pelas como mais menos muito muita seu sua seus suas ele ela eles elas isso esse essa este esta isto ser são foi era está estão tem têm ter há entre também quando onde qual quais cada todo toda todos todas the and of".split(" "),
);

export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function tokens(s: string): string[] {
  return normalize(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));
}

export function numbers(s: string): string[] {
  return (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,]/g, ""));
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
