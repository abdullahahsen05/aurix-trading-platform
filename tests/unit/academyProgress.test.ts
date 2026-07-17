import { describe, expect, test } from "vitest";
import { getAcademyProgressLabel } from "@/lib/services/academyProgressService";

describe("academy progress labels", () => {
  test.each([
    [0, "BAD"],
    [39, "BAD"],
    [40, "GOOD"],
    [79, "GOOD"],
    [80, "EXCELLENT"],
    [100, "EXCELLENT"],
  ] as const)("labels %i percent as %s", (percent, label) => {
    expect(getAcademyProgressLabel(percent)).toBe(label);
  });
});
