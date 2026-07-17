import { describe, expect, test } from "vitest";
import {
  getBotFileExtension,
  sanitizeBotFileName,
} from "@/lib/services/botReleaseService";

describe("bot release file validation", () => {
  test.each(["bot.ex5", "BOT.EX4", "wsa-package.zip"])(
    "allows supported bot file %s",
    (fileName) => {
      expect(getBotFileExtension(fileName)).not.toBeNull();
    },
  );

  test.each(["source.mq5", "plugin.dll", "page.html", "no-extension"])(
    "rejects unsupported bot file %s",
    (fileName) => {
      expect(getBotFileExtension(fileName)).toBeNull();
    },
  );

  test("removes path and unsafe filename characters", () => {
    expect(sanitizeBotFileName("../unsafe bot<>.ex5")).toBe("unsafe_bot_.ex5");
  });
});
