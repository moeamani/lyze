/**
 * Read a research brief out of a thesis or proposal: the aim, the research questions and the
 * hypotheses (or propositions and assumptions). Works on plain text from a PDF, Word or text file,
 * using the conventions proposals follow: section headings ("Aims", "Research questions",
 * "Hypotheses"), labels ("RQ1:", "H2a."), and stock phrases ("The aim of this study is…",
 * "We hypothesise that…").
 */
export type ExtractedBrief = {
  title: string | null;
  aim: string;
  questions: string[];
  statements: { text: string; kind: "hypothesis" | "proposition" | "assumption" }[];
};

type Section = "aim" | "questions" | "hypotheses" | "other";

const HEADINGS: [RegExp, Section][] = [
  [/^(research\s+)?(aims?|objectives?|purpose|goals?)(\s+(and|&)\s+(objectives?|research questions?))?(\s+of\s+(the|this)\s+(study|research|thesis|project))?$/i, "aim"],
  [/^(the\s+)?research\s+questions?(\s+and\s+hypothes[ie]s)?$|^questions$/i, "questions"],
  [/^(research\s+)?(hypothes[ie]s|propositions?)(\s+and\s+\w+)?$/i, "hypotheses"],
];

const clean = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/^[\s•·\-–—*]+/, "")
    .replace(/^(\(?[a-z0-9]{1,3}[.)]|\d+(\.\d+)*\.?)\s+/i, "")
    .trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Join wrapped lines into paragraphs; headings and labelled lines stay on their own. */
function paragraphs(text: string): string[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const out: string[] = [];
  let cur = "";
  const labelled = (l: string) => /^(RQ\s*\d|H\s*\d|P\s*\d|Q\s*\d|Research question\s*\d|Hypothesis\s*\d|\d+(\.\d+)*\.?\s|[•\-*]\s)/i.test(l);
  for (const l of lines) {
    if (!l) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    const startsNew = !cur || labelled(l) || /[.?!:]$/.test(cur) || isHeading(cur) || (/^[A-Z]/.test(l) && cur.length < 80 && !/[,;]$/.test(cur));
    if (startsNew) {
      if (cur) out.push(cur);
      cur = l;
    } else cur += ` ${l}`;
  }
  if (cur) out.push(cur);
  return out;
}

function headingKind(line: string): Section | null {
  const h = clean(line).replace(/[:.]$/, "");
  if (h.length > 70) return null;
  for (const [re, kind] of HEADINGS) if (re.test(h)) return kind;
  return null;
}
function isHeading(line: string) {
  const h = clean(line);
  return h.length > 0 && h.length < 70 && !/[.?!,;]$/.test(h) && /^(\d+(\.\d+)*\.?\s+)?[A-Z]/.test(line.trim()) && h.split(" ").length <= 9;
}

const sentences = (p: string) => p.match(/[^.?!]+[.?!]+["”']?|[^.?!]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];

const QUESTION_LABEL = /^(?:RQ\s*\d+[a-z]?|Research question\s*\d+[a-z]?|Q\s*\d+)\s*[:.)-]\s*(.+)$/i;
const STATEMENT_LABEL = /^(H|P|A)\s*(\d+[a-z]?)\s*[:.)-]\s*(.+)$/i;
const HYPOTHESIS_WORD = /^Hypothesis\s*\d+[a-z]?\s*[:.)-]\s*(.+)$/i;
const PHRASES: [RegExp, ExtractedBrief["statements"][number]["kind"]][] = [
  [/\b(?:we|i)\s+(?:hypothesi[sz]e|predict|expect)\s+that\s+(.+)/i, "hypothesis"],
  [/\bit\s+is\s+(?:hypothesi[sz]ed|predicted|expected)\s+that\s+(.+)/i, "hypothesis"],
  [/\b(?:we|i)\s+assume\s+that\s+(.+)/i, "assumption"],
  [/\bit\s+is\s+assumed\s+that\s+(.+)/i, "assumption"],
  [/\b(?:we|i)\s+propose\s+that\s+(.+)/i, "proposition"],
];
const AIM_PHRASE = /\b(?:the\s+(?:main\s+|overall\s+|primary\s+)?(?:aim|purpose|objective|goal)\s+of\s+(?:this|the\s+present|the)\s+(?:study|research|thesis|project|paper|dissertation)\s+(?:is|was)\s+to|this\s+(?:study|research|thesis|project|paper|dissertation)\s+(?:aims|seeks|sets\s+out|intends)\s+to)\b/i;

export function extractBrief(text: string): ExtractedBrief {
  const paras = paragraphs(text.slice(0, 200_000));
  const title = paras.find((p) => p.length >= 8 && p.length <= 200 && !headingKind(p) && !/^\d/.test(p)) ?? null;
  const questions: string[] = [];
  const statements: ExtractedBrief["statements"] = [];
  const aims: string[] = [];
  const seen = new Set<string>();
  const addQ = (q: string) => {
    const t = cap(clean(q));
    if (t.length < 10 || t.length > 400 || seen.has(norm(t))) return;
    seen.add(norm(t));
    questions.push(t);
  };
  const addS = (s: string, kind: ExtractedBrief["statements"][number]["kind"]) => {
    let t = cap(clean(s)).replace(/\s*\([^)]*\)\s*$/, "");
    if (!/[.?!]$/.test(t)) t += ".";
    if (t.length < 12 || t.length > 400 || seen.has(norm(t)) || /^H0|null hypothesis/i.test(t)) return;
    seen.add(norm(t));
    statements.push({ text: t, kind });
  };

  let section: Section = "other";
  for (const p of paras) {
    const kind = headingKind(p);
    if (kind) {
      section = kind;
      continue;
    }
    if (isHeading(p) && !QUESTION_LABEL.test(p) && !STATEMENT_LABEL.test(p)) {
      section = "other";
      continue;
    }
    const line = clean(p);
    const q = QUESTION_LABEL.exec(p.trim()) ?? QUESTION_LABEL.exec(line);
    if (q) {
      addQ(q[1]!);
      continue;
    }
    const st = STATEMENT_LABEL.exec(p.trim()) ?? STATEMENT_LABEL.exec(line);
    if (st && st[2] !== "0") {
      addS(st[3]!, st[1]!.toUpperCase() === "H" ? "hypothesis" : st[1]!.toUpperCase() === "P" ? "proposition" : "assumption");
      continue;
    }
    const hw = HYPOTHESIS_WORD.exec(line);
    if (hw) {
      addS(hw[1]!, "hypothesis");
      continue;
    }
    for (const s of sentences(p)) {
      if (section === "questions" && /\?$/.test(s)) addQ(s);
      const phrase = PHRASES.find(([re]) => re.test(s));
      if (phrase) addS(phrase[0].exec(s)![1]!, phrase[1]);
      else if (section === "hypotheses" && s.length > 20 && !/\?$/.test(s) && !/^(this|these|the following|in this)/i.test(s)) addS(s, "hypothesis");
      if (AIM_PHRASE.test(s)) aims.push(s);
      else if (section === "aim" && aims.length < 2 && s.length > 25) aims.push(s);
    }
  }
  // No labelled or sectioned questions: fall back to real questions in the opening pages.
  if (!questions.length)
    for (const p of paras.slice(0, 120))
      for (const s of sentences(p)) if (/^(what|how|why|which|to what extent|in what|does|do|is|are|can|when|where|who)\b.{15,}\?$/i.test(clean(s))) addQ(s);

  return { title: title ? clean(title) : null, aim: aims.slice(0, 2).map(clean).join(" "), questions: questions.slice(0, 12), statements: statements.slice(0, 20) };
}

/** Merge what was found into an existing brief without duplicating or overwriting what's there. */
export function mergeBrief(
  brief: { aim: string; questions: { id: string; text: string }[]; statements: { id: string; text: string; kind: "hypothesis" | "proposition" | "assumption" }[] },
  found: ExtractedBrief,
  newId: () => string,
) {
  const qs = new Set(brief.questions.map((q) => norm(q.text)));
  const ss = new Set(brief.statements.map((s) => norm(s.text)));
  const addedQ = found.questions.filter((q) => !qs.has(norm(q)));
  const addedS = found.statements.filter((s) => !ss.has(norm(s.text)));
  return {
    aim: brief.aim.trim() || found.aim,
    questions: [...brief.questions, ...addedQ.map((text) => ({ id: newId(), text }))],
    statements: [...brief.statements, ...addedS.map((s) => ({ id: newId(), ...s }))],
    added: { aim: !brief.aim.trim() && !!found.aim, questions: addedQ.length, statements: addedS.length, recognised: found.questions.length + found.statements.length + (found.aim ? 1 : 0) },
  };
}
