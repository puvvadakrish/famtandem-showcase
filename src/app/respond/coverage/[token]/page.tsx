import Link from "next/link";
import { CalendarDays, Check, Clock, MapPin, ShieldCheck, X } from "lucide-react";
import { formatCoverageRequestDateTime } from "@/lib/coverage-requests/format";
import { getCoverageRequestView } from "@/lib/coverage-requests/read";
import { verifyCoverageResponseCompletionStatus } from "@/lib/coverage-requests/response-status";
import { analyticsEvents } from "@/lib/posthog/events";
import { captureServerEvent } from "@/lib/posthog/server";
import { cn } from "@/lib/ui";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ status?: string; statusProof?: string }>;
};

export default async function CoverageResponsePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { status, statusProof } = await searchParams;
  const request = await getCoverageRequestView(token);
  const analyticsPromises: Promise<unknown>[] = [];

  if (request.tokenId && request.cardId) {
    analyticsPromises.push(
      captureServerEvent(
        analyticsEvents.coverageRequestLinkOpened,
        {
          card_id: request.cardId,
          request_token_id: request.tokenId,
          token_status: request.tokenStatus
        },
        request.tokenId
      ).catch(() => undefined)
    );
  }

  const pending = request.tokenStatus === "pending";
  const slotKinds = request.requests.map((item) => item.slotKind);
  const canAcceptDropoff = slotKinds.includes("dropoff");
  const canAcceptPickup = slotKinds.includes("pickup");
  const canAcceptGeneral = request.requests.some(
    (item) => !["dropoff", "pickup"].includes(item.slotKind)
  );
  const canAcceptBoth = request.requests.length > 1 || canAcceptGeneral;
  const visibleStatus = visibleCompletionStatus({
    proof: statusProof,
    status,
    token,
    tokenId: request.tokenId,
    tokenStatus: request.tokenStatus
  });
  const hasSignedCompletionStatus = visibleStatus === "accepted" || visibleStatus === "declined";

  if (request.tokenId && hasSignedCompletionStatus) {
    const completionProperties = {
      ...(request.cardId ? { card_id: request.cardId } : {}),
      request_token_id: request.tokenId,
      response_source: "confirmation_page",
      status: visibleStatus
    };

    analyticsPromises.push(
      captureServerEvent(
        visibleStatus === "declined"
          ? analyticsEvents.coverageRequestDeclined
          : analyticsEvents.coverageRequestAccepted,
        completionProperties,
        request.tokenId
      ).catch(() => undefined)
    );
  }

  if (analyticsPromises.length > 0) {
    await Promise.all(analyticsPromises);
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-6 text-ink sm:px-6">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-lg border border-line bg-[#fffdf8] shadow-soft">
        <header className="border-b border-line bg-cream px-4 py-5 sm:px-6">
          <Link href="/" className="text-lg font-semibold text-moss">
            FamTandem
          </Link>
          <h1 className="mt-5 text-2xl font-semibold tracking-normal text-ink">
            {pending ? "Can you cover this?" : responseHeading(visibleStatus)}
          </h1>
          <p className="mt-2 text-sm leading-6 text-graphite">
            {pending
              ? `${request.requesterLabel ?? "Someone"} is asking if ${request.recipientLabel ?? "you"} can help with coverage.`
              : responseDescription(visibleStatus)}
          </p>
        </header>

        <section className="space-y-4 px-4 py-5 sm:px-6">
          {request.cardTitle ? (
            <div className="rounded-md border border-line bg-white p-4 shadow-inset">
              <p className="text-xs font-semibold uppercase tracking-normal text-clay">Coverage request</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">{request.cardTitle}</h2>
              <div className="mt-3 space-y-2 text-sm leading-6 text-graphite">
                {request.startsAt ? (
                  <p className="flex gap-2">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-moss" aria-hidden="true" />
                    {formatCoverageRequestDateTime(request.startsAt, request.householdTimezone)}
                  </p>
                ) : null}
                {request.location ? (
                  <p className="flex gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-moss" aria-hidden="true" />
                    {request.location}
                  </p>
                ) : null}
                {request.note ? (
                  <p className="rounded-md bg-cream px-3 py-2 text-graphite">{request.note}</p>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {request.requests.map((item) => (
                  <span
                    key={item.requestId}
                    className="inline-flex min-h-8 items-center rounded-md bg-sage px-2 py-1 text-xs font-semibold text-moss"
                  >
                    {slotKindLabel(item.slotKind)}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-line bg-white p-4 text-sm text-graphite">
              This request link is no longer available.
            </div>
          )}

          {pending ? (
            <form action={`/respond/coverage/${encodeURIComponent(token)}/submit`} className="grid gap-2" method="post">
              {canAcceptDropoff ? (
                <ResponseButton response="accept_dropoff">I can do drop-off</ResponseButton>
              ) : null}
              {canAcceptPickup ? (
                <ResponseButton response="accept_pickup">I can do pickup</ResponseButton>
              ) : null}
              {canAcceptBoth ? (
                <ResponseButton response="accept_both">I can cover it</ResponseButton>
              ) : null}
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-coral/40"
                name="response"
                value="decline"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                I can&apos;t cover this
              </button>
            </form>
          ) : (
            <div
              className={cn(
                "flex items-start gap-3 rounded-md border px-3 py-3 text-sm leading-6",
                visibleStatus === "accepted"
                  ? "border-moss/20 bg-sage text-moss"
                  : "border-line bg-white text-graphite"
              )}
            >
              {visibleStatus === "accepted" ? (
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              ) : (
                <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              )}
              <p>{responseDescription(visibleStatus)}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ResponseButton({
  response,
  children
}: {
  response: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-moss px-3 text-sm font-semibold text-white shadow-inset transition hover:bg-[#244d3c]"
      name="response"
      value={response}
    >
      <Check className="h-4 w-4" aria-hidden="true" />
      {children}
    </button>
  );
}

function responseHeading(status: string) {
  if (status === "accepted") return "Thanks, it's covered.";
  if (status === "declined") return "Thanks for answering.";
  if (status === "expired") return "This request expired.";
  if (status === "already_used" || status === "used") return "This request was already answered.";
  return "This link is not available.";
}

function responseDescription(status: string) {
  if (status === "accepted") return "FamTandem updated the coverage board.";
  if (status === "declined") return "FamTandem will keep this item in Needs Attention.";
  if (status === "expired") return "Ask the family to send a fresh coverage request if help is still needed.";
  if (status === "already_used" || status === "used") return "The coverage board already has a response for this request.";
  return "Ask the family to send a new coverage request.";
}

function visibleCompletionStatus({
  proof,
  status,
  token,
  tokenId,
  tokenStatus
}: {
  proof: string | undefined;
  status: string | undefined;
  token: string;
  tokenId: string | null;
  tokenStatus: string;
}) {
  if (
    (tokenStatus === "already_used" || tokenStatus === "used") &&
    (status === "accepted" || status === "declined") &&
    verifyCoverageResponseCompletionStatus({ proof, status, token, tokenId })
  ) {
    return status;
  }

  return tokenStatus;
}

function slotKindLabel(kind: string) {
  const labels: Record<string, string> = {
    dropoff: "Drop-off",
    pickup: "Pickup",
    stay_attend: "Stay/attend",
    bring_prep: "Bring/prep",
    general_owner: "Coverage"
  };

  return labels[kind] ?? "Coverage";
}
