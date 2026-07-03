"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, dateFnsLocalizer, Views, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import CalendarEventChip from "./CalendarEventChip";

export type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  kind: "deadline" | "room";
  status?: string;
  href: string;
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: enUS }),
  getDay,
  locales: { "en-US": enUS },
});

/** Colors an event by kind/status. */
function eventStyle(event: CalendarEvent) {
  let bg = "#2563eb"; // room = blue
  if (event.kind === "deadline") {
    bg =
      event.status === "blocked"
        ? "#dc2626" // red
        : event.status === "at_risk"
          ? "#d97706" // amber
          : event.status === "done"
            ? "#16a34a" // green
            : "#475569"; // slate
  }
  return { style: { backgroundColor: bg, border: "none", borderRadius: 6, fontSize: 12 } };
}

export default function CalendarGrid({ events }: { events: CalendarEvent[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>(
    typeof window !== "undefined" && window.innerWidth < 768 ? Views.WEEK : Views.MONTH
  );
  const [date, setDate] = useState<Date>(new Date());

  const { defaultDate } = useMemo(() => ({ defaultDate: new Date() }), []);

  return (
    <div className="rbc-dark rounded-2xl border border-slate-800 bg-slate-900 p-3" style={{ height: "72vh" }}>
      <Calendar
        localizer={localizer}
        events={events}
        defaultDate={defaultDate}
        date={date}
        onNavigate={(d) => setDate(d)}
        view={view}
        onView={(v) => setView(v)}
        views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
        startAccessor="start"
        endAccessor="end"
        popup
        components={{ event: CalendarEventChip }}
        eventPropGetter={eventStyle}
        onSelectEvent={(e) => router.push((e as CalendarEvent).href)}
        style={{ height: "100%" }}
      />
    </div>
  );
}
