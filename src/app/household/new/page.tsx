import { redirect } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { cohortConsentCopy } from "@/lib/consent";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createHousehold } from "./actions";
import { TimezoneField } from "./timezone-field";

export const dynamic = "force-dynamic";

export default async function NewHouseholdPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppFrame>
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-8">
        <section className="rounded-lg border border-line bg-white p-5 shadow-inset">
          <h1 className="text-2xl font-semibold text-ink">Create your household</h1>
          <p className="mt-2 text-sm leading-6 text-graphite">
            Start the shared board for the people who help keep your week covered.
          </p>

          <form action={createHousehold} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink" htmlFor="householdName">
                Household name
              </label>
              <input
                id="householdName"
                name="householdName"
                required
                placeholder="Rivera family"
                className="mt-2 min-h-11 w-full rounded-md border border-line bg-cream px-3 text-base text-ink shadow-inset"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink" htmlFor="displayName">
                Your name
              </label>
              <input
                id="displayName"
                name="displayName"
                required
                placeholder="Krish"
                className="mt-2 min-h-11 w-full rounded-md border border-line bg-cream px-3 text-base text-ink shadow-inset"
              />
            </div>

            <TimezoneField />

            <div className="rounded-md border border-line bg-cream p-3 text-sm leading-6 text-graphite">
              {cohortConsentCopy.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>

            <label className="flex items-start gap-3 text-sm text-ink">
              <input
                required
                type="checkbox"
                name="consentAccepted"
                className="mt-1 h-4 w-4 rounded border-line text-moss"
              />
              I understand and agree to the early cohort consent guidance.
            </label>

            <button className="min-h-11 w-full rounded-md bg-moss px-4 text-sm font-semibold text-white shadow-inset transition hover:bg-[#244d3c]">
              Create household
            </button>
          </form>
        </section>
      </main>
    </AppFrame>
  );
}
