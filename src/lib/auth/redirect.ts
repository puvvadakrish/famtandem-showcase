export function safeAuthRedirectPath(value: string | null) {
  if (!value) {
    return "/app";
  }

  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return "/app";
  }

  return value;
}
