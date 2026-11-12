import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      signOut: mocks.signOut
    }
  }))
}));

describe("logout route", () => {
  beforeEach(() => {
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("clears the Supabase session on same-origin POST and redirects to signed-out login", async () => {
    const { POST } = await import("@/app/logout/route");

    const response = await POST(
      new NextRequest("https://app.famtandem.com/logout", {
        headers: {
          origin: "https://app.famtandem.com"
        },
        method: "POST"
      })
    );

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.famtandem.com/login?signedOut=1");
  });

  it("rejects explicit cross-origin POSTs without signing out", async () => {
    const { POST } = await import("@/app/logout/route");

    const response = await POST(
      new NextRequest("https://app.famtandem.com/logout", {
        headers: {
          origin: "https://example.test"
        },
        method: "POST"
      })
    );

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("allows same-origin referer when Origin is absent", async () => {
    const { POST } = await import("@/app/logout/route");

    const response = await POST(
      new NextRequest("https://app.famtandem.com/logout", {
        headers: {
          referer: "https://app.famtandem.com/app"
        },
        method: "POST"
      })
    );

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
  });
});
