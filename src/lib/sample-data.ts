import type { CoverageCardSummary } from "@/lib/types";

export const sampleCards: CoverageCardSummary[] = [
  {
    id: "sample-1",
    title: "Soccer pickup moved to north field",
    child: "Maya",
    time: "Today, 5:30 PM",
    owner: "Pickup still needs an owner",
    sourceSummary: "Coach email, confidence high",
    coverageState: "needs_coverage",
    coverageLabel: "Needs coverage",
    section: "needs_attention"
  },
  {
    id: "sample-2",
    title: "Permission slip due",
    child: "Leo",
    time: "Tomorrow morning",
    owner: "Decision still open",
    sourceSummary: "School newsletter, confidence medium",
    coverageState: "pending",
    coverageLabel: "Pending",
    section: "needs_attention"
  },
  {
    id: "sample-3",
    title: "Piano lesson",
    child: "Maya",
    time: "Thursday, 4:00 PM",
    owner: "Drop-off: Krish",
    sourceSummary: "Recurring routine",
    coverageState: "covered",
    coverageLabel: "Covered",
    section: "this_week"
  }
];
