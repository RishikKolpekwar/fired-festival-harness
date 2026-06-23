// Material handling — Google Calendar (read-only). Surfaces the next 48h so the
// brief can prep you for meetings and shape its length to your day. Never writes.
import { nanoid } from "nanoid";
import { getAccessToken, hasGoogleAuth } from "../google/auth.js";
import type { Signal, Tool } from "../harness/types.js";

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface Event {
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string }[];
}

export const readCalendar: Tool<{ hoursAhead?: number; max?: number }> = {
  name: "read_calendar",
  description:
    "Read upcoming Google Calendar events (read-only). Use to prep for today's meetings (pull context on who you're meeting) and to gauge how busy the day is. Never creates events.",
  parameters: {
    hoursAhead: { type: "number", description: "Look-ahead window in hours (default 48)" },
    max: { type: "number", description: "Max events (default 20)" },
  },
  effect: "read",
  async execute({ hoursAhead = 48, max = 20 }) {
    if (!hasGoogleAuth()) {
      return { ok: false, data: null, error: "Google not connected — run `npm run google-auth`.", signals: [] };
    }
    try {
      const token = await getAccessToken();
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + hoursAhead * 3_600_000).toISOString();
      const url = `${API}?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(
        timeMax,
      )}&singleEvents=true&orderBy=startTime&maxResults=${max}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return { ok: false, data: null, error: `calendar ${res.status}`, signals: [] };
      const data = (await res.json()) as { items?: Event[] };

      const signals: Signal[] = (data.items ?? []).map((e) => {
        const start = e.start?.dateTime ?? e.start?.date ?? new Date().toISOString();
        const who = (e.attendees ?? []).map((a) => a.displayName ?? a.email).filter(Boolean).join(", ");
        return {
          id: nanoid(10),
          source: "calendar",
          title: e.summary ?? "(busy)",
          body: [who ? `with ${who}` : "", e.location ?? "", (e.description ?? "").slice(0, 200)].filter(Boolean).join(" · "),
          url: e.htmlLink,
          ts: start,
          meta: { attendees: who },
        };
      });
      return { ok: true, data: { count: signals.length }, error: null, signals };
    } catch (err) {
      return { ok: false, data: null, error: String(err), signals: [] };
    }
  },
};
