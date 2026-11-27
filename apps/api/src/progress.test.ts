import { describe, expect, it } from "vitest";
import { countReviewStatuses } from "./progress.js";

describe("countReviewStatuses", () => {
  it("aggregates review counts", () => {
    const counts = countReviewStatuses([
      { reviewStatus: "pending" },
      { reviewStatus: "pending" },
      { reviewStatus: "approved" },
      { reviewStatus: "carried_over" },
    ]);
    expect(counts).toEqual({ pending: 2, approved: 1, corrected: 0, carried_over: 1 });
  });
});