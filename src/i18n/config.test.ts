import { describe, expect, it } from "vitest";
import { direction, negotiateLocale } from "./config";

describe("negotiateLocale", () => {
  it("defaults to English", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("fr-FR,fr;q=0.9")).toBe("en");
  });

  it("respects quality weights", () => {
    expect(negotiateLocale("fr;q=0.9,ar;q=0.8,en;q=0.5")).toBe("ar");
    expect(negotiateLocale("ar;q=0.4,en-US;q=0.9")).toBe("en");
  });

  it("matches regional variants to the base language", () => {
    expect(negotiateLocale("ar-EG")).toBe("ar");
  });
});

describe("direction", () => {
  it("is rtl for Arabic", () => {
    expect(direction("ar")).toBe("rtl");
    expect(direction("en")).toBe("ltr");
  });
});
