import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  CircleAlert,
  ClipboardPaste,
  Clock,
  Home,
  Inbox,
  LifeBuoy,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  UsersRound
} from "lucide-react";
import {
  addChild,
  addHouseholdMember,
  coverSlotAsCurrentMember,
  createCoverageRequest,
  createManualCard,
  createPasteSourceInput,
  disconnectGoogleCalendar,
  exportCoverageCardToGoogleCalendar,
  markSlotAlreadyCovered,
  sendHouseholdMemberInvite,
  setSlotState,
  addReadinessItemToCard,
  updateCoverageCard,
  updateReadinessItem,
  updateSlotKind
} from "@/app/app/actions";
import type {
  BoardCard,
  ChildSummary,
  CoverageSlotKind,
  CoverageSlotSummary,
  CoverageSlotState,
  HouseholdMemberSummary,
  ReadinessStatus
} from "@/lib/types";
import type { GoogleCalendarBoardState } from "@/lib/google-calendar/server";
import { cn } from "@/lib/ui";
import { UploadSourceForm } from "@/components/upload-source-form";

export function BoardShell({
  householdName,
  cards,
  childProfiles,
  canEditCards,
  currentMemberId,
  timezone,
  members,
  isHouseholdAdmin,
  googleCalendar,
  googleCalendarStatus,
  calendarExportStatus,
  manualCoverageRequestLink,
  onboarding,
  saveFlash,
  publicPreview = false
}: {
  householdName: string;
  cards: BoardCard[];
  childProfiles: ChildSummary[];
  canEditCards: boolean;
  currentMemberId?: string;
  timezone: string;
  members: HouseholdMemberSummary[];
  isHouseholdAdmin: boolean;
  googleCalendar?: GoogleCalendarBoardState;
  googleCalendarStatus?: string | null;
  calendarExportStatus?: string | null;
  manualCoverageRequestLink?: string | null;
  onboarding?: BetaOnboardingState;
  saveFlash?: SaveFlash;
  publicPreview?: boolean;
}) {
  const needsAttention = cards.filter((card) => card.section === "needs_attention");
  const thisWeek = cards.filter((card) => card.section === "this_week");
  const needsCoverageCount = needsAttention.filter(
    (card) => card.coverageState === "needs_coverage" || card.attentionFlags.includes("needs_coverage")
  ).length;
  const coveredCount = cards.filter((card) => card.coverageState === "covered").length;
  const changedCount = needsAttention.filter((card) => card.coverageState === "changed" || card.attentionFlags.includes("changed")).length;
  const waitingCount = needsAttention.filter((card) => card.coverageState === "pending").length;
  const defaultParent = members.find((member) => member.role === "household_admin") ?? members[0];
  const betaOnboarding = buildBetaOnboardingState({
    cards,
    childProfiles,
    members,
    sourceCount: onboarding?.sourceCount ?? 0
  });

  return (
    <main className={cn("min-h-dvh bg-paper text-ink lg:pb-0", publicPreview ? "pb-8" : "pb-20")}>
      <div className="mx-auto grid min-h-dvh w-full max-w-[94rem] grid-cols-1 overflow-x-hidden border-x border-line/70 bg-cream shadow-soft lg:grid-cols-[15rem_minmax(0,1fr)_22rem]">
        <AppNav householdName={householdName} defaultParent={defaultParent} publicPreview={publicPreview} />

        <section className="min-w-0 border-x border-line/70 bg-[#fffdf8]">
          <BoardHeader
            changedCount={changedCount}
            coveredCount={coveredCount}
            householdName={householdName}
            needsCoverageCount={needsCoverageCount}
            needsAttentionCount={needsAttention.length}
            publicPreview={publicPreview}
            totalCount={cards.length}
            waitingCount={waitingCount}
          />

          <div className="px-4 pb-10 pt-4 sm:px-6 sm:pt-5">
            <AttentionSummary
              changedCount={changedCount}
              needsCoverageCount={needsCoverageCount}
              waitingCount={waitingCount}
            />
            {manualCoverageRequestLink ? (
              <CoverageRequestLinkNotice responseUrl={manualCoverageRequestLink} />
            ) : null}
            {googleCalendarStatus ? (
              <GoogleCalendarNotice status={googleCalendarStatus} />
            ) : null}
            {calendarExportStatus ? (
              <CalendarExportNotice status={calendarExportStatus} />
            ) : null}
            {!publicPreview && betaOnboarding.shouldShow ? (
              <BetaOnboardingPanel state={betaOnboarding} />
            ) : null}

            <BoardSection
              cards={needsAttention}
              canEditCards={canEditCards}
              childProfiles={childProfiles}
              currentMemberId={currentMemberId}
              googleCalendar={googleCalendar}
              description="A few things need a decision."
              icon={<CircleAlert className="h-5 w-5" aria-hidden="true" />}
              isHouseholdAdmin={isHouseholdAdmin}
              members={members}
              publicPreview={publicPreview}
              saveFlash={saveFlash}
              timezone={timezone}
              title="Needs Attention"
              variant="attention"
            />
            <WeekCoverageHealth coveredCount={coveredCount} totalCount={cards.length} />
            <BoardSection
              cards={thisWeek}
              canEditCards={canEditCards}
              childProfiles={childProfiles}
              currentMemberId={currentMemberId}
              googleCalendar={googleCalendar}
              description="Covered plans and the week ahead."
              icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
              isHouseholdAdmin={isHouseholdAdmin}
              members={members}
              publicPreview={publicPreview}
              saveFlash={saveFlash}
              timezone={timezone}
              title="This Week"
              variant="week"
            />
          </div>
        </section>

        <aside className="space-y-5 bg-cream px-4 py-5 sm:px-6 lg:pb-8">
          {publicPreview ? (
            <PublicPreviewSetupPanel />
          ) : (
            <>
              <QuickActions />
              <PasteSourceForm isHouseholdAdmin={isHouseholdAdmin} />
              <HouseholdSetup
                childProfiles={childProfiles}
                isHouseholdAdmin={isHouseholdAdmin}
                members={members}
                saveFlash={saveFlash}
              />
              <NewCardForm
                childProfiles={childProfiles}
                isHouseholdAdmin={isHouseholdAdmin}
                saveFlash={saveFlash}
                timezone={timezone}
              />
            </>
          )}
          <StateExamples />
        </aside>
      </div>
      {publicPreview ? null : <MobileBottomNav />}
    </main>
  );
}

type BetaOnboardingState = {
  sourceCount: number;
};

type SaveFlash = {
  setup?: string | null;
  cardSaved?: string | null;
  cardId?: string | null;
  savedName?: string | null;
  memberId?: string | null;
  cardCount?: number | null;
};

type BuiltBetaOnboardingState = BetaOnboardingState & {
  hasChild: boolean;
  hasSecondAdultOrHelper: boolean;
  hasCard: boolean;
  hasCoverageAsk: boolean;
  shouldShow: boolean;
};

function buildBetaOnboardingState({
  cards,
  childProfiles,
  members,
  sourceCount
}: {
  cards: BoardCard[];
  childProfiles: ChildSummary[];
  members: HouseholdMemberSummary[];
  sourceCount: number;
}): BuiltBetaOnboardingState {
  const hasCoverageAsk = cards.some((card) =>
    card.slots.some((slot) => slot.state === "requested" || slot.state === "accepted" || slot.state === "declined")
  );

  return {
    sourceCount,
    hasChild: childProfiles.length > 0,
    hasSecondAdultOrHelper: members.length > 1,
    hasCard: cards.length > 0,
    hasCoverageAsk,
    shouldShow:
      sourceCount === 0 ||
      cards.length === 0 ||
      childProfiles.length === 0 ||
      members.length < 2 ||
      !hasCoverageAsk
  };
}

function BetaOnboardingPanel({ state }: { state: BuiltBetaOnboardingState }) {
  const steps = [
    {
      label: "Add a child profile",
      description: "Cards are easier to scan when each event says who it belongs to.",
      complete: state.hasChild,
      href: "#household-setup"
    },
    {
      label: "Add another parent or helper",
      description: "Save their email so FamTandem can send the sign-in link.",
      complete: state.hasSecondAdultOrHelper,
      href: "#household-setup"
    },
    {
      label: "Paste real logistics",
      description: "Use a school note, coach email, appointment reminder, or camp update.",
      complete: state.sourceCount > 0,
      href: "#add-logistics"
    },
    {
      label: "Review the first cards",
      description: "Check time, child, location, readiness items, and coverage slots.",
      complete: state.hasCard,
      href: state.hasCard ? "#Needs-Attention" : "#add-logistics"
    },
    {
      label: "Ask for coverage",
      description: "Use a card's Ask for coverage flow and create one response link.",
      complete: state.hasCoverageAsk,
      href: state.hasCard ? "#Needs-Attention" : "#add-logistics"
    }
  ];

  return (
    <section className="mb-6 rounded-lg border border-moss/20 bg-sage p-4 shadow-inset" aria-labelledby="beta-onboarding-title">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-moss/20 bg-white text-moss">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-moss">First week setup</p>
              <h2 id="beta-onboarding-title" className="mt-1 text-xl font-semibold text-ink">
                Start with this week&apos;s real logistics
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite">
                Add kids and another adult or helper, paste a real logistics note, review the source-backed cards, then send one coverage ask. Review against the source before treating an AI-created card as final.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {steps.map((step) => (
              <a
                className={cn(
                  "rounded-md border px-3 py-2 text-sm transition",
                  step.complete
                    ? "border-moss/20 bg-white text-graphite"
                    : "border-line bg-cream text-ink hover:border-moss/40"
                )}
                href={step.href}
                key={step.label}
              >
                <span className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[0.7rem] font-semibold",
                      step.complete
                        ? "border-moss bg-moss text-white"
                        : "border-clay bg-white text-clay"
                    )}
                  >
                    {step.complete ? <Check className="h-3 w-3" aria-hidden="true" /> : " "}
                    <span className="sr-only">{step.complete ? "Complete" : "Not complete"}</span>
                  </span>
                  <span>
                    <span className="block font-semibold">{step.label}</span>
                    <span className="mt-0.5 block leading-5 text-graphite">{step.description}</span>
                  </span>
                </span>
              </a>
            ))}
          </div>

          <p className="mt-4 rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold leading-5 text-graphite">
            Early beta guardrail: skip detailed medical, legal, financial, custody, or highly sensitive records. Basic appointment logistics are fine.
          </p>
        </div>

        <div className="border-l border-moss/20 pl-4">
          <p className="text-xs font-semibold uppercase tracking-normal text-clay">Best first inputs</p>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-graphite">
            <li>
              <span className="font-semibold text-ink">A school or coach email</span>
              <span className="block">Paste the full text when pickup, location, or arrival time changed.</span>
            </li>
            <li>
              <span className="font-semibold text-ink">A form or readiness note</span>
              <span className="block">Use anything with a due date, payment, supplies, or permission slip.</span>
            </li>
            <li>
              <span className="font-semibold text-ink">A screenshot or PDF</span>
              <span className="block">Upload it for source review; paste the text too if you need cards right away.</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function CoverageRequestLinkNotice({ responseUrl }: { responseUrl: string }) {
  return (
    <section className="mb-5 rounded-lg border border-moss/20 bg-sage p-4 shadow-inset" aria-label="Response link ready">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-moss/20 bg-white text-moss">
          <Copy className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink">Response link ready</h2>
          <label className="mt-3 block text-xs font-semibold text-moss" htmlFor="coverage-request-response-link">
            Coverage request link
          </label>
          <input
            className={cn(controlClassName, "mt-1 bg-white")}
            id="coverage-request-response-link"
            readOnly
            value={responseUrl}
          />
        </div>
      </div>
    </section>
  );
}

function GoogleCalendarNotice({ status }: { status: string }) {
  const messages: Record<string, { title: string; body: string; tone: "good" | "warn" }> = {
    connected: {
      title: "Google Calendar connected",
      body: "Timed coverage cards can now be added to your calendar from each card.",
      tone: "good"
    },
    disconnected: {
      title: "Google Calendar disconnected",
      body: "FamTandem will stop exporting cards until you connect again.",
      tone: "good"
    },
    not_configured: {
      title: "Google Calendar is not configured",
      body: "Calendar export needs Google OAuth credentials before it can be used here.",
      tone: "warn"
    },
    not_allowed: {
      title: "Calendar export is parent-only",
      body: "Ask a parent or household admin to connect Google Calendar.",
      tone: "warn"
    },
    cancelled: {
      title: "Google Calendar was not connected",
      body: "No changes were made.",
      tone: "warn"
    },
    missing_refresh: {
      title: "Google Calendar needs consent again",
      body: "Try connecting again so FamTandem can add cards after you leave the page.",
      tone: "warn"
    },
    failed: {
      title: "Google Calendar connection failed",
      body: "Try again in a minute. No coverage cards were changed.",
      tone: "warn"
    }
  };
  const message = messages[status] ?? messages.failed;

  return (
    <section
      className={cn(
        "mb-5 rounded-lg border p-4 shadow-inset",
        message.tone === "good" ? "border-moss/20 bg-sage" : "border-amber/25 bg-[#fff7e8]"
      )}
      aria-label={message.title}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-white text-moss">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-ink">{message.title}</h2>
          <p className="mt-1 text-sm leading-6 text-graphite">{message.body}</p>
        </div>
      </div>
    </section>
  );
}

function CalendarExportNotice({ status }: { status: string }) {
  const message =
    status === "created"
      ? "Card added to Google Calendar."
      : status === "updated"
        ? "Google Calendar event updated."
        : "Google Calendar export failed. Try again from the card.";

  return (
    <section
      className={cn(
        "mb-5 rounded-lg border p-4 text-sm font-semibold shadow-inset",
        status === "failed" ? "border-amber/25 bg-[#fff7e8] text-amber" : "border-moss/20 bg-sage text-moss"
      )}
      aria-label="Google Calendar export status"
    >
      {message}
    </section>
  );
}

function AppNav({
  householdName,
  defaultParent,
  publicPreview = false
}: {
  householdName: string;
  defaultParent?: HouseholdMemberSummary;
  publicPreview?: boolean;
}) {
  const navItems = [
    { label: "Today", icon: Home, active: true, href: "/app" },
    { label: "This Week", icon: CalendarDays, href: "#This-Week" },
    { label: "Inbox", icon: Inbox, href: "/app/inbox" },
    { label: "People", icon: UsersRound, href: "#household-setup" },
    { label: "Settings", icon: Settings, href: "#household-setup" }
  ];

  return (
    <nav className="hidden bg-cream px-5 py-6 lg:block" aria-label="FamTandem navigation">
      <a href={publicPreview ? "/" : "/app"} className="flex items-center gap-3 text-xl font-semibold text-moss">
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-moss/20 bg-sage text-moss">
          <LifeBuoy className="h-5 w-5" aria-hidden="true" />
        </span>
        FamTandem
      </a>

      {publicPreview ? (
        <div className="mt-8 rounded-md border border-line bg-white p-3">
          <p className="text-xs font-semibold uppercase text-clay">Preview mode</p>
          <p className="mt-2 text-sm leading-6 text-graphite">
            Sample household data. Sign in to use the live board with your family.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <a
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-graphite transition hover:bg-sage/70 hover:text-ink",
                  item.active && "bg-sage text-ink shadow-inset"
                )}
                href={item.href}
                key={item.label}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="min-w-0 flex-1">{item.label}</span>
              </a>
            );
          })}
        </div>
      )}

      <div className="mt-10 border-t border-line pt-5">
        <p className="text-xs font-semibold uppercase text-clay">Default parent</p>
        <div className="mt-3 flex items-center gap-3 rounded-md border border-line bg-white p-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-oat text-sm font-semibold text-moss">
            {initials(defaultParent?.displayName ?? householdName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {defaultParent?.displayName ?? householdName}
            </p>
            <p className="text-xs text-graphite">Holding the plan</p>
          </div>
          <ChevronDown className="ml-auto h-4 w-4 text-graphite" aria-hidden="true" />
        </div>
        {publicPreview ? null : <SignOutForm variant="desktop" />}
      </div>
    </nav>
  );
}

function BoardHeader({
  householdName,
  needsAttentionCount,
  needsCoverageCount,
  changedCount,
  waitingCount,
  coveredCount,
  totalCount,
  publicPreview
}: {
  householdName: string;
  needsAttentionCount: number;
  needsCoverageCount: number;
  changedCount: number;
  waitingCount: number;
  coveredCount: number;
  totalCount: number;
  publicPreview: boolean;
}) {
  return (
    <header className="border-b border-line bg-cream/95 px-4 py-4 sm:px-6">
      <h1 className="sr-only">Coverage board</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <div>
              <p className="text-lg font-semibold text-moss">FamTandem</p>
              <button className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-graphite" type="button">
                {householdName}
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative inline-grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink">
                <Bell className="h-4 w-4" aria-hidden="true" />
                {needsAttentionCount > 0 ? (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 text-[0.6875rem] font-semibold text-white">
                    {needsAttentionCount}
                  </span>
                ) : null}
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-oat text-sm font-semibold text-moss">
                FT
              </span>
            </div>
          </div>
          {publicPreview ? null : (
            <div className="mt-3 lg:hidden">
              <SignOutForm variant="mobile" />
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3 lg:mt-0">
            <h2 className="text-3xl font-semibold tracking-normal text-ink sm:text-4xl lg:text-2xl">
              Today needs attention
            </h2>
            <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink">
              <UsersRound className="h-4 w-4" aria-hidden="true" />
              {householdName}
            </span>
          </div>
          <p className="mt-1 text-sm text-graphite">A few things need a decision.</p>
        </div>

        <div className={cn("hidden flex-wrap gap-2", publicPreview ? "" : "sm:flex")}>
          <a
            href="#add-logistics"
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-moss px-3 text-sm font-semibold text-white shadow-inset transition hover:bg-[#244d3c]"
          >
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
            Add logistics
          </a>
          <a
            href="#new-card"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-moss/40"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add card
          </a>
          <span className="relative inline-grid h-10 w-10 place-items-center rounded-md border border-line bg-white text-ink">
            <Bell className="h-4 w-4" aria-hidden="true" />
            {needsAttentionCount > coveredCount || totalCount === 0 ? (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-coral" />
            ) : null}
          </span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:hidden">
        <StatusChip label="need coverage" value={needsCoverageCount} tone="urgent" />
        <StatusChip label="changed" value={changedCount} tone="changed" />
        <StatusChip label="waiting" value={waitingCount} tone="waiting" />
      </div>
      <div className="mt-4 hidden grid-cols-3 gap-3 sm:grid lg:hidden">
        <StatusChip label="need coverage" value={needsCoverageCount} tone="urgent" />
        <StatusChip label="covered" value={coveredCount} tone="covered" />
        <StatusChip label="total plans" value={totalCount} tone="waiting" />
      </div>
    </header>
  );
}

function SignOutForm({ variant }: { variant: "desktop" | "mobile" }) {
  return (
    <form action="/logout" method="post" className={variant === "desktop" ? "mt-3" : ""}>
      <button
        className={cn(
          "inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold text-graphite transition hover:border-moss/40 hover:text-ink",
          variant === "desktop" ? "w-full justify-center" : ""
        )}
        type="submit"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out
      </button>
    </form>
  );
}

function AttentionSummary({
  needsCoverageCount,
  changedCount,
  waitingCount
}: {
  needsCoverageCount: number;
  changedCount: number;
  waitingCount: number;
}) {
  return (
    <div className="mb-5 hidden gap-3 lg:grid lg:grid-cols-3">
      <StatusChip label="need coverage" value={needsCoverageCount} tone="urgent" />
      <StatusChip label="changed" value={changedCount} tone="changed" />
      <StatusChip label="waiting" value={waitingCount} tone="waiting" />
    </div>
  );
}

function StatusChip({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "urgent" | "covered" | "changed" | "waiting";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white px-3 py-3 shadow-inset sm:px-4",
        tone === "urgent" && "border-coral/25",
        tone === "covered" && "border-moss/20",
        tone === "changed" && "border-amber/25",
        tone === "waiting" && "border-sky/80"
      )}
    >
      <p
        className={cn(
          "text-2xl font-semibold leading-none",
          tone === "urgent" && "text-coral",
          tone === "covered" && "text-moss",
          tone === "changed" && "text-amber",
          tone === "waiting" && "text-[#4f6f80]"
        )}
      >
        {value}
      </p>
      <p
        className="mt-1 text-[0.72rem] font-semibold leading-4 text-graphite sm:text-xs"
      >
        {label}
      </p>
    </div>
  );
}

function WeekCoverageHealth({ coveredCount, totalCount }: { coveredCount: number; totalCount: number }) {
  const percentage = totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 0;

  return (
    <section className="mt-7 rounded-lg border border-line bg-white p-4 shadow-inset" aria-label="Coverage health">
      <div className="flex items-center gap-4">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-sm font-semibold text-ink"
          style={{
            background: `conic-gradient(#315f4b ${percentage}%, #f09a2a ${percentage}% ${Math.max(percentage, 74)}%, #eadfce 0)`
          }}
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white">{percentage}%</span>
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">Coverage health</h2>
          <p className="mt-1 text-sm leading-6 text-graphite">
            {coveredCount} of {totalCount} covered. {Math.max(totalCount - coveredCount, 0)} need a decision before Friday.
          </p>
        </div>
        <SlidersHorizontal className="ml-auto hidden h-5 w-5 text-moss sm:block" aria-hidden="true" />
      </div>
    </section>
  );
}

function QuickActions() {
  const actions = [
    { label: "Open coverage", description: "Cards waiting on a person.", icon: UsersRound },
    { label: "Claim a slot", description: "Pickup, drop-off, or owner gaps.", icon: Check },
    { label: "Outside coverage", description: "Carpool, aftercare, or family help.", icon: ShieldCheck }
  ];

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-inset">
      <h2 className="text-base font-semibold text-ink">Quick actions</h2>
      <div className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <a
              className="flex items-center gap-3 bg-cream px-3 py-3 text-left transition hover:bg-sage/55"
              href="#Needs-Attention"
              key={action.label}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-white text-moss">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{action.label}</span>
                <span className="block text-xs leading-5 text-graphite">{action.description}</span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function PublicPreviewSetupPanel() {
  return (
    <details className="rounded-lg border border-line bg-white p-4 shadow-inset">
      <summary className="flex list-none items-center justify-between gap-3 text-left [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-base font-semibold text-ink">First week setup</span>
          <span className="mt-1 block text-sm leading-6 text-graphite">
            Paste a real logistics note after sign-in, then review cards and ask for coverage.
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-graphite" aria-hidden="true" />
      </summary>
      <div className="mt-4 space-y-3 border-t border-line pt-4 text-sm leading-6 text-graphite">
        <p>
          Start with one school, sports, appointment, or camp message where time, pickup, supplies, or ownership matters.
        </p>
        <p className="rounded-md border border-line bg-cream px-3 py-2 text-xs font-semibold leading-5">
          Beta guardrail: skip detailed medical, legal, financial, custody, or highly sensitive records. Basic appointment logistics are fine.
        </p>
      </div>
    </details>
  );
}

function BoardSection({
  title,
  description,
  icon,
  cards,
  childProfiles,
  currentMemberId,
  googleCalendar,
  canEditCards,
  members,
  isHouseholdAdmin,
  publicPreview,
  saveFlash,
  timezone,
  variant
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  cards: BoardCard[];
  canEditCards: boolean;
  childProfiles: ChildSummary[];
  currentMemberId?: string;
  googleCalendar?: GoogleCalendarBoardState;
  members: HouseholdMemberSummary[];
  isHouseholdAdmin: boolean;
  publicPreview: boolean;
  saveFlash?: SaveFlash;
  timezone: string;
  variant: "attention" | "week";
}) {
  const headingId = title.replace(/\s+/g, "-").toLowerCase();

  return (
    <section className="mt-7 scroll-mt-4" aria-labelledby={headingId} id={title.replace(/\s+/g, "-")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 grid h-8 w-8 place-items-center rounded-md border",
              variant === "attention"
                ? "border-coral/25 bg-red-50 text-coral"
                : "border-moss/20 bg-sage text-moss"
            )}
          >
            {icon}
          </span>
          <div>
            <h2 id={headingId} className="text-lg font-semibold tracking-normal text-ink">
              {title}
            </h2>
            <p className="mt-1 text-sm text-graphite">{description}</p>
          </div>
        </div>
        {cards.length > 0 ? (
          <p className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-semibold text-graphite">
            {cards.length} item{cards.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {cards.length === 0 ? (
          <EmptyBoardState variant={variant} />
        ) : (
          cards.map((card) => (
            <CoverageCard
              key={card.id}
              card={card}
              canEditCards={canEditCards}
              childProfiles={childProfiles}
              currentMemberId={currentMemberId}
              googleCalendar={googleCalendar}
              isHouseholdAdmin={isHouseholdAdmin}
              members={members}
              publicPreview={publicPreview}
              saveFlash={saveFlash}
              timezone={timezone}
            />
          ))
        )}
      </div>
    </section>
  );
}

function EmptyBoardState({ variant }: { variant: "attention" | "week" }) {
  const isAttention = variant === "attention";
  return (
    <div className="rounded-lg border border-dashed border-line bg-white p-4 text-sm text-graphite">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-md",
            isAttention ? "bg-sage text-moss" : "bg-oat text-amber"
          )}
        >
          {isAttention ? <Check className="h-4 w-4" aria-hidden="true" /> : <CalendarDays className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div>
          <p className="font-semibold text-ink">{isAttention ? "Nothing needs attention right now." : "No covered plans are showing yet."}</p>
          <p className="mt-1 leading-6">
            {isAttention
              ? "When a source creates an uncovered pickup, decision, change, or readiness item, it will land here first."
              : "Covered cards move here once the owner is clear and the noisy bits are settled."}
          </p>
        </div>
      </div>
    </div>
  );
}

function CoverageCard({
  card,
  canEditCards,
  childProfiles,
  currentMemberId,
  googleCalendar,
  members,
  isHouseholdAdmin,
  publicPreview,
  saveFlash,
  timezone
}: {
  card: BoardCard;
  canEditCards: boolean;
  childProfiles: ChildSummary[];
  currentMemberId?: string;
  googleCalendar?: GoogleCalendarBoardState;
  members: HouseholdMemberSummary[];
  isHouseholdAdmin: boolean;
  publicPreview: boolean;
  saveFlash?: SaveFlash;
  timezone: string;
}) {
  const cardCanEdit = isHouseholdAdmin || (canEditCards && Boolean(card.sourceInputId));
  const eligibleRequestSlots = card.slots.filter(isCoverageRequestEligible);
  const cardFlash = saveFlash?.cardId === card.id ? saveFlash : undefined;

  return (
    <article
      aria-label={`Coverage card: ${card.title}`}
      id={card.id}
      className="overflow-hidden rounded-lg border border-line bg-white shadow-inset transition hover:border-moss/30"
    >
      <div className="grid gap-0 md:grid-cols-[5.5rem_minmax(0,1fr)]">
        <div
          className={cn(
            "flex items-center gap-2 border-b border-line px-4 py-2.5 md:block md:border-b-0 md:border-r",
            card.coverageState === "covered" && "bg-emerald-50/70",
            card.coverageState === "pending" && "bg-amber-50/70",
            card.coverageState === "needs_review" && "bg-orange-50/80",
            card.coverageState === "needs_coverage" && "bg-red-50/80",
            card.coverageState === "changed" && "bg-sky/80",
            card.coverageState === "due_soon" && "bg-amber-50/70",
            card.coverageState === "overdue" && "bg-red-100/80"
          )}
        >
          <StateBadge state={card.coverageState} label={card.coverageLabel} />
        </div>

        <div className="min-w-0">
          <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(10rem,0.62fr)] xl:grid-cols-[minmax(15rem,1fr)_minmax(10rem,0.55fr)_minmax(13rem,0.75fr)] xl:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-cream text-moss">
                  {cardIcon(card.cardType)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-clay">{card.child}</p>
                  <h3 className="mt-0.5 break-words text-base font-semibold leading-snug text-ink sm:text-lg">{card.title}</h3>
                </div>
              </div>
              <div className="mt-3 grid gap-1.5 text-sm leading-6 text-graphite">
                <p className="flex min-w-0 items-start gap-2">
                  <Clock className="mt-1 h-4 w-4 shrink-0 text-moss" aria-hidden="true" />
                  <span className="min-w-0 break-words">{card.time}</span>
                </p>
                {card.location ? (
                  <p className="flex min-w-0 items-start gap-2">
                    <MapPin className="mt-1 h-4 w-4 shrink-0 text-moss" aria-hidden="true" />
                    <span className="min-w-0 break-words">{card.location}</span>
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-md border border-line bg-cream px-3 py-2">
              <p className="text-xs font-semibold text-graphite">Coverage</p>
              <p className="mt-1 break-words text-sm leading-6 text-ink">{card.owner}</p>
            </div>

            <details className="group rounded-md border border-line bg-cream px-3 py-2 text-sm leading-6 text-graphite">
              <summary className="flex list-none items-start justify-between gap-2 font-semibold text-ink">
                <span className="min-w-0 break-words">Source: {card.sourceSummary}</span>
                <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-graphite transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="mt-3 space-y-2">
                <p className="text-graphite">{card.reviewReason ?? "Manual card source summary."}</p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-graphite">
                    {card.cardType.replace("_", " ")}
                  </span>
                  {card.attentionFlags.map((flag) => (
                    <span key={flag} className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-graphite">
                      {flag.replace("_", " ")}
                    </span>
                  ))}
                  {typeof card.confidence === "number" ? (
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-graphite">
                      Confidence {Math.round(card.confidence * 100)}%
                    </span>
                  ) : null}
                </div>
                {card.sourceText ? (
                  <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-white p-3 text-xs leading-5 text-graphite">
                    {card.sourceText}
                  </pre>
                ) : (
                  <p>Full pasted source text will appear here when a card is created from source intake.</p>
                )}
                {card.sourceInputId && card.sourceText ? (
                  <a
                    href={publicPreview ? "/login" : `/app/sources/${card.sourceInputId}`}
                    className="inline-flex min-h-9 items-center rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-moss/40"
                  >
                    {publicPreview ? "Sign in to view source" : "View source"}
                  </a>
                ) : null}
              </div>
            </details>

            <div className="grid gap-2">
              <CardPrimaryAction
                card={card}
                hasGuidedAsk={isHouseholdAdmin && eligibleRequestSlots.length > 0}
                publicPreview={publicPreview}
              />
              <CardCalendarExportAction
                card={card}
                canUseCalendar={canEditCards && !publicPreview}
                googleCalendar={googleCalendar}
              />
            </div>
          </div>

          <div className="border-t border-line bg-[#fffaf0] px-3 py-3 sm:px-4">
            {cardFlash?.cardSaved ? (
              <InlineSaveNotice
                tone="success"
                title={cardFlash.cardSaved === "updated" ? "Changes saved" : "Card created"}
                text={
                  cardFlash.cardSaved === "recurring_card_created"
                    ? `Created ${cardFlash.cardCount ?? 0} events from this repeat.`
                    : "The board now shows the latest details."
                }
              />
            ) : null}

            {isHouseholdAdmin && eligibleRequestSlots.length > 0 ? (
              <GuidedCoverageAskPanel
                card={card}
                currentMemberId={currentMemberId}
                members={members}
                slots={eligibleRequestSlots}
              />
            ) : null}

            <div className="space-y-3">
              {card.slots.map((slot) => (
                <div key={slot.id} className="rounded-md border border-line bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{slotKindLabel(slot.kind)}</p>
                      <p className="mt-1 break-words text-sm text-graphite">
                        {slot.stateLabel}: {slot.ownerLabel}
                      </p>
                    </div>
                    {publicPreview ? (
                      <a
                        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-moss/20 bg-moss px-3 text-sm font-semibold text-white transition hover:bg-[#244d3c]"
                        href="/login"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {slot.kind === "pickup" ? "Sign in to cover pickup" : "Sign in to cover it"}
                      </a>
                    ) : (
                      <form action={coverSlotAsCurrentMember}>
                        <input type="hidden" name="cardId" value={card.id} />
                        <input type="hidden" name="slotId" value={slot.id} />
                        <button
                          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-moss/20 bg-moss px-3 text-sm font-semibold text-white transition hover:bg-[#244d3c] disabled:bg-sage disabled:text-moss disabled:opacity-70"
                          disabled={slot.state === "accepted" && slot.ownerLabel !== "Needs an owner"}
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                          {slot.kind === "pickup" ? "I'll cover pickup" : "I'll cover it"}
                        </button>
                      </form>
                    )}
                  </div>

                  {isHouseholdAdmin ? (
                    <details className="mt-3 rounded-md border border-line bg-paper p-3">
                      <summary className="flex list-none items-center justify-between gap-2 text-sm font-semibold text-moss">
                        <span>Manage coverage</span>
                        <ChevronDown className="h-4 w-4 text-graphite transition group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        <form action={markSlotAlreadyCovered} className="space-y-2 rounded-md bg-white p-3">
                          <input type="hidden" name="cardId" value={card.id} />
                          <input type="hidden" name="slotId" value={slot.id} />
                          <label className="block text-xs font-semibold text-ink" htmlFor={`owner-${slot.id}`}>
                            Mark already covered
                          </label>
                          <select
                            id={`owner-${slot.id}`}
                            name="ownerMemberId"
                            className={controlClassName}
                            defaultValue=""
                          >
                            <option value="">Someone else</option>
                            {members.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.displayName}
                              </option>
                            ))}
                          </select>
                          <input
                            name="externalOwnerText"
                            placeholder="Grandma, carpool, aftercare"
                            className={controlClassName}
                          />
                          <button className={secondaryButtonClassName}>Save owner</button>
                        </form>

                        <div className="grid gap-2 rounded-md bg-white p-3">
                          <form action={updateSlotKind} className="flex gap-2">
                            <input type="hidden" name="cardId" value={card.id} />
                            <input type="hidden" name="slotId" value={slot.id} />
                            <select
                              aria-label={`Slot kind for ${card.title}`}
                              name="slotKind"
                              defaultValue={slot.kind}
                              className={cn(controlClassName, "min-w-0 flex-1")}
                            >
                              {slotKindOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button className={secondaryButtonClassName}>Update</button>
                          </form>
                          <form action={setSlotState} className="flex gap-2">
                            <input type="hidden" name="cardId" value={card.id} />
                            <input type="hidden" name="slotId" value={slot.id} />
                            <select
                              aria-label={`Slot state for ${card.title}`}
                              name="state"
                              defaultValue={slot.state}
                              className={cn(controlClassName, "min-w-0 flex-1")}
                            >
                              {slotStateOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button className={secondaryButtonClassName}>Set</button>
                          </form>
                        </div>
                      </div>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>

            {card.readinessItems.length > 0 ? (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-semibold text-ink">Readiness</h4>
                {card.readinessItems.map((item) => (
                  <form
                    action={updateReadinessItem}
                    className="grid gap-2 rounded-md border border-line bg-white p-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_10rem_auto]"
                    key={item.id}
                  >
                    <input type="hidden" name="cardId" value={card.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <input
                      aria-label="Readiness item"
                      className={controlClassName}
                      name="label"
                      defaultValue={item.label}
                      disabled={!cardCanEdit}
                    />
                    <select
                      aria-label="Readiness status"
                      className={controlClassName}
                      name="status"
                      defaultValue={item.status}
                      disabled={!cardCanEdit}
                    >
                      {readinessStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Readiness owner"
                      className={controlClassName}
                      name="ownerMemberId"
                      defaultValue={item.ownerMemberId ?? ""}
                      disabled={!cardCanEdit}
                    >
                      <option value="">No owner</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.displayName}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Readiness due date"
                      className={controlClassName}
                      name="dueAt"
                      type="datetime-local"
                      defaultValue={toDateTimeLocal(item.dueAt, timezone)}
                      disabled={!cardCanEdit}
                    />
                    <input type="hidden" name="externalOwnerText" value={item.externalOwnerText ?? ""} />
                    <button className={secondaryButtonClassName} disabled={!cardCanEdit}>
                      Save
                    </button>
                  </form>
                ))}
              </div>
            ) : null}

            {cardCanEdit ? (
              <details className="mt-4 rounded-md border border-line bg-white p-3">
                <summary className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-moss">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add readiness item
                </summary>
                <form
                  action={addReadinessItemToCard}
                  className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]"
                >
                  <input type="hidden" name="cardId" value={card.id} />
                  <input
                    aria-label="New readiness item"
                    className={controlClassName}
                    name="label"
                    placeholder="Bring cleats, sign form, pay fee"
                    required
                  />
                  <input
                    aria-label="New readiness due date"
                    className={controlClassName}
                    name="dueAt"
                    type="datetime-local"
                  />
                  <select
                    aria-label="New readiness owner"
                    className={controlClassName}
                    name="ownerMemberId"
                    defaultValue=""
                  >
                    <option value="">No owner</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                  <button className={secondaryButtonClassName}>Add</button>
                </form>
              </details>
            ) : null}

            {cardCanEdit ? (
              <details className="mt-4 rounded-md border border-line bg-white p-3">
                <summary className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-moss">
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Correct details
                </summary>
                <p className="mt-2 text-xs leading-5 text-graphite">
                  Corrections update the card, not the attached source.
                </p>
                <CardForm
                  action={updateCoverageCard}
                  buttonLabel="Save card"
                  card={card}
                  childProfiles={childProfiles}
                  timezone={timezone}
                />
              </details>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function GuidedCoverageAskPanel({
  card,
  currentMemberId,
  members,
  slots
}: {
  card: BoardCard;
  currentMemberId?: string;
  members: HouseholdMemberSummary[];
  slots: CoverageSlotSummary[];
}) {
  const panelId = `ask-${card.id}`;
  const singleSlot = slots.length === 1 ? slots[0] : null;
  const householdRecipients = currentMemberId ? members.filter((member) => member.id !== currentMemberId) : members;
  const defaultRequestedMemberId = householdRecipients[0]?.id ?? "";
  const hasHouseholdRecipient = householdRecipients.length > 0;
  const notePlaceholder = `Can you cover ${singleSlot ? slotKindLabel(singleSlot.kind).toLowerCase() : "this"}?`;

  return (
    <section
      aria-labelledby={`${panelId}-title`}
      className="mb-3 rounded-lg border border-coral/25 bg-white p-3 shadow-inset"
      id={panelId}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-coral/25 bg-red-50 text-coral">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h4 id={`${panelId}-title`} className="text-base font-semibold text-ink">
            Ask for coverage
          </h4>
          <p className="mt-1 text-sm leading-6 text-graphite">
            Pick the responsibility and send one clear response link. Keep source details attached to the card, not the message.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <form
          action={createCoverageRequest}
          aria-label={`Household coverage request for ${card.title}`}
          className="space-y-3 rounded-md border border-line bg-cream p-3"
        >
          <input type="hidden" name="cardId" value={card.id} />
          <CoverageAskSlotField singleSlot={singleSlot} slots={slots} />
          <label className="block text-sm font-semibold text-ink">
            Ask someone in the household
            <select
              name="requestedMemberId"
              defaultValue={defaultRequestedMemberId}
              className={cn(controlClassName, "mt-2 bg-white")}
              disabled={!hasHouseholdRecipient}
              required
            >
              {hasHouseholdRecipient ? null : <option value="">Add another adult/helper first</option>}
              {householdRecipients.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
          <CoverageDeliveryFields notePlaceholder={notePlaceholder} />
          <button className={primaryButtonClassName} disabled={!hasHouseholdRecipient}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Send or create link
          </button>
        </form>

        <form
          action={createCoverageRequest}
          aria-label={`External coverage request for ${card.title}`}
          className="space-y-3 rounded-md border border-line bg-cream p-3"
        >
          <input type="hidden" name="cardId" value={card.id} />
          <CoverageAskSlotField singleSlot={singleSlot} slots={slots} />
          <label className="block text-sm font-semibold text-ink">
            Ask someone else
            <input
              className={cn(controlClassName, "mt-2 bg-white")}
              name="externalDisplayName"
              placeholder="Grandma, carpool parent, aftercare"
              required
            />
          </label>
          <input
            aria-label="External recipient email"
            className={cn(controlClassName, "bg-white")}
            name="externalEmail"
            placeholder="Email, optional for response link"
            type="email"
          />
          <CoverageDeliveryFields notePlaceholder={notePlaceholder} />
          <button className={primaryButtonClassName}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Send or create link
          </button>
        </form>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-graphite">
        Keep it short. Do not paste raw source text or private family details here. Email requests need an email on the member or external recipient.
      </p>
    </section>
  );
}

function CoverageAskSlotField({
  singleSlot,
  slots
}: {
  singleSlot: CoverageSlotSummary | null;
  slots: CoverageSlotSummary[];
}) {
  if (singleSlot) {
    return (
      <div className="rounded-md border border-line bg-white px-3 py-2 text-sm">
        <p className="text-xs font-semibold text-graphite">Responsibility</p>
        <p className="mt-1 font-semibold text-ink">{slotKindLabel(singleSlot.kind)}</p>
        <p className="mt-1 text-graphite">
          {singleSlot.stateLabel}: {singleSlot.ownerLabel}
        </p>
        <input type="hidden" name="slotId" value={singleSlot.id} />
      </div>
    );
  }

  return (
    <label className="block text-sm font-semibold text-ink">
      Responsibility
      <select name="slotId" defaultValue={slots[0]?.id} className={cn(controlClassName, "mt-2 bg-white")}>
        {slots.map((slot) => (
          <option key={slot.id} value={slot.id}>
            {slotKindLabel(slot.kind)} - {slot.stateLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function CoverageDeliveryFields({ notePlaceholder }: { notePlaceholder: string }) {
  return (
    <>
      <select
        aria-label="Coverage request delivery"
        className={cn(controlClassName, "bg-white")}
        name="channel"
        defaultValue="manual_link"
      >
        <option value="manual_link">Create response link</option>
        <option value="email">Email request</option>
      </select>
      <textarea
        aria-label="Message shown to recipient"
        name="note"
        defaultValue={notePlaceholder}
        className={cn(controlClassName, "min-h-20 resize-y bg-white py-2 leading-6")}
      />
    </>
  );
}

function CardPrimaryAction({
  card,
  hasGuidedAsk,
  publicPreview
}: {
  card: BoardCard;
  hasGuidedAsk: boolean;
  publicPreview: boolean;
}) {
  const label =
    publicPreview
      ? card.coverageState === "covered"
        ? "Sign in to view"
        : "Sign in to ask"
      : card.coverageState === "covered"
      ? "View"
      : card.coverageState === "pending"
        ? "I'll cover it"
        : card.coverageState === "needs_review"
        ? "Ask for coverage"
          : "Ask for coverage";
  const tone = card.coverageState === "covered" ? "covered" : card.coverageState === "pending" ? "pending" : "attention";
  const href = publicPreview ? "/login" : hasGuidedAsk ? `#ask-${card.id}` : `#${card.id}`;

  return (
    <a
      className={cn(
        "inline-flex min-h-10 w-full items-center justify-center rounded-md border px-3 text-sm font-semibold transition",
        tone === "covered" && "border-moss/30 bg-white text-moss hover:bg-sage/60",
        tone === "pending" && "border-amber/50 bg-white text-amber hover:bg-amber/10",
        tone === "attention" && "border-coral/40 bg-white text-coral hover:bg-red-50"
      )}
      href={href}
    >
      {label}
    </a>
  );
}

function CardCalendarExportAction({
  card,
  canUseCalendar,
  googleCalendar
}: {
  card: BoardCard;
  canUseCalendar: boolean;
  googleCalendar?: GoogleCalendarBoardState;
}) {
  if (!canUseCalendar || !card.startsAt || card.allDay || !googleCalendar?.isConfigured) {
    return null;
  }

  const exportState = googleCalendar.exportsByCardId[card.id];
  const isConnected = Boolean(googleCalendar.connection);

  if (!isConnected) {
    return (
      <a
        className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-graphite transition hover:border-moss/40 hover:bg-sage/50 hover:text-ink"
        href={`/api/google-calendar/start?returnTo=${encodeURIComponent(`/app#${card.id}`)}`}
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        Connect Google Calendar
      </a>
    );
  }

  return (
    <div className="grid gap-1">
      <form action={exportCoverageCardToGoogleCalendar}>
        <input type="hidden" name="cardId" value={card.id} />
        <button className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-graphite transition hover:border-moss/40 hover:bg-sage/50 hover:text-ink">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {exportState?.status === "succeeded" ? "Update Google Calendar" : "Add to Google Calendar"}
        </button>
      </form>
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[0.7rem] font-semibold leading-4 text-graphite">
        {exportState?.status === "failed" ? (
          <span className="text-amber">Last export failed</span>
        ) : exportState?.status === "succeeded" ? (
          <span className="text-moss">Already on your calendar</span>
        ) : (
          <span>Connected to Google</span>
        )}
        {exportState?.htmlLink ? (
          <a className="text-moss underline-offset-2 hover:underline" href={exportState.htmlLink}>
            View in Google Calendar
          </a>
        ) : null}
        <form action={disconnectGoogleCalendar}>
          <button className="text-graphite underline-offset-2 hover:text-ink hover:underline">
            Disconnect
          </button>
        </form>
      </div>
    </div>
  );
}

function HouseholdSetup({
  childProfiles,
  members,
  isHouseholdAdmin,
  saveFlash
}: {
  childProfiles: ChildSummary[];
  members: HouseholdMemberSummary[];
  isHouseholdAdmin: boolean;
  saveFlash?: SaveFlash;
}) {
  const setupNotice = setupSaveNotice(saveFlash);
  const childFormOpen = childProfiles.length === 0 && saveFlash?.setup !== "child_added";
  const memberFormOpen =
    members.length < 2 &&
    saveFlash?.setup !== "member_added" &&
    saveFlash?.setup !== "member_invited" &&
    saveFlash?.setup !== "member_added_invite_failed";

  return (
    <section id="household-setup" className="rounded-lg border border-line bg-white p-4 shadow-inset">
      <div className="flex items-start gap-3 text-moss">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-moss/20 bg-sage text-moss">
          <UserPlus className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-ink">Household setup</h2>
          <p className="mt-1 text-sm leading-6 text-graphite">
            Save each child and the adults or helpers who may answer coverage requests.
          </p>
        </div>
      </div>

      {setupNotice ? (
        <InlineSaveNotice tone={setupNotice.tone} title={setupNotice.title} text={setupNotice.text} />
      ) : null}

      <div className="mt-4 space-y-3 text-sm text-graphite">
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-3 py-2">
            <h3 className="font-semibold text-ink">Children saved</h3>
            <span className="rounded-md border border-moss/20 bg-sage px-2 py-1 text-xs font-semibold text-moss">
              {childProfiles.length}
            </span>
          </div>
          <div aria-live="polite" className="divide-y divide-line">
            {childProfiles.length > 0 ? (
              childProfiles.map((child) => (
                <div className="flex items-center justify-between gap-3 bg-cream px-3 py-2" key={child.id}>
                  <p className="min-w-0 break-words">
                    <span className="font-semibold text-ink">{child.displayName}</span>
                    {child.grade ? ` · ${child.grade}` : ""}
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-moss/20 bg-white px-2 py-1 text-xs font-semibold text-moss">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Saved
                  </span>
                </div>
              ))
            ) : (
              <p className="bg-cream px-3 py-3 text-sm leading-6 text-graphite">
                No children saved yet. Add one child below, save, then repeat for each child.
              </p>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-3 py-2">
            <h3 className="font-semibold text-ink">Adults and helpers</h3>
            <span className="rounded-md border border-line bg-cream px-2 py-1 text-xs font-semibold text-graphite">
              {members.length}
            </span>
          </div>
          <div className="divide-y divide-line">
            {members.map((member) => (
              <div className="flex items-start justify-between gap-3 bg-cream px-3 py-2" key={member.id}>
                <div className="min-w-0">
                  <p className="break-words">
                    <span className="font-semibold text-ink">{member.displayName}</span> · {member.role.replace("_", " ")}
                  </p>
                  {isHouseholdAdmin && member.email ? (
                    <p className="mt-0.5 break-words text-xs leading-5 text-graphite">{member.email}</p>
                  ) : null}
                </div>
                {isHouseholdAdmin ? (
                  <div className="grid shrink-0 gap-1 justify-items-end">
                    <span
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-semibold",
                        member.hasUser
                          ? "border-moss/20 bg-sage text-moss"
                          : member.email
                            ? "border-amber/25 bg-[#fff7e8] text-amber"
                            : "border-line bg-white text-graphite"
                      )}
                    >
                      {member.hasUser ? "Joined" : member.email ? "Invite pending" : "No email"}
                    </span>
                    {!member.hasUser && member.email ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        <form action={sendHouseholdMemberInvite}>
                          <input type="hidden" name="memberId" value={member.id} />
                          <button className="rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-moss transition hover:border-moss/40 hover:bg-sage/60">
                            Send invite
                          </button>
                        </form>
                        <a
                          className="rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-moss transition hover:border-moss/40 hover:bg-sage/60"
                          href={`/login?email=${encodeURIComponent(member.email)}`}
                        >
                          Open sign-in
                        </a>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        {isHouseholdAdmin ? (
          <p className="mt-3 rounded-md border border-line bg-cream px-3 py-2 text-xs leading-5 text-graphite">
            Invites use a sign-in link sent to the saved email. If delivery fails, the person can still open the{" "}
            <a href="/login" className="font-semibold text-moss underline underline-offset-2">
              sign-in page
            </a>{" "}
            and enter that exact email to join this household.
          </p>
        ) : null}
      </div>

      {isHouseholdAdmin ? (
        <div className="mt-4 grid gap-4">
          <details className="rounded-lg border border-line bg-cream p-3" open={childFormOpen}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-moss [&::-webkit-details-marker]:hidden">
              <span>{childProfiles.length > 0 ? "Add another child" : "Save a child profile"}</span>
              <ChevronDown className="h-4 w-4 text-graphite" aria-hidden="true" />
            </summary>
            <form action={addChild} className="mt-3 space-y-2" aria-describedby="child-save-help">
              <h3 className="text-sm font-semibold text-ink">Save a child profile</h3>
              <p id="child-save-help" className="text-xs leading-5 text-graphite">
                Enter one child, tap Save child, then repeat if you have another child to add.
              </p>
              <input
                aria-label="Child name"
                required
                name="displayName"
                placeholder="Child name"
                className={controlClassName}
              />
              <input
                aria-label="Age, grade, or group"
                name="grade"
                placeholder="Age, grade, or group"
                className={controlClassName}
              />
              <p className="text-xs leading-5 text-graphite">Optional. Examples: 2 years old, preschool, 3rd grade, U10.</p>
              <button className={secondaryButtonClassName}>Save child</button>
            </form>
          </details>

          <details className="rounded-lg border border-line bg-cream p-3" open={memberFormOpen}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-moss [&::-webkit-details-marker]:hidden">
              <span>{members.length > 1 ? "Add another person" : "Add adult or helper"}</span>
              <ChevronDown className="h-4 w-4 text-graphite" aria-hidden="true" />
            </summary>
            <form action={addHouseholdMember} className="mt-3 space-y-2">
              <h3 className="text-sm font-semibold text-ink">Add adult or helper</h3>
              <p className="text-xs leading-5 text-graphite">
                Save their email and FamTandem sends a sign-in link that joins them to this household.
              </p>
              <input required name="displayName" placeholder="Display name" className={controlClassName} />
              <select name="role" className={controlClassName} defaultValue="helper">
                <option value="helper">Helper</option>
                <option value="parent">Parent</option>
              </select>
              <input name="email" type="email" placeholder="Email" className={controlClassName} />
              <input name="phone" type="tel" placeholder="Phone" className={controlClassName} />
              <button className={secondaryButtonClassName}>Add and send invite</button>
            </form>
          </details>
        </div>
      ) : null}
    </section>
  );
}

function PasteSourceForm({ isHouseholdAdmin }: { isHouseholdAdmin: boolean }) {
  if (!isHouseholdAdmin) return null;

  return (
    <section id="add-logistics" className="rounded-lg border border-line bg-white p-4 shadow-inset">
      <div className="flex items-start gap-3 text-moss">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sage text-moss">
          <Plus className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-ink">Add logistics</h2>
          <p className="mt-1 text-sm leading-6 text-graphite">
            Send the details. We&apos;ll turn them into coverage cards.
          </p>
        </div>
      </div>

      <div className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line">
        <IntakeOption
          href="#paste-logistics-text"
          icon={<ClipboardPaste className="h-4 w-4" />}
          title="Paste text"
          text="Paste an email, note, or message to create cards"
          tone="moss"
        />
        <div className="flex items-center gap-3 bg-cream px-3 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1f5a85] text-white">
            <Mail className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Email forwarding</p>
            <p className="text-xs leading-5 text-graphite">Coming later. For beta, paste the email text here.</p>
          </div>
          <span className="rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-graphite">Later</span>
        </div>
      </div>

      <UploadSourceForm />

      <form action={createPasteSourceInput} className="mt-4 space-y-3">
        <Field label="Source title" name="rawSubject" defaultValue="Pasted logistics" />
        <label className="block text-sm font-semibold text-ink">
          Pasted text
          <textarea
            id="paste-logistics-text"
            name="pastedText"
            required
            rows={7}
            placeholder="Paste a coach email, school note, appointment reminder..."
            className={cn(controlClassName, "mt-2 min-h-36 py-2 leading-6")}
          />
        </label>
        <button className={primaryButtonClassName}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Read source
        </button>
      </form>
      <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-graphite">
        <ShieldCheck className="h-4 w-4 text-moss" aria-hidden="true" />
        Every card keeps the source attached.
      </p>
    </section>
  );
}

function IntakeOption({
  href,
  icon,
  title,
  text,
  tone
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  text: string;
  tone: "moss" | "amber";
}) {
  return (
    <a className="flex w-full items-center gap-3 bg-cream px-3 py-3 text-left transition hover:bg-sage/55" href={href}>
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full text-white",
          tone === "moss" ? "bg-moss" : "bg-amber"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs leading-5 text-graphite">{text}</span>
      </span>
      <ChevronDown className="-rotate-90 h-4 w-4 text-graphite" aria-hidden="true" />
    </a>
  );
}

function NewCardForm({
  childProfiles,
  isHouseholdAdmin,
  saveFlash,
  timezone
}: {
  childProfiles: ChildSummary[];
  isHouseholdAdmin: boolean;
  saveFlash?: SaveFlash;
  timezone: string;
}) {
  if (!isHouseholdAdmin) return null;

  return (
    <section id="new-card" className="rounded-lg border border-line bg-white p-4 shadow-inset">
      <div className="flex items-center gap-2 text-moss">
        <Plus className="h-5 w-5" aria-hidden="true" />
        <h2 className="text-base font-semibold text-ink">Manual card</h2>
      </div>
      {saveFlash?.cardSaved === "manual_card_created" || saveFlash?.cardSaved === "recurring_card_created" ? (
        <p className="mt-3 rounded-md border border-moss/20 bg-sage px-3 py-2 text-xs leading-5 text-moss">
          Need another similar plan? Use this form again to create another card or another short repeat.
        </p>
      ) : null}
      <CardForm
        action={createManualCard}
        buttonLabel="Create card"
        childProfiles={childProfiles}
        saveFlash={saveFlash}
        timezone={timezone}
      />
    </section>
  );
}

function CardForm({
  action,
  buttonLabel,
  childProfiles,
  card,
  saveFlash,
  timezone
}: {
  action: (formData: FormData) => void | Promise<void>;
  buttonLabel: string;
  childProfiles: ChildSummary[];
  card?: BoardCard;
  saveFlash?: SaveFlash;
  timezone: string;
}) {
  return (
    <form action={action} className="mt-4 space-y-3">
      {card ? <input type="hidden" name="cardId" value={card.id} /> : null}
      <CardFields card={card} childProfiles={childProfiles} timezone={timezone} />
      {!card ? (
        <label className="block text-sm font-semibold text-ink">
          Confidence
          <input
            name="confidence"
            type="number"
            min="0"
            max="1"
            step="0.01"
            className={cn(controlClassName, "mt-2")}
          />
        </label>
      ) : null}

      {!card ? <CreateCardFields saveFlash={saveFlash} /> : null}

      <button className={primaryButtonClassName}>{buttonLabel}</button>
    </form>
  );
}

function CreateCardFields({ saveFlash }: { saveFlash?: SaveFlash }) {
  return (
    <>
      <label className="block text-sm font-semibold text-ink">
        Coverage slot
        <select name="slotKind" defaultValue="pickup" className={cn(controlClassName, "mt-2")}>
          {slotKindOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="rounded-lg border border-line bg-cream p-3">
        <div className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-moss" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ink">Repeat</p>
            <p className="mt-1 text-xs leading-5 text-graphite">
              For practices, therapies, lessons, and other repeated logistics. Creates separate cards you can cover one by one.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-3">
          <label className="block text-sm font-semibold text-ink">
            Frequency
            <select name="recurrenceFrequency" defaultValue="none" className={cn(controlClassName, "mt-2")}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-ink">
            Create
            <select name="recurrenceCount" defaultValue="4" className={cn(controlClassName, "mt-2")}>
              <option value="4">Next 4 events</option>
              <option value="8">Next 8 events</option>
            </select>
          </label>
        </div>
        {saveFlash?.cardSaved === "recurring_card_created" ? (
          <p className="mt-3 rounded-md border border-moss/20 bg-sage px-3 py-2 text-xs font-semibold text-moss">
            Created {saveFlash.cardCount ?? 0} repeated events.
          </p>
        ) : null}
      </div>
      <Field label="Readiness item" name="readinessLabel" />
      <Field label="Readiness due" name="readinessDueAt" type="datetime-local" />
    </>
  );
}

function CardFields({
  childProfiles,
  card,
  timezone
}: {
  childProfiles: ChildSummary[];
  card?: BoardCard;
  timezone: string;
}) {
  return (
    <>
      <Field label="Card title" name="title" defaultValue={card?.title} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-ink">
          Type
          <select name="cardType" defaultValue={card?.cardType ?? "event"} className={cn(controlClassName, "mt-2")}>
            <option value="event">Event</option>
            <option value="deadline">Deadline</option>
            <option value="decision">Decision</option>
            <option value="change_standalone">Standalone change</option>
          </select>
        </label>
        <label className="block text-sm font-semibold text-ink">
          {card ? "Children" : "Child"}
          <select
            name={card ? "childIds" : "childId"}
            defaultValue={card ? card.childIds : ""}
            className={cn(controlClassName, "mt-2", card && "min-h-24 py-2")}
            multiple={Boolean(card)}
          >
            {!card ? <option value="">Family</option> : null}
            {childProfiles.map((child) => (
              <option key={child.id} value={child.id}>
                {child.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Field label="Time" name="startsAt" type="datetime-local" defaultValue={toDateTimeLocal(card?.startsAt, timezone)} />
      <Field label="Location" name="location" defaultValue={card?.location ?? ""} />
      {!card ? (
        <>
          <Field label="Source summary" name="sourceSummary" />
          <Field label="Review note" name="reviewReason" />
        </>
      ) : null}
    </>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
  required = false
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        className={cn(controlClassName, "mt-2")}
      />
    </label>
  );
}

function InlineSaveNotice({
  title,
  text,
  tone
}: {
  title: string;
  text: string;
  tone: "success" | "warning";
}) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "mt-4 rounded-lg border px-3 py-2 text-sm leading-6",
        tone === "success"
          ? "border-moss/20 bg-sage text-moss"
          : "border-amber/25 bg-[#fff7e8] text-amber"
      )}
    >
      <p className="flex items-center gap-2 font-semibold">
        {tone === "success" ? (
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        {title}
      </p>
      <p className={cn("mt-0.5 text-xs leading-5", tone === "success" ? "text-moss" : "text-amber")}>
        {text}
      </p>
    </div>
  );
}

function setupSaveNotice(saveFlash?: SaveFlash) {
  const name = saveFlash?.savedName ?? "That person";
  if (saveFlash?.setup === "child_added") {
    return {
      tone: "success" as const,
      title: `${name} saved`,
      text: "The child list is updated. Add another child when you are ready."
    };
  }
  if (saveFlash?.setup === "member_added") {
    return {
      tone: "success" as const,
      title: `${name} added`,
      text: "They are saved in your household. Add an email later if they need to sign in."
    };
  }
  if (saveFlash?.setup === "member_invited") {
    return {
      tone: "success" as const,
      title: `Invite sent to ${name}`,
      text: "When they open the sign-in link from that email, FamTandem will add them to this household."
    };
  }
  if (saveFlash?.setup === "invite_sent") {
    return {
      tone: "success" as const,
      title: `Invite resent to ${name}`,
      text: "They can use the newest sign-in email, or open the sign-in page and enter the same saved email."
    };
  }
  if (saveFlash?.setup === "member_already_joined") {
    return {
      tone: "success" as const,
      title: `${name} already joined`,
      text: "This household member is already connected to a FamTandem sign-in."
    };
  }
  if (saveFlash?.setup === "member_added_invite_failed") {
    return {
      tone: "warning" as const,
      title: `${name} added, invite not sent`,
      text: "The person is saved. Use Send invite again, or ask them to open the sign-in page and enter the same email."
    };
  }
  if (saveFlash?.setup === "invite_failed") {
    return {
      tone: "warning" as const,
      title: "Invite not sent",
      text: "Try Send invite again. The person can also open the sign-in page with the saved email."
    };
  }
  return null;
}

function StateBadge({ state, label }: { state: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold leading-5 md:mt-1 md:w-full md:justify-center md:text-center",
        state === "needs_coverage" && "bg-red-50 text-coral",
        state === "pending" && "bg-amber-50 text-amber",
        state === "covered" && "bg-emerald-50 text-moss",
        state === "changed" && "bg-sky text-ink",
        state === "needs_review" && "bg-orange-50 text-amber",
        state === "due_soon" && "bg-amber-50 text-amber",
        state === "overdue" && "bg-red-100 text-cranberry"
      )}
    >
      {label}
    </span>
  );
}

function StateExamples() {
  return (
    <section className="rounded-lg border border-dashed border-line bg-cream p-4">
      <h2 className="text-sm font-semibold text-ink">State examples</h2>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[0.6875rem] leading-4 text-graphite">
        <div className="rounded-md border border-moss/30 bg-white p-2">
          <Check className="mx-auto h-4 w-4 text-moss" aria-hidden="true" />
          <p className="mt-1 font-semibold text-moss">You&apos;re all set</p>
        </div>
        <div className="rounded-md border border-amber/30 bg-white p-2">
          <Clock className="mx-auto h-4 w-4 animate-pulse text-amber" aria-hidden="true" />
          <p className="mt-1 font-semibold text-amber">Updating info</p>
        </div>
        <div className="rounded-md border border-coral/30 bg-white p-2">
          <CircleAlert className="mx-auto h-4 w-4 text-coral" aria-hidden="true" />
          <p className="mt-1 font-semibold text-coral">Try again</p>
        </div>
      </div>
    </section>
  );
}

function MobileBottomNav() {
  const items = [
    { label: "Today", icon: Home, active: true, href: "#Needs-Attention" },
    { label: "Week", icon: CalendarDays, href: "#This-Week" },
    { label: "Add", icon: Plus, href: "#add-logistics", primary: true },
    { label: "Inbox", icon: Inbox, href: "/app/inbox" },
    { label: "People", icon: UsersRound, href: "#household-setup" }
  ];

  return (
    <nav
      aria-label="Mobile app navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-cream/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-12px_30px_rgb(49_95_75_/_0.08)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <a
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[0.6875rem] font-semibold text-graphite transition hover:bg-sage/70",
                item.active && "text-moss",
                item.primary && "-mt-6"
              )}
              href={item.href}
              key={item.label}
            >
              <span
                className={cn(
                  "grid place-items-center",
                  item.primary
                    ? "h-14 w-14 rounded-full border-4 border-cream bg-moss text-white shadow-soft"
                    : "h-6 w-6 text-current"
                )}
              >
                <Icon className={item.primary ? "h-6 w-6" : "h-5 w-5"} aria-hidden="true" />
              </span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function cardIcon(type: string) {
  if (type === "deadline") return <Inbox className="h-5 w-5" aria-hidden="true" />;
  if (type === "decision") return <MessageCircle className="h-5 w-5" aria-hidden="true" />;
  if (type === "change_standalone") return <CircleAlert className="h-5 w-5" aria-hidden="true" />;
  return <CalendarDays className="h-5 w-5" aria-hidden="true" />;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function toDateTimeLocal(value?: string | null, timezone = "America/Chicago") {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "00";
  const hour = part("hour") === "24" ? "00" : part("hour");

  return `${part("year")}-${part("month")}-${part("day")}T${hour}:${part("minute")}`;
}

function slotKindLabel(kind: CoverageSlotKind) {
  return slotKindOptions.find((option) => option.value === kind)?.label ?? "Coverage";
}

function isCoverageRequestEligible(slot: CoverageSlotSummary) {
  return slot.state === "needs_coverage" || slot.state === "declined";
}

const controlClassName =
  "min-h-10 w-full rounded-md border border-line bg-cream px-3 text-sm text-ink shadow-inset transition placeholder:text-graphite/65 focus:border-moss focus:bg-white";

const primaryButtonClassName =
  "inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-moss px-3 text-sm font-semibold text-white shadow-inset transition hover:bg-[#244d3c] disabled:cursor-not-allowed disabled:bg-moss/50";

const secondaryButtonClassName =
  "min-h-10 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-moss/40 disabled:opacity-50";

const slotKindOptions: { value: CoverageSlotKind; label: string }[] = [
  { value: "dropoff", label: "Drop-off" },
  { value: "pickup", label: "Pickup" },
  { value: "stay_attend", label: "Stay/attend" },
  { value: "bring_prep", label: "Bring/prep" },
  { value: "general_owner", label: "Owner" }
];

const slotStateOptions: { value: CoverageSlotState; label: string }[] = [
  { value: "needs_coverage", label: "Needs coverage" },
  { value: "requested", label: "Requested" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
  { value: "covered_external", label: "Covered outside FamTandem" }
];

const readinessStatusOptions: { value: ReadinessStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "not_needed", label: "Not needed" }
];
