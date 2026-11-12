import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as confirmEmail } from "@/app/auth/confirm/route";
import { GET as authCallback } from "@/app/auth/callback/route";

const mockVerifyOtp = vi.fn();
const mockExchangeCodeForSession = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key"
  })
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url, _key, options) => ({
    auth: {
      verifyOtp: async (params: unknown) => {
        const result = await mockVerifyOtp(params);
        if (!result.error) {
          options.cookies.setAll([
            {
              name: "sb-test-auth-token",
              value: "session",
              options: { path: "/", sameSite: "lax", secure: true }
            }
          ]);
        }
        return result;
      },
      exchangeCodeForSession: async (code: string) => {
        const result = await mockExchangeCodeForSession(code);
        if (!result.error) {
          options.cookies.setAll([
            {
              name: "sb-test-auth-token",
              value: "session",
              options: { path: "/", sameSite: "lax", secure: true }
            }
          ]);
        }
        return result;
      },
      getUser: mockGetUser
    }
  }))
}));

describe("email auth routes", () => {
  beforeEach(() => {
    mockVerifyOtp.mockReset();
    mockExchangeCodeForSession.mockReset();
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: null } });
  });

  it("rejects confirmation links that are missing token details", async () => {
    const response = await confirmEmail(new NextRequest("https://app.famtandem.com/auth/confirm"));

    expect(response.headers.get("location")).toBe("https://app.famtandem.com/login?error=auth_link_invalid");
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("verifies token-hash email links and redirects to a safe app path", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ error: null });

    const response = await confirmEmail(
      new NextRequest("https://app.famtandem.com/auth/confirm?token_hash=abc&type=email&next=/household/new")
    );

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: "abc",
      type: "email"
    });
    expect(response.headers.get("location")).toBe("https://app.famtandem.com/household/new");
    expect(response.headers.getSetCookie().join("\n")).toContain("sb-test-auth-token=session");
  });

  it("falls back to the app when confirmation next path tries to escape the origin", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ error: null });

    const response = await confirmEmail(
      new NextRequest("https://app.famtandem.com/auth/confirm?token_hash=abc&type=email&next=/%5Cevil.example/path")
    );

    expect(response.headers.get("location")).toBe("https://app.famtandem.com/app");
  });

  it("exchanges callback-code links and returns the response with auth cookies", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

    const response = await authCallback(
      new NextRequest("https://app.famtandem.com/auth/callback?code=good&next=/app")
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("good");
    expect(response.headers.get("location")).toBe("https://app.famtandem.com/app");
    expect(response.headers.getSetCookie().join("\n")).toContain("sb-test-auth-token=session");
  });

  it("keeps callback-code links from silently continuing after exchange failure", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: new Error("bad code") });

    const response = await authCallback(
      new NextRequest("https://app.famtandem.com/auth/callback?code=bad&next=/app")
    );

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("bad");
    expect(response.headers.get("location")).toBe("https://app.famtandem.com/login?error=auth_link_failed");
  });
});
