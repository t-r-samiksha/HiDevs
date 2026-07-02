import type { EventProps } from "react-big-calendar";
import type { CalendarEvent } from "./CalendarGrid";

/** Custom event renderer — rooms show a camera, deadlines show the title. */
export default function CalendarEventChip({ event }: EventProps<CalendarEvent>) {
  return (
    <span className="flex items-center gap-1 truncate">
      {event.kind === "room" ? "🎥" : ""}
      <span className="truncate">{event.title}</span>
    </span>
  );
}
