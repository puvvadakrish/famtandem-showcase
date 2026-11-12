import { describe, expect, it } from "vitest";
import { safeAuthRedirectPath } from "@/lib/auth/redirect";

describe("safeAuthRedirectPath", () => {
  it("allows relative app paths", () => {
    expect(safeAuthRedirectPath("/app")).toBe("/app");
    expect(safeAuthRedirectPath("/household/new")).toBe("/household/new");
  });

  it("rejects missing, protocol-relative, and absolute redirects", () => {
    expect(safeAuthRedirectPath(null)).toBe("/app");
    expect(safeAuthRedirectPath("//evil.example/path")).toBe("/app");
    expect(safeAuthRedirectPath("https://evil.example/path")).toBe("/app");
    expect(safeAuthRedirectPath("app")).toBe("/app");
  });

  it("rejects backslash and control-character redirect tricks", () => {
    expect(safeAuthRedirectPath("/\\evil.example/path")).toBe("/app");
    expect(safeAuthRedirectPath("/app\n//evil.example")).toBe("/app");
  });
});
