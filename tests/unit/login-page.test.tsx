import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn()
}));

vi.mock("@/app/login/actions", () => ({
  sendMagicLink: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.getUser
    }
  }))
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

describe("LoginPage", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.redirect.mockReset();
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("renders a parent-friendly email sign-in screen without a primary password path", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(
      screen.getByRole("heading", { name: "Open your coverage board" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Email yourself a secure link once on this device/)).toBeInTheDocument();
    expect(screen.getByText(/keeps you signed in until you sign out or the session expires/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Email me a sign-in link" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use password instead/i })).not.toBeInTheDocument();
  });

  it("renders a useful retry message for Supabase email rate limits", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({
          error: "rate_limited",
          email: "parent@example.com"
        })
      })
    );

    expect(
      screen.getByText(/We could not send another sign-in link yet/)
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Wait a bit/);
    expect(screen.getByLabelText("Email")).toHaveValue("parent@example.com");
    expect(screen.queryByRole("link", { name: /Continue after opening the email link/ })).not.toBeInTheDocument();
  });

  it("redirects authenticated users from login to the app", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    await expect(
      LoginPage({
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(mocks.redirect).toHaveBeenCalledWith("/app");
  });

  it("renders signed-out confirmation after explicit logout", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({
          signedOut: "1"
        })
      })
    );

    expect(screen.getByRole("status")).toHaveTextContent("You're signed out on this device.");
  });

  it("renders a generic send failure without crashing the login page", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({
          error: "signin_failed"
        })
      })
    );

    expect(
      screen.getByText(/We could not send that email link/)
    ).toBeInTheDocument();
  });

  it("renders useful guidance for invalid or expired email links", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({
          error: "auth_link_failed"
        })
      })
    );

    expect(screen.getByText(/That email link could not be used/)).toBeInTheDocument();
  });

  it("keeps users on the email confirmation step after a magic link has been sent", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({
          sent: "1",
          email: "parent@example.com"
        })
      })
    );

    expect(screen.getByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Open the newest FamTandem email on this device/);
    expect(screen.getByText(/Sent to/)).toHaveTextContent("Sent to parent@example.com");
    expect(screen.queryByRole("link", { name: /Continue after opening the email link/ })).not.toBeInTheDocument();
  });
});
