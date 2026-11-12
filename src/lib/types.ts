export type CardType = "event" | "deadline" | "decision" | "change_standalone";

export type AttentionFlag =
  | "needs_coverage"
  | "pending"
  | "changed"
  | "needs_review"
  | "due_soon"
  | "overdue";

export type CoverageSlotState =
  | "needs_coverage"
  | "requested"
  | "accepted"
  | "declined"
  | "cancelled"
  | "covered_external";

export type CoverageSlotKind =
  | "dropoff"
  | "pickup"
  | "stay_attend"
  | "bring_prep"
  | "general_owner";

export type DerivedCoverageState =
  | "covered"
  | "needs_coverage"
  | "pending"
  | "changed"
  | "needs_review"
  | "due_soon"
  | "overdue";

export type ReadinessStatus = "open" | "done" | "not_needed";

export type SourceInputStatus =
  | "manual"
  | "pending"
  | "processing"
  | "processed"
  | "needs_review"
  | "failed";

export type BoardSection = "needs_attention" | "this_week";

export type CoverageCardInput = {
  confidence?: number | null;
  reviewReason?: string | null;
  hasUnconfirmedChange?: boolean;
  slots: { state: CoverageSlotState }[];
  readinessItems: { status: ReadinessStatus; dueAt?: string | Date | null }[];
  now?: Date;
};

export type CoverageCardSummary = {
  id: string;
  cardType?: CardType;
  title: string;
  child: string;
  time: string;
  owner: string;
  sourceSummary: string;
  coverageState: DerivedCoverageState;
  coverageLabel: string;
  section: BoardSection;
};

export type HouseholdMemberSummary = {
  id: string;
  displayName: string;
  role: "parent" | "helper" | "household_admin";
  email?: string | null;
  hasUser?: boolean;
};

export type ChildSummary = {
  id: string;
  displayName: string;
  grade: string | null;
};

export type CoverageSlotSummary = {
  id: string;
  kind: CoverageSlotKind;
  state: CoverageSlotState;
  stateLabel: string;
  ownerLabel: string;
  ownerMemberId: string | null;
  externalOwnerText: string | null;
};

export type ReadinessItemSummary = {
  id: string;
  label: string;
  status: ReadinessStatus;
  dueAt: string | null;
  ownerLabel: string;
  ownerMemberId: string | null;
  externalOwnerText: string | null;
};

export type BoardCard = CoverageCardSummary & {
  cardType: CardType;
  startsAt: string | null;
  endsAt?: string | null;
  allDay?: boolean;
  location: string | null;
  sourceInputId: string | null;
  sourceText: string | null;
  confidence: number | null;
  reviewReason: string | null;
  attentionFlags: AttentionFlag[];
  slots: CoverageSlotSummary[];
  readinessItems: ReadinessItemSummary[];
  childId: string | null;
  childIds: string[];
};
