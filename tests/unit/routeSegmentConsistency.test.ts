import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

function collectDynamicConflicts(root: string) {
  const conflicts: string[] = [];

  function walk(dir: string) {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));

    const dynamicNames = entries
      .map((entry) => entry.name)
      .filter((name) => /^\[[^./]+]$/.test(name));

    const distinctParamNames = new Set(dynamicNames.map((name) => name.slice(1, -1)));
    if (distinctParamNames.size > 1) {
      conflicts.push(`${path.relative(root, dir)} => ${dynamicNames.sort().join(", ")}`);
    }

    for (const entry of entries) {
      walk(path.join(dir, entry.name));
    }
  }

  walk(root);
  return conflicts;
}

describe("route segment consistency", () => {
  test("does not mix dynamic segment names under the same parent folder", () => {
    const appRoot = path.join(process.cwd(), "src", "app");
    const conflicts = collectDynamicConflicts(appRoot);

    expect(conflicts).toEqual([]);
  });
});
