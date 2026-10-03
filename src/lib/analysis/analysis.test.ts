import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { fixtureDoc, fixtureResponses } from "../../../tests/fixtures/analysis";
import { buildDataset, filterRows, groupRows, isCategorical, isNumeric, numericColumn } from "./dataset";
import { analysisSettingsSchema } from "./settings";
import { responsesOverTime, summarizeQuestion } from "./summary";
import { crosstab } from "./crosstab";
import { wordFrequencies } from "./text";
import { exportTable, codebook } from "@/lib/exports/table";
import { toCsv } from "@/lib/exports/csv";
import { toXlsx } from "@/lib/exports/xlsx";
import { writeSav } from "@/lib/exports/sav";
import { writeQdpx } from "@/lib/exports/qdpx";
import { rScript } from "@/lib/exports/r";

const settings = (patch = {}) => analysisSettingsSchema.parse(patch);

describe("variables & dataset", () => {
  const ds = buildDataset([fixtureDoc()], fixtureResponses(), settings());

  it("names and codes variables like SPSS", () => {
    const names = ds.variables.map((v) => v.name);
    expect(names.slice(0, 6)).toEqual(["response_id", "status", "started_at", "submitted_at", "duration_sec", "language"]);
    expect(names).toEqual(expect.arrayContaining(["Q1", "Q1_other", "Q2_1", "Q2_2", "Q2_3", "Q3", "Q8_1", "Q8_2", "Q9_1", "Q9_2", "Q10", "Q11"]));
    const mode = ds.byId.get("mode")!;
    expect(mode.categories).toEqual([
      { value: 1, label: "Bike" },
      { value: 2, label: "Bus" },
      { value: 3, label: "Car" },
      { value: 99, label: "Other" },
    ]);
    expect(ds.byId.get("l1")!.measure).toBe("ordinal");
    expect(ds.byId.get("mins")!.measure).toBe("scale");
  });

  it("keeps completed responses by default", () => {
    expect(ds.rows).toHaveLength(5);
    expect(ds.excluded).toEqual({ status: 1, speeders: 0, manual: 0 });
    const third = ds.rows[2]!.values;
    expect(third.mode).toBe(99);
    expect(third["mode:other"]).toBe("Scooter");
    // Answered multi-select without ticks → 0; never answered → missing.
    expect(ds.rows[0]!.values["why:o1"]).toBe(0);
    expect(third["why:o1"]).toBeNull();
    expect(ds.rows[0]!.values["rank:o2"]).toBe(1);
    expect(ds.rows[0]!.values["grid:o1"]).toBe(3);
  });

  it("applies exclusions", () => {
    const d = buildDataset([fixtureDoc()], fixtureResponses(), settings({ includePartial: true, minDurationSec: 60, excludedIds: ["rsp_001"] }));
    expect(d.excluded).toEqual({ status: 0, speeders: 1, manual: 1 });
    expect(d.rows.map((r) => r.meta.status)).toContain("partial");
  });

  it("recodes, reverse-scores and computes scale scores", () => {
    const d = buildDataset(
      [fixtureDoc()],
      fixtureResponses(),
      settings({
        recodes: [
          { id: "a", mode: "reverse", name: "l2_r", label: "Stress (reversed)", source: "l2" },
          { id: "b", mode: "group", name: "agree", label: "Relaxed?", source: "l1", groups: [{ label: "No", values: [1, 2, 3] }, { label: "Yes", values: [4, 5] }] },
          { id: "c", mode: "bins", name: "mins_band", label: "Trip length", source: "mins", edges: [0, 20, 30] },
        ],
        computed: [{ id: "s", name: "calm", label: "Calm commute", op: "mean", sources: ["l1", "l2"], reverse: ["l2"] }],
      }),
    );
    const first = d.rows[0]!.values;
    expect(first["recode:a"]).toBe(5);
    expect(first["recode:b"]).toBe(2);
    expect(first["recode:c"]).toBe(1);
    expect(d.rows[1]!.values["recode:c"]).toBe(3);
    expect(first["computed:s"]).toBe(5);
    expect(d.rows[1]!.values["computed:s"]).toBe(2);
    expect(d.byId.get("recode:a")!.categories![0]).toEqual({ value: 1, label: "SA" });
    expect(d.byId.get("recode:c")!.categories!.map((c) => c.label)).toEqual(["0–19", "20–29", "30+"]);
  });

  it("filters with the form-logic condition language and groups rows", () => {
    const buses = filterRows(ds, { match: "all", conditions: [{ questionId: "mode", operator: "equals", value: "o2" }] });
    expect(buses).toHaveLength(1);
    const groups = groupRows(ds.rows, ds.byId.get("mode")!);
    expect(groups.map((g) => g.rows.length)).toEqual([1, 1, 2, 1]);
    expect(isCategorical(ds.byId.get("mode")!)).toBe(true);
    expect(isNumeric(ds.byId.get("nps")!)).toBe(true);
    expect(isNumeric(ds.byId.get("mode")!)).toBe(false);
    expect(numericColumn(ds.rows, "mode")).toEqual([1, 2, null, 3, 3]);
  });
});

describe("summaries", () => {
  const ds = buildDataset([fixtureDoc()], fixtureResponses(), settings());
  const sum = (id: string) => {
    const { question, number } = ds.questions.get(id)!;
    return summarizeQuestion(question, number, ds.rows);
  };

  it("counts choices, including Other", () => {
    const s = sum("mode");
    expect(s.kind).toBe("choice");
    if (s.kind !== "choice") return;
    expect(s.categories.map((c) => [c.label, c.count])).toEqual([
      ["Bike", 1],
      ["Bus", 1],
      ["Car", 2],
      ["Other", 1],
    ]);
    expect(s.otherTexts).toEqual(["Scooter"]);
  });

  it("reports multi-select as % of people who answered", () => {
    const s = sum("why");
    if (s.kind !== "multi") throw new Error();
    expect(s.answered).toBe(3);
    expect(s.categories.find((c) => c.label === "Speed")!.count).toBe(2);
  });

  it("summarizes scales with distributions and NPS", () => {
    const s = sum("nps");
    if (s.kind !== "scale") throw new Error();
    expect(s.nps).toMatchObject({ promoters: 2, detractors: 1, score: 20 });
    expect(s.stats.mean).toBe(8);
    const l = sum("l1");
    if (l.kind !== "scale") throw new Error();
    expect(l.categories!.map((c) => c.count)).toEqual([0, 1, 1, 2, 1]);
  });

  it("summarizes matrix, ranking, text and dates", () => {
    const m = sum("grid");
    if (m.kind !== "matrix") throw new Error();
    expect(m.rows[0]!.counts).toEqual([1, 0, 1]);
    const r = sum("rank");
    if (r.kind !== "ranking") throw new Error();
    expect(r.items.map((i) => i.meanRank)).toEqual([1.5, 1.5]);
    const t = sum("story");
    if (t.kind !== "text") throw new Error();
    expect(t.answered).toBe(2);
    const d = sum("when");
    if (d.kind !== "date") throw new Error();
    expect(d.earliest).toBe("2026-08-29");
  });

  it("counts responses per day", () => {
    expect(responsesOverTime(ds.rows)).toEqual([{ day: "2026-09-01", count: 5 }]);
  });

  it("finds frequent words", () => {
    expect(wordFrequencies(["The bus is late", "Late bus again!", "café café"]).slice(0, 3).map((w) => w.word)).toEqual(["bus", "late", "café"]);
  });
});

describe("crosstab", () => {
  it("cross-tabulates two categorical variables", () => {
    const ds = buildDataset([fixtureDoc()], fixtureResponses(), settings());
    const t = crosstab(ds.rows, ds.byId.get("mode")!, ds.byId.get("ok")!);
    expect(t.rowLabels).toEqual(["Bike", "Bus", "Car", "Other"]);
    expect(t.colLabels).toEqual(["Yes", "No"]);
    expect(t.counts).toEqual([
      [1, 0],
      [0, 1],
      [0, 0],
      [1, 0],
    ]);
    expect(t.missing).toBe(2);
  });
});

describe("exports", () => {
  const ds = buildDataset([fixtureDoc()], fixtureResponses(), settings());

  it("CSV quotes safely and neutralizes formulas", () => {
    const csv = toCsv(["a", "b"], [["=SUM(A1)", 'say "hi", ok']], { bom: false });
    expect(csv).toBe(`a,b\r\n'=SUM(A1),"say ""hi"", ok"\r\n`);
    const labelled = exportTable(ds, "labels");
    expect(labelled.rows[0]![labelled.headers.indexOf("Q1")]).toBe("Bike");
    expect(exportTable(ds, "codes").rows[0]![labelled.headers.indexOf("Q1")]).toBe(1);
  });

  it("writes a valid xlsx package", () => {
    const files = unzipSync(toXlsx([{ name: "Data", ...exportTable(ds, "labels") }, { name: "Variables", ...codebook(ds.variables) }]));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain("Café stop");
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">');
  });

  it("writes an SPSS file with the right header", () => {
    const sav = writeSav(ds, { now: new Date(Date.UTC(2026, 9, 3, 12, 0, 0)) });
    const text = new TextDecoder().decode(sav.slice(0, 4));
    expect(text).toBe("$FL2");
    const view = new DataView(sav.buffer, sav.byteOffset);
    expect(view.getInt32(64, true)).toBe(2); // layout code
    expect(view.getInt32(80, true)).toBe(5); // cases
    expect(new TextDecoder().decode(sav.slice(84 + 8, 84 + 8 + 9))).toBe("03 Oct 26");
  });

  it("writes a REFI-QDA project whose selections point at the answers", () => {
    let n = 0;
    const files = unzipSync(writeQdpx(ds, { projectName: "Commute", userName: "Ada", uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` }));
    const qde = strFromU8(files["project.qde"]!);
    expect(qde).toContain('xmlns="urn:QDA-XML:project:1.0"');
    expect(qde).toMatch(/<Code guid="[^"]+" name="Q7 Tell us about your commute"/);
    const txtFiles = Object.keys(files).filter((f) => f.startsWith("sources/"));
    expect(txtFiles).toHaveLength(3); // two stories + one "Other" text
    // Every selection's positions (code points) must extract exactly the answer text.
    const sel = [...qde.matchAll(/<TextSource guid="[^"]+" name="(R\d+)" plainTextPath="internal:\/\/([^"]+)\.txt"[\s\S]*?<\/TextSource>/g)];
    for (const [block, , file] of sel) {
      const text = Array.from(strFromU8(files[`sources/${file}.txt`]!).replace(/^﻿/, ""));
      for (const m of block.matchAll(/startPosition="(\d+)" endPosition="(\d+)"/g)) {
        const piece = text.slice(Number(m[1]), Number(m[2])).join("");
        expect(piece.length).toBeGreaterThan(0);
        expect(piece.startsWith("Q")).toBe(false);
      }
    }
    expect(qde).toContain("<TextValue>Bike</TextValue>");
    expect(qde).toContain("<FloatValue>15</FloatValue>");
    // CRLF variant for MAXQDA keeps positions in LF space.
    const crlf = unzipSync(writeQdpx(ds, { projectName: "C", userName: "A", lineEndings: "crlf" }));
    const anyTxt = Object.entries(crlf).find(([k]) => k.startsWith("sources/"))![1];
    expect(strFromU8(anyTxt)).toContain("\r\n");
  });

  it("generates an R import script with labels", () => {
    const script = rScript(ds, { title: "Commute", generatedAt: new Date(Date.UTC(2026, 9, 3)) });
    expect(script).toContain('lyze[["Q1"]] <- factor(lyze[["Q1"]], levels = c(1, 2, 3, 99), labels = c("Bike", "Bus", "Car", "Other"))');
    expect(script).toContain('lyze[["Q3_f"]] <- factor(lyze[["Q3"]]');
    expect(script).toContain('attr(lyze[["Q7"]], "label") <- "Tell us about your commute"');
  });
});
