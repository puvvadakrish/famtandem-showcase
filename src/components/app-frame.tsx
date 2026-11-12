import type { ReactNode } from "react";

export function AppFrame({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-paper text-ink">{children}</div>;
}
