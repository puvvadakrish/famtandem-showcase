import { describe, expect, it } from "vitest";
import { fallbackTimezone, normalizeTimezone } from "@/lib/timezone";

describe("normalizeTimezone", () => {
  it("keeps valid IANA timezones", () => {
    expect(normalizeTimezone("America/Los_Angeles")).toBe("America/Los_Angeles");
  });

  it("falls back when timezone input is blank or invalid", () => {
    expect(normalizeTimezone("")).toBe(fallbackTimezone);
    expect(normalizeTimezone("Mars/Olympus")).toBe(fallbackTimezone);
    expect(normalizeTimezone(null)).toBe(fallbackTimezone);
  });
});
