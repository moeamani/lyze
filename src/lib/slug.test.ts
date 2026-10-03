import { describe, expect, it } from "vitest";
import { SLUG_PATTERN, slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("lowercases and dashes words", () => {
    expect(slugify("Learning Sciences Lab")).toBe("learning-sciences-lab");
  });

  it("strips accents and symbols", () => {
    expect(slugify("Café  Régulars!! (2026)")).toBe("cafe-regulars-2026");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });

  it("falls back when nothing usable remains", () => {
    expect(slugify("🙂🙂")).toBe("workspace");
    expect(slugify("مختبر")).toBe("workspace");
  });

  it("caps length without leaving a trailing dash", () => {
    const slug = slugify("a".repeat(39) + " bcdef");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("always produces a slug that passes validation", () => {
    for (const name of ["X", "Hello World", "  ünïcödé  ", "a".repeat(80), "1-2-3"]) {
      expect(slugify(name)).toMatch(SLUG_PATTERN);
    }
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", () => {
    expect(uniqueSlug("lab", [])).toBe("lab");
  });

  it("appends the first free number", () => {
    expect(uniqueSlug("lab", ["lab"])).toBe("lab-2");
    expect(uniqueSlug("lab", ["lab", "lab-2", "lab-3"])).toBe("lab-4");
    expect(uniqueSlug("lab", ["lab", "lab-3"])).toBe("lab-2");
  });
});
