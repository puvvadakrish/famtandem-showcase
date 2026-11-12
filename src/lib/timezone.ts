export const fallbackTimezone = "America/Chicago";

export function normalizeTimezone(value: FormDataEntryValue | string | null | undefined) {
  const timezone = String(value ?? "").trim() || fallbackTimezone;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return fallbackTimezone;
  }
}
