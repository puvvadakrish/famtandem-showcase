export function safeGoogleCalendarReturnTo(value: string | null) {
  if (!value || /[\r\n\\]/.test(value)) return "/app";
  if (value === "/app" || value.startsWith("/app/") || value.startsWith("/app?") || value.startsWith("/app#")) {
    return value;
  }
  return "/app";
}
