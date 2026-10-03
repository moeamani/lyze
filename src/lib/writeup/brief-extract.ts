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

type Section = "aim" | "questions" | "hypotheses" | "method" | "other";

const HEADINGS: [RegExp, Section][] = [
  [/^(research\s+)?(aims?|objectives?|purpose|goals?)(\s+(and|&)\s+(objectives?|research questions?))?(\s+of\s+(the|this)\s+(study|research|thesis|project))?$/i, "aim"],
  [/^(the\s+)?research\s+questions?(\s+and\s+hypothes[ie]s)?$|^questions$/i, "questions"],
  [/^(research\s+)?(hypothes[ie]s|propositions?)(\s+and\s+\w+)?$/i, "hypotheses"],
  [/^(research\s+)?(method(s|ology)?|research design|data collection|literature review|theoretical framework|discussion|results|findings|conclusions?)\b/i, "method"],
];
/** Where the proposal's own content ends: everything after is citations or instruments. */
const END = /^(\d+(\.\d+)*\.?\s+)?(references|bibliography|works cited|appendi(x|ces)|annex)\b/i;

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

const unprefix = (line: string) => clean(line).replace(/^(chapter|section|part)\s+[\w.]+[.:]?\s*/i, "").replace(/^\d+(\.\d+)*\.?\s+/, "");

function headingKind(line: string): Section | null {
  const h = unprefix(line).replace(/[:.]$/, "");
  if (h.length > 70) return null;
  for (const [re, kind] of HEADINGS) if (re.test(h)) return kind;
  return null;
}
function isHeading(line: string) {
  const h = clean(line);
  return h.length > 0 && h.length < 70 && !/[.?!,;]$/.test(h) && /^(\d+(\.\d+)*\.?\s+)?[A-Z]/.test(line.trim()) && h.split(" ").length <= 9;
}

/** Same question in slightly different words (restated in a later chapter): most words shared. */
function similar(a: string, b: string) {
  if (a === b) return true;
  const A = new Set(a.split(" ").filter((w) => w.length > 2));
  const B = new Set(b.split(" ").filter((w) => w.length > 2));
  if (!A.size || !B.size) return false;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / Math.min(A.size, B.size) >= 0.8;
}

const sentences = (p: string) => p.match(/[^.?!]+[.?!]+["”']?|[^.?!]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];

const QUESTION_LABEL = /^(RQ\s*\d+[a-z]?|Research question\s*\d+[a-z]?|(?:Sub-?)?question\s*\d+[a-z]?)\s*[:.)-]\s*(.+)$/i;
const Q_LABEL = /^(Q\s*\d+[a-z]?)\s*[:.)-]\s*(.+)$/i;
const STATEMENT_LABEL = /^(H|P|A)\s*(\d+[a-z]?)\s*[:.)-]\s*(.+)$/;
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
  const seen: string[] = [];
  const labels = new Set<string>();
  const unlabelled: string[] = [];
  const duplicate = (t: string) => seen.some((x) => similar(x, norm(t)));
  /** `label` is e.g. "RQ1": a label seen before is the same question restated later in the text. */
  const addQ = (q: string, label?: string) => {
    const t = cap(clean(q));
    if (t.length < 10 || t.length > 400 || duplicate(t)) return;
    if (label) {
      const key = label.toUpperCase().replace(/\s+/g, "").replace(/^RESEARCHQUESTION|^SUB-?QUESTION|^QUESTION/, "RQ");
      if (labels.has(key)) return;
      labels.add(key);
    }
    seen.push(norm(t));
    (label ? questions : unlabelled).push(t);
  };
  const addS = (s: string, kind: ExtractedBrief["statements"][number]["kind"], label?: string) => {
    let t = cap(clean(s)).replace(/\s*\([^)]*\d{4}[^)]*\)(?=[.]?$)/, "");
    if (!/[.?!]$/.test(t)) t += ".";
    if (t.length < 12 || t.length > 400 || duplicate(t) || /^H0|null hypothesis/i.test(t)) return;
    if (label) {
      const key = label.toUpperCase().replace(/\s+/g, "");
      if (labels.has(key)) return;
      labels.add(key);
    }
    seen.push(norm(t));
    statements.push({ text: t, kind });
  };

  let section: Section = "other";
  for (const p of paras) {
    if (isHeading(p) && END.test(unprefix(p))) break;
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
      addQ(q[2]!, q[1]!);
      continue;
    }
    // "Q1." is how questionnaires number items, so it only counts inside a research-questions section.
    const ql = section === "questions" ? (Q_LABEL.exec(p.trim()) ?? Q_LABEL.exec(line)) : null;
    if (ql) {
      addQ(ql[2]!, ql[1]!.replace(/^Q/i, "RQ"));
      continue;
    }
    const st = STATEMENT_LABEL.exec(p.trim()) ?? STATEMENT_LABEL.exec(line);
    if (st && st[2] !== "0" && section !== "method") {
      addS(st[3]!, st[1] === "H" ? "hypothesis" : st[1] === "P" ? "proposition" : "assumption", `${st[1]}${st[2]}`);
      continue;
    }
    const hw = HYPOTHESIS_WORD.exec(line);
    if (hw) {
      addS(hw[1]!, "hypothesis");
      continue;
    }
    for (const s of sentences(p)) {
      if (section === "questions" && /\?$/.test(s) && s.length < 300) addQ(s);
      const phrase = section === "method" ? null : PHRASES.find(([re]) => re.test(s));
      if (phrase) addS(phrase[0].exec(s)![1]!, phrase[1]);
      else if (section === "hypotheses" && s.length > 20 && !/\?$/.test(s) && !/^(this|these|the following|in this)/i.test(s)) addS(s, "hypothesis");
      if (AIM_PHRASE.test(s)) aims.push(s);
      else if (section === "aim" && aims.length < 2 && s.length > 25) aims.push(s);
    }
  }
  // Labelled questions win; unlabelled ones from a research-questions section are used only when
  // the document labels none.
  if (!questions.length) questions.push(...unlabelled);
  // Nothing at all: questions phrased as such in the introduction (before any method or review chapter).
  if (!questions.length) {
    const intro: string[] = [];
    for (const p of paras) {
      if (headingKind(p) === "method" || (isHeading(p) && END.test(unprefix(p)))) break;
      intro.push(p);
    }
    for (const p of intro.slice(0, 80))
      for (const s of sentences(p))
        if (/^(what|how|why|which|to what extent|in what ways?|does|do|is|are|can)\b.{20,}\?$/i.test(clean(s)) && !/\b(you|your|we|i)\b/i.test(s)) {
          const t = cap(clean(s));
          if (!questions.some((x) => similar(norm(x), norm(t)))) questions.push(t);
        }
    questions.splice(5);
  }

  return { title: title ? clean(title) : null, aim: aims.slice(0, 2).map(clean).join(" "), questions: questions.slice(0, 12), statements: statements.slice(0, 20) };
}

/**
 * Apply what was read from a newly uploaded file. The file is the source of truth: when it names
 * research questions (or hypotheses), they replace the brief's; parts it doesn't cover are kept.
 */
export function applyExtracted(
  brief: { aim: string; questions: { id: string; text: string }[]; statements: { id: string; text: string; kind: "hypothesis" | "proposition" | "assumption" }[] },
  found: ExtractedBrief,
  newId: () => string,
) {
  const keepId = <T extends { id: string; text: string }>(old: T[], text: string) => old.find((o) => norm(o.text) === norm(text))?.id ?? newId();
  return {
    aim: found.aim || brief.aim,
    questions: found.questions.length ? found.questions.map((text) => ({ id: keepId(brief.questions, text), text })) : brief.questions,
    statements: found.statements.length ? found.statements.map((s) => ({ id: keepId(brief.statements, s.text), ...s })) : brief.statements,
    added: { aim: !!found.aim, questions: found.questions.length, statements: found.statements.length, recognised: found.questions.length + found.statements.length + (found.aim ? 1 : 0) },
  };
}
