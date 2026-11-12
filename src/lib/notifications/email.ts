import type { UnresolvedLogisticsItem } from "@/lib/notifications/types";

export function buildDailyUnresolvedEmail({
  householdName,
  appUrl,
  items,
  timezone
}: {
  householdName: string;
  appUrl: string;
  items: UnresolvedLogisticsItem[];
  timezone?: string;
}) {
  const topItems = items.slice(0, 5);
  const subject =
    items.length === 1
      ? "FamTandem: 1 thing still needs coverage today"
      : `FamTandem: ${items.length} things still need coverage today`;
  const appLink = `${appUrl.replace(/\/$/, "")}/app`;
  const lines = [
    `Daily coverage check for ${householdName}`,
    "",
    summaryLine(items.length),
    "",
    ...topItems.flatMap((item) => [`- ${formatItemLine(item, timezone)}`]),
    ...(items.length > topItems.length
      ? ["", `And ${items.length - topItems.length} more item${items.length - topItems.length === 1 ? "" : "s"} in FamTandem.`]
      : []),
    "",
    `Open FamTandem: ${appLink}`,
    "",
    "This email summarizes coverage status only. Open FamTandem for source details."
  ];
  const text = lines.join("\n");

  return {
    subject,
    text,
    html: buildHtml(text)
  };
}

export function buildWeeklyCoverageReviewEmail({
  householdName,
  appUrl,
  periodStart,
  periodEnd,
  timezone,
  items
}: {
  householdName: string;
  appUrl: string;
  periodStart: string;
  periodEnd: string;
  timezone: string;
  items: UnresolvedLogisticsItem[];
}) {
  const appLink = `${appUrl.replace(/\/$/, "")}/app`;
  const subject =
    items.length === 1
      ? "FamTandem: 1 uncertain item for the week ahead"
      : `FamTandem: ${items.length} uncertain items for the week ahead`;
  const topItems = items.slice(0, 8);
  const counts = countByKind(items);
  const lines = [
    `Weekly coverage review for ${householdName}`,
    `${formatDateKey(periodStart)} - ${formatDateKey(periodEnd)}`,
    "",
    weeklySummaryLine(items.length),
    `Needs coverage: ${counts.uncovered_slot}. Waiting on response: ${counts.pending_response}. Changed: ${counts.changed_event}. Due soon: ${counts.due_readiness}. Needs review: ${counts.needs_review}.`,
    "",
    ...formatWeeklyItems(topItems, timezone),
    ...(items.length > topItems.length
      ? ["", `And ${items.length - topItems.length} more item${items.length - topItems.length === 1 ? "" : "s"} in FamTandem.`]
      : []),
    "",
    `Open FamTandem: ${appLink}`,
    "",
    "This email summarizes coverage status only. Open FamTandem for source details."
  ];
  const text = lines.join("\n");

  return {
    subject,
    text,
    html: buildHtml(text)
  };
}

function summaryLine(count: number) {
  if (count === 1) return "One logistics item still needs attention.";
  return `${count} logistics items still need attention.`;
}

function weeklySummaryLine(count: number) {
  if (count === 1) return "One logistics item is still uncovered or uncertain for the week ahead.";
  return `${count} logistics items are still uncovered or uncertain for the week ahead.`;
}

function countByKind(items: UnresolvedLogisticsItem[]) {
  return items.reduce(
    (counts, item) => {
      counts[item.kind] += 1;
      return counts;
    },
    {
      uncovered_slot: 0,
      pending_response: 0,
      changed_event: 0,
      due_readiness: 0,
      needs_review: 0
    } satisfies Record<UnresolvedLogisticsItem["kind"], number>
  );
}

function formatWeeklyItems(items: UnresolvedLogisticsItem[], timezone: string) {
  let lastDay = "";
  const lines: string[] = [];
  for (const item of items) {
    const day = formatItemDay(item, timezone);
    if (day !== lastDay) {
      if (lines.length > 0) lines.push("");
      lines.push(day);
      lastDay = day;
    }
    lines.push(`- ${formatItemLine(item, timezone)}`);
  }
  return lines;
}

function formatItemDay(item: UnresolvedLogisticsItem, timezone: string) {
  const value = item.dueAt ?? item.startsAt;
  if (!value) return "Unscheduled";
  return formatZonedDate(value, timezone);
}

function formatItemLine(item: UnresolvedLogisticsItem, timezone?: string) {
  const childText = item.childLabels?.length ? ` (${item.childLabels.join(", ")})` : "";
  const timeText = item.dueAt
    ? ` due ${formatDateTime(item.dueAt, timezone)}`
    : item.startsAt
      ? ` at ${formatDateTime(item.startsAt, timezone)}`
      : "";
  return `${item.statusLabel}: ${item.title}${childText}${timeText}`;
}

function formatDateTime(value: string, timezone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    ...(timezone ? { timeZone: timezone } : {}),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateKey(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function formatZonedDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function buildHtml(text: string) {
  return text
    .split("\n\n")
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
