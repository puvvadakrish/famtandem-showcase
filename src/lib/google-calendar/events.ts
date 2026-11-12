export type GoogleCalendarCardEventInput = {
  appUrl: string;
  cardId: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
  timezone: string;
  location?: string | null;
  child?: string | null;
  owner: string;
  sourceSummary?: string | null;
};

export type GoogleCalendarEventPayload = {
  id?: string;
  summary: string;
  location?: string;
  description: string;
  start: { dateTime: string; timeZone: string } | { date: string };
  end: { dateTime: string; timeZone: string } | { date: string };
};

type FetchLike = typeof fetch;

export function buildGoogleCalendarEventPayload(input: GoogleCalendarCardEventInput): GoogleCalendarEventPayload {
  const start = new Date(input.startsAt);
  const explicitEnd = input.endsAt ? new Date(input.endsAt) : null;
  const end = explicitEnd && explicitEnd.getTime() > start.getTime()
    ? explicitEnd
    : new Date(start.getTime() + 60 * 60 * 1000);
  const allDayEnd = explicitEnd && explicitEnd.getTime() > start.getTime()
    ? explicitEnd
    : new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const appBaseUrl = input.appUrl.replace(/\/$/, "");
  const descriptionLines = [
    "FamTandem coverage card",
    "",
    `Coverage: ${input.owner}`,
    input.child ? `For: ${input.child}` : null,
    input.sourceSummary ? `Source summary: ${input.sourceSummary}` : null,
    "",
    `Open in FamTandem: ${appBaseUrl}/app#${input.cardId}`
  ].filter(Boolean);

  return {
    summary: input.title,
    location: input.location ?? undefined,
    description: descriptionLines.join("\n"),
    start: input.allDay
      ? { date: isoDate(start, input.timezone) }
      : { dateTime: start.toISOString(), timeZone: input.timezone },
    end: input.allDay
      ? { date: isoDate(allDayEnd, input.timezone) }
      : { dateTime: end.toISOString(), timeZone: input.timezone }
  };
}

export async function createGoogleCalendarEvent({
  accessToken,
  eventId,
  payload,
  fetchImpl = fetch
}: {
  accessToken: string;
  eventId?: string | null;
  payload: GoogleCalendarEventPayload;
  fetchImpl?: FetchLike;
}) {
  const body = eventId ? { ...payload, id: eventId } : payload;
  const response = await fetchImpl("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return parseCalendarEventResponse(response, "Google Calendar export failed.");
}

function isoDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function updateGoogleCalendarEvent({
  accessToken,
  eventId,
  payload,
  fetchImpl = fetch
}: {
  accessToken: string;
  eventId: string;
  payload: GoogleCalendarEventPayload;
  fetchImpl?: FetchLike;
}) {
  const response = await fetchImpl(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  return parseCalendarEventResponse(response, "Google Calendar update failed.");
}

async function parseCalendarEventResponse(response: Response, fallbackMessage: string) {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = new Error(`${fallbackMessage} (${response.status})`);
    if (response.status === 404) {
      error.name = "GoogleCalendarEventNotFoundError";
    }
    if (response.status === 409) {
      error.name = "GoogleCalendarEventConflictError";
    }
    throw error;
  }

  const eventId = typeof body?.id === "string" ? body.id : null;
  const htmlLink = typeof body?.htmlLink === "string" ? body.htmlLink : null;
  if (!eventId) {
    throw new Error(fallbackMessage);
  }

  return { eventId, htmlLink };
}
