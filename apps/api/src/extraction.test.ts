import { describe, expect, it } from "vitest";
import { evidenceExistsInText } from "@lomi/shared";

describe("hallucination guard", () => {
  it("stores gap when evidence missing", () => {
    const parsed = "Invoice Number: INV-2024-0891\nTotal: $4,287.50";
    expect(evidenceExistsInText("INV-2024-0891", parsed)).toBe(true);
    expect(evidenceExistsInText("INV-9999", parsed)).toBe(false);
  });
});