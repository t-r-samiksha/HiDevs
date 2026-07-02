import MeetingCard from "./MeetingCard";

type Meeting = { id: string; title: string; date: string; source_type: string | null };

/** Renders a list of meeting cards with their extracted-item counts. */
export default function MeetingHistoryList({
  meetings,
  counts,
}: {
  meetings: Meeting[];
  counts: Map<string, number>;
}) {
  return (
    <div className="space-y-3">
      {meetings.map((m) => (
        <MeetingCard
          key={m.id}
          id={m.id}
          title={m.title}
          date={m.date}
          sourceType={m.source_type}
          itemCount={counts.get(m.id) ?? 0}
        />
      ))}
    </div>
  );
}
