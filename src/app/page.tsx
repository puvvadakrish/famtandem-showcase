import Link from "next/link";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { BoardShell } from "@/components/board-shell";
import type { BoardCard, ChildSummary, HouseholdMemberSummary } from "@/lib/types";

const demoMembers: HouseholdMemberSummary[] = [
  { id: "demo-jamie", displayName: "Jamie", role: "household_admin" },
  { id: "demo-sam", displayName: "Sam", role: "parent" },
  { id: "demo-grandma", displayName: "Grandma", role: "helper" }
];

const demoChildren: ChildSummary[] = [
  { id: "demo-maya", displayName: "Maya", grade: "U10" },
  { id: "demo-luca", displayName: "Luca", grade: "6th" }
];

const demoCards: BoardCard[] = [
  {
    id: "demo-soccer",
    cardType: "event",
    title: "Maya soccer pickup moved",
    child: "Maya",
    childId: "demo-maya",
    childIds: ["demo-maya"],
    time: "Mon, May 19, 3:30 PM",
    startsAt: "2026-05-19T20:30:00.000Z",
    location: "Riverside Fields",
    owner: "Pickup: Needs an owner",
    sourceSummary: "Coach email",
    sourceInputId: null,
    sourceText:
      "Hi families, quick update: Maya soccer practice is moving from 4:30 PM to 3:30 PM today at Riverside Fields. Please make sure someone is set for pickup.",
    coverageState: "needs_coverage",
    coverageLabel: "Needs coverage",
    section: "needs_attention",
    confidence: 0.9,
    reviewReason: "Practice moved, worth checking.",
    attentionFlags: ["needs_coverage", "changed"],
    slots: [
      {
        id: "demo-slot-pickup",
        kind: "pickup",
        state: "needs_coverage",
        stateLabel: "Needs coverage",
        ownerLabel: "Needs an owner",
        ownerMemberId: null,
        externalOwnerText: null
      }
    ],
    readinessItems: []
  },
  {
    id: "demo-early-dismissal",
    cardType: "change_standalone",
    title: "Early dismissal moved up",
    child: "Maya",
    childId: "demo-maya",
    childIds: ["demo-maya"],
    time: "Wed, May 21, 12:20 PM",
    startsAt: "2026-05-21T17:20:00.000Z",
    location: "Lincoln Elementary",
    owner: "Decision: Worth checking",
    sourceSummary: "School email",
    sourceInputId: null,
    sourceText: null,
    coverageState: "changed",
    coverageLabel: "Changed",
    section: "needs_attention",
    confidence: 0.86,
    reviewReason: "Early dismissal time changed from the previous school note.",
    attentionFlags: ["changed"],
    slots: [
      {
        id: "demo-slot-dismissal",
        kind: "general_owner",
        state: "requested",
        stateLabel: "Requested",
        ownerLabel: "Waiting for Sam",
        ownerMemberId: "demo-sam",
        externalOwnerText: null
      }
    ],
    readinessItems: []
  },
  {
    id: "demo-carpool",
    cardType: "event",
    title: "Carpool to practice",
    child: "Maya",
    childId: "demo-maya",
    childIds: ["demo-maya"],
    time: "Thu, May 22, 4:30 PM",
    startsAt: "2026-05-22T21:30:00.000Z",
    location: "Riverside Fields",
    owner: "Pickup: Grandma",
    sourceSummary: "Text message",
    sourceInputId: null,
    sourceText: null,
    coverageState: "covered",
    coverageLabel: "Covered",
    section: "this_week",
    confidence: 0.82,
    reviewReason: null,
    attentionFlags: [],
    slots: [
      {
        id: "demo-slot-covered",
        kind: "pickup",
        state: "covered_external",
        stateLabel: "Covered",
        ownerLabel: "Grandma",
        ownerMemberId: null,
        externalOwnerText: "Grandma"
      }
    ],
    readinessItems: []
  }
];

export default function HomePage() {
  return (
    <>
      <header className="border-b border-line bg-cream/95 px-4 py-2 text-ink">
        <div className="mx-auto flex max-w-[94rem] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-moss">FamTandem preview</p>
            <p className="flex items-center gap-1.5 truncate text-[0.72rem] font-semibold leading-5 text-graphite sm:text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-moss" aria-hidden="true" />
              Public sample. Real data after sign-in.
            </p>
          </div>
          <Link
            aria-label="Sign in to use real household data"
            href="/login"
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-moss px-3 text-sm font-semibold text-white shadow-inset transition hover:bg-[#244d3c]"
          >
            Sign in
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>
      <BoardShell
        canEditCards={false}
        cards={demoCards}
        childProfiles={demoChildren}
        householdName="Rivera family"
        isHouseholdAdmin={false}
        members={demoMembers}
        publicPreview={true}
        timezone="America/Chicago"
      />
      <aside
        aria-label="Demo mode notice"
        className="fixed bottom-24 right-4 hidden rounded-lg border border-line bg-white px-3 py-2 text-sm text-graphite shadow-soft lg:block"
      >
        <LockKeyhole className="mr-2 inline h-4 w-4 text-moss" aria-hidden="true" />
        Demo only. Actions need sign-in.
      </aside>
    </>
  );
}
