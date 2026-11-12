"use client";

import { useEffect, useState } from "react";
import { fallbackTimezone } from "@/lib/timezone";

export function TimezoneField() {
  const [timezone, setTimezone] = useState(fallbackTimezone);

  useEffect(() => {
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (detectedTimezone) {
      setTimezone(detectedTimezone);
    }
  }, []);

  return (
    <div>
      <label className="block text-sm font-medium text-ink" htmlFor="timezone">
        Timezone
      </label>
      <input
        id="timezone"
        name="timezone"
        required
        value={timezone}
        onChange={(event) => setTimezone(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-md border border-line bg-cream px-3 text-base text-ink shadow-inset"
      />
      <p className="mt-2 text-xs leading-5 text-graphite">
        Used for event times and reminder timing. FamTandem detects this from your browser; edit it if needed.
      </p>
    </div>
  );
}
