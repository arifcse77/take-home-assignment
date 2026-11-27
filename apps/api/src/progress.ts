export type ReviewCounts = {
  pending: number;
  approved: number;
  corrected: number;
  carried_over: number;
};

export function countReviewStatuses(
  values: { reviewStatus: keyof ReviewCounts }[]
): ReviewCounts {
  const counts: ReviewCounts = { pending: 0, approved: 0, corrected: 0, carried_over: 0 };
  for (const v of values) {
    counts[v.reviewStatus]++;
  }
  return counts;
}