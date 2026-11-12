import { normalizeTimezone } from "@/lib/timezone";

export function formatCoverageRequestDateTime(value: string, timezone: string | null | undefined) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: normalizeTimezone(timezone)
    }).format(date);
  } catch {
    return value;
  }
}
