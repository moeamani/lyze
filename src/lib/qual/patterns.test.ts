import { describe, expect, it } from "vitest";
import { caseCodeCsv, coderAgreement, cohenKappa, comparableAttributes, compareGroups, cooccurrence, holm, kappaLabel, type CodeInfo, type Coding, type Person } from "./patterns";

const X: CodeInfo = { id: "x", name: "Engagement", color: "1", parentId: null };
const Y: CodeInfo = { id: "y", name: "Time", color: "2", parentId: null };
const people: Person[] = [
  { id: "p1", code: "P01", attributes: { Level: "Elementary" } },
  { id: "p2", code: "P02", attributes: { Level: "Elementary" } },
  { id: "p3", code: "P03", attributes: { Level: "Elementary" } },
  { id: "p4", code: "P04", attributes: { Level: "High school" } },
  { id: "p5", code: "P05", attributes: { Level: "High school" } },
  { id: "p6", code: "P06", attributes: { Level: "High school", Years: "3" } },
  { id: "p7", code: "P07", attributes: {} },
];
const coding = (codeId: string, participantId: string, unitId: string, coderId = "u1"): Coding => ({ codeId, participantId, unitId, coderId });
// Engagement: every elementary teacher (2, 1 and 3 passages), no high-school teacher. Time: one of each.
const codings: Coding[] = [
  coding("x", "p1", "s1"), coding("x", "p1", "s2"), coding("x", "p2", "s3"), coding("x", "p3", "s4"), coding("x", "p3", "s5"), coding("x", "p3", "s6"),
  coding("y", "p1", "s1"), coding("y", "p4", "s7"), coding("y", "p7", "s8"),
];

describe("interview patterns", () => {
  it("only offers attributes with at least two values", () => {
    expect(comparableAttributes(people)).toEqual(["Level"]);
  });

  it("adjusts p-values with Holm", () => {
    expect(holm([0.01, 0.04, 0.03]).map((p) => +p.toFixed(4))).toEqual([0.03, 0.06, 0.06]);
  });

  it("compares who mentions a code, using Fisher's exact test for two small groups", () => {
    const r = compareGroups(people, codings, [X, Y], "Level");
    expect(r.groups).toEqual([{ value: "Elementary", n: 3 }, { value: "High school", n: 3 }]);
    expect(r.missing).toBe(1);
    const eng = r.rows.find((row) => row.code.id === "x")!;
    expect(eng.cells.map((c) => [c.people, c.passages])).toEqual([[3, 6], [0, 0]]);
    // 3/3 vs 0/3: two-sided Fisher p = 0.1 (R: fisher.test(matrix(c(3,0,0,3),2))).
    expect(eng.test).toMatchObject({ name: "fisher", p: expect.closeTo(0.1, 6) });
    const time = r.rows.find((row) => row.code.id === "y")!;
    expect(time.test!.p).toBeCloseTo(1, 6);
    expect(eng.test!.pAdjusted).toBeCloseTo(0.2, 6);
  });

  it("compares counts with rank tests, or ANOVA when asked (flagged for small groups)", () => {
    const mw = compareGroups(people, codings, [X], "Level", "count").rows[0]!;
    expect(mw.cells.map((c) => +c.mean.toFixed(2))).toEqual([2, 0]);
    expect(mw.test).toMatchObject({ name: "mann-whitney", statistic: 9 });
    const anova = compareGroups(people, codings, [X], "Level", "count", "anova").rows[0]!;
    // F = 12 with 1 and 4 df (means 2 vs 0, within-group variance 1 vs 0).
    expect(anova.test).toMatchObject({ name: "anova", df: 1, caution: true });
    expect(anova.test!.statistic).toBeCloseTo(12, 6);
  });

  it("finds codes applied to the same passage", () => {
    const { pairs } = cooccurrence(codings, [X, Y]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ together: 1 });
    // s1 has both; Engagement is on 6 passages, Time on 3: 1 / (6 + 3 - 1).
    expect(pairs[0]!.jaccard).toBeCloseTo(1 / 8, 6);
  });

  it("measures agreement between two coders with Cohen's kappa", () => {
    expect(cohenKappa(20, 5, 10, 15)).toBeCloseTo(0.4, 6);
    expect(cohenKappa(0, 0, 0, 10)).toBeNull();
    expect(kappaLabel(0.65)).toBe("substantial");
    const units = Array.from({ length: 10 }, (_, i) => `u${i + 1}`);
    const a = ["u1", "u2", "u3", "u4", "u5"].map((u) => coding("x", "p1", u, "A"));
    const b = ["u1", "u2", "u3", "u4", "u6"].map((u) => coding("x", "p1", u, "B"));
    const r = coderAgreement([...a, ...b], [X, Y], "A", "B", units);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ both: 4, onlyA: 1, onlyB: 1, neither: 4, agreement: 0.8 });
    expect(r.rows[0]!.kappa).toBeCloseTo(0.6, 6);
    expect(r.pooled!.kappa).toBeCloseTo(0.6, 6);
  });

  it("exports participant × code counts", () => {
    expect(caseCodeCsv(people.slice(0, 2), codings, [X, Y]).split("\n")).toEqual(["participant,Level,Engagement,Time", "P01,Elementary,2,1", "P02,Elementary,1,0"]);
  });
});
