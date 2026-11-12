import { AlertCircle, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendMagicLink } from "./actions";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ sent?: string; email?: string; error?: string; signedOut?: string }>;
}) {
  const [params, supabase] = await Promise.all([
    searchParams,
    createSupabaseServerClient()
  ]);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/app");
  }

  const sent = params.sent === "1";
  const errorMessage = getLoginErrorMessage(params.error);
  const signedOut = params.signedOut === "1";
  const submittedEmail = params.email?.trim() ?? "";

  return (
    <AppFrame>
      <main className="mx-auto flex min-h-dvh w-full max-w-5xl items-center px-5 py-8 sm:px-8">
        <section className="grid w-full gap-6 rounded-lg border border-line bg-cream p-5 shadow-inset sm:p-6 lg:grid-cols-[0.95fr_1.05fr] lg:p-8">
          <div className="flex flex-col justify-between gap-6">
            <div className="space-y-5">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-sage text-moss">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-3">
                <p className="text-sm font-semibold text-moss">FamTandem</p>
                <h1 className="max-w-md text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                  Open your coverage board
                </h1>
                <p className="max-w-md text-base leading-7 text-graphite">
                  Email yourself a secure link once on this device. After it opens here, FamTandem keeps you signed in until you sign out or the session expires.
                </p>
              </div>
            </div>

            <div className="grid gap-2 rounded-md border border-line bg-paper p-3 text-sm text-graphite">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-ink">Needs coverage</span>
                <span className="rounded-sm bg-coral/10 px-2 py-1 text-xs font-semibold text-coral">
                  2 open
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-ink">Changed</span>
                <span className="rounded-sm bg-amber/10 px-2 py-1 text-xs font-semibold text-amber">
                  1 update
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-ink">Waiting</span>
                <span className="rounded-sm bg-sky px-2 py-1 text-xs font-semibold text-graphite">
                  1 reply
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-4 shadow-inset sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sage text-moss">
                <Mail className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-ink">
                  {sent ? "Check your email" : "Sign in"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-graphite">
                  Use the email tied to your household. Open the link on the same device and browser you plan to use.
                </p>
              </div>
            </div>

            {signedOut ? (
              <div
                className="mt-5 flex gap-2 rounded-md border border-moss/20 bg-sage/60 px-3 py-3 text-sm leading-6 text-graphite"
                role="status"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-moss" aria-hidden="true" />
                <p>You&apos;re signed out on this device.</p>
              </div>
            ) : null}

            {sent ? (
              <div
                className="mt-5 space-y-3 rounded-md border border-moss/20 bg-sage/60 px-3 py-3 text-sm leading-6 text-graphite"
                role="status"
              >
                <div className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-moss" aria-hidden="true" />
                  <p>
                    Open the newest FamTandem email on this device and we&apos;ll bring you back to the app.
                  </p>
                </div>
                {submittedEmail ? (
                  <p>
                    Sent to <span className="font-semibold text-ink">{submittedEmail}</span>. If that address has a typo, enter the correct email below and send a new link.
                  </p>
                ) : null}
                {process.env.NODE_ENV !== "production" ? (
                  <p>
                    Local dev: open{" "}
                    <a className="font-semibold text-moss underline" href="http://127.0.0.1:54324" target="_blank">
                      Mailpit
                    </a>{" "}
                    and click the latest Supabase email sign-in link for this email.
                  </p>
                ) : null}
              </div>
            ) : null}

            {errorMessage ? (
              <div
                className="mt-5 flex gap-2 rounded-md border border-coral/30 bg-coral/10 px-3 py-3 text-sm leading-6 text-ink"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-coral" aria-hidden="true" />
                <p>{errorMessage}</p>
              </div>
            ) : null}

            <form action={sendMagicLink} className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ink" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  inputMode="email"
                  autoComplete="email"
                  defaultValue={params.email ?? ""}
                  placeholder="parent@example.com"
                  className="min-h-11 w-full rounded-md border border-line bg-cream px-3 text-base text-ink shadow-inset outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
                />
              </div>
              <button
                type="submit"
                className="min-h-11 w-full rounded-md bg-moss px-4 text-sm font-semibold leading-5 text-white shadow-inset transition hover:bg-[#244d3c] focus:outline-none focus:ring-2 focus:ring-moss/30 focus:ring-offset-2 focus:ring-offset-white"
              >
                Email me a sign-in link
              </button>
            </form>

            <p className="mt-4 text-sm leading-6 text-graphite">
              Already opened the email? Return to this tab after the app loads. Next time, open FamTandem on this same device and you should go straight to the board.
            </p>

            {process.env.NODE_ENV !== "production" ? (
              <div className="mt-4 rounded-md border border-line bg-cream px-3 py-3 text-sm leading-6 text-graphite">
                <p className="font-semibold text-ink">Local development login</p>
                <p className="mt-1">
                  There are no password test accounts. Enter any email, email yourself a sign-in link, then open{" "}
                  <a className="font-semibold text-moss underline" href="http://127.0.0.1:54324" target="_blank">
                    Mailpit
                  </a>{" "}
                  to retrieve it. Supabase local must be running.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </AppFrame>
  );
}

function getLoginErrorMessage(error?: string) {
  if (error === "rate_limited") {
    return "We could not send another sign-in link yet. Wait a bit, then try again. If it keeps happening, contact FamTandem.";
  }

  if (error === "signin_failed") {
    return "We could not send that email link. Check the email address and try again.";
  }

  if (error === "auth_link_invalid") {
    return "That email link is missing required sign-in details. Send yourself a new link and open the newest email.";
  }

  if (error === "auth_link_failed") {
    return "That email link could not be used. It may have expired or already been opened. Send yourself a new link and open the newest email.";
  }

  return null;
}
