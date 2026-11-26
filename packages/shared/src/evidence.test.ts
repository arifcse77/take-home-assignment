import { describe, expect, it } from "vitest";
import { evidenceExistsInText, evidenceUnchanged, normalizeText } from "./evidence.js";

describe("evidence validation", () => {
  it("finds evidence in text with normalized whitespace", () => {
    const text = "Invoice  Total:  $1,234.56\nDue  March 1";
    expect(evidenceExistsInText("$1,234.56", text)).toBe(true);
    expect(evidenceExistsInText("Total:   $1,234.56", text)).toBe(true);
  });

  it("rejects hallucinated evidence", () => {
    const text = "Vendor: Meridian Office Supplies";
    expect(evidenceExistsInText("Acme Corp", text)).toBe(false);
  });

  it("compares unchanged evidence across versions", () => {
    expect(evidenceUnchanged("  foo  bar ", "foo bar")).toBe(true);
    expect(evidenceUnchanged("foo", "bar")).toBe(false);
    expect(evidenceUnchanged(null, null)).toBe(true);
  });

  it("normalizes text", () => {
    expect(normalizeText("a\n\n b\tc")).toBe("a b c");
  });
});