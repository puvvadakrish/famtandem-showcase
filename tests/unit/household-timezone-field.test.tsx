import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimezoneField } from "@/app/household/new/timezone-field";

describe("TimezoneField", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the browser timezone when available and keeps the field editable", async () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "America/Los_Angeles" })
    } as Intl.DateTimeFormat);

    render(<TimezoneField />);

    const timezone = screen.getByLabelText("Timezone");
    await waitFor(() => expect(timezone).toHaveValue("America/Los_Angeles"));

    fireEvent.change(timezone, { target: { value: "America/New_York" } });
    expect(timezone).toHaveValue("America/New_York");
    expect(screen.getByText(/Used for event times and reminder timing/)).toBeInTheDocument();
  });
});
