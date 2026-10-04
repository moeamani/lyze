import { describe, expect, it } from "vitest";
import { divergingColors, niceScale, textOn, wrap } from "./print-charts";

describe("print charts", () => {
  it("picks round axis maxima", () => {
    expect(niceScale(37)).toEqual({ max: 40, step: 10 });
    expect(niceScale(15)).toEqual({ max: 15, step: 5 });
    expect(niceScale(11)).toEqual({ max: 12.5, step: 2.5 });
    expect(niceScale(0)).toEqual({ max: 1, step: 1 });
  });

  it("wraps long labels onto two lines with an ellipsis", () => {
    expect(wrap("Strongly agree", 20)).toEqual(["Strongly agree"]);
    expect(wrap("How much does price shape where you buy coffee", 16)).toEqual(["How much does", "price shape…"]);
  });

  it("colours ordered scales from red through grey to blue", () => {
    expect(divergingColors(5)).toEqual(["#a33232", "#ec8d89", "#d9d8d2", "#86b6ef", "#1c5cab"]);
    expect(divergingColors(4)).toEqual(["#a33232", "#ec8d89", "#86b6ef", "#1c5cab"]);
    expect(divergingColors(7)).toHaveLength(7);
    expect(divergingColors(7)[3]).toBe("#d9d8d2");
  });

  it("puts readable text on each fill", () => {
    expect(textOn("#1c5cab")).toBe("#ffffff");
    expect(textOn("#d9d8d2")).toBe("#0b0b0b");
    expect(textOn("#86b6ef")).toBe("#0b0b0b");
  });
});
