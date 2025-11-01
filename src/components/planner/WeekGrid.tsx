import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";

interface WeekGridProps {
  weeks: number;
  startDate: string;
  blocks: any[];
  recommendations: any[];
  onBlockClick: (block: any) => void;
  workspaceId: string;
  weekplanId: string;
}

export function WeekGrid({
  weeks,
  startDate,
  blocks,
  recommendations,
  onBlockClick,
  workspaceId,
  weekplanId,
}: WeekGridProps) {
  const startDateObj = new Date(startDate);
  const hours = Array.from({ length: 14 }, (_, i) => i + 8); // 8-22h (kompakter)

  const weekDates = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(startDateObj);
    d.setDate(d.getDate() + i * 7);
    return d;
  });

  return (
    <div className="flex-1 overflow-auto bg-background">
          <div className="min-w-max">
            <div className="grid grid-cols-[80px_repeat(var(--weeks),1fr)] gap-0" style={{ "--weeks": weeks } as any}>
              {/* Time Column */}
              <div className="sticky left-0 bg-background z-20 border-r">
                <div className="h-12 border-b" />
                {hours.map((hour) => (
                  <div key={hour} className="h-8 border-b px-2 py-1 text-xs text-muted-foreground">
                    {hour}:00
                  </div>
                ))}
              </div>

              {/* Week Columns */}
              {weekDates.map((weekStart, weekIdx) => (
                <div key={weekIdx} className="border-r">
                  {/* Week Header */}
                  <div className="h-12 border-b px-2 flex items-center justify-between sticky top-0 bg-background z-10">
                    <span className="text-sm font-semibold">Woche {weekIdx + 1}</span>
                    <span className="text-xs text-muted-foreground">
                      {weekStart.toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
                    </span>
                  </div>

                  {/* Day Columns (7 days) */}
                  <div className="grid grid-cols-7">
                    {Array.from({ length: 7 }).map((_, dayIdx) => {
                      const currentDate = new Date(weekStart);
                      currentDate.setDate(currentDate.getDate() + dayIdx);

                      return (
                        <DayColumn
                          key={dayIdx}
                          date={currentDate}
                          hours={hours}
                          blocks={blocks.filter((b) => isSameDay(new Date(b.start_at), currentDate))}
                          recommendations={recommendations}
                          onBlockClick={onBlockClick}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
  );
}

function DayColumn({
  date,
  hours,
  blocks,
  recommendations,
  onBlockClick,
}: {
  date: Date;
  hours: number[];
  blocks: any[];
  recommendations: any[];
  onBlockClick: (block: any) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `day-${date.toISOString()}`,
    data: { date: date.toISOString(), hour: 10 },
  });

  return (
    <div ref={setNodeRef} className="relative border-r min-h-[56rem]">
      {/* Day Header */}
      <div className="sticky top-12 bg-background/95 backdrop-blur p-1 text-center border-b z-10">
        <div className="text-xs font-medium">{date.toLocaleDateString("de-DE", { weekday: "short" })}</div>
        <div className="text-xs text-muted-foreground">{date.getDate()}</div>
      </div>

      {/* Hour Slots */}
      {hours.map((hour) => (
        <HourSlot key={hour} date={date} hour={hour} />
      ))}

      {/* Schedule Blocks */}
      {blocks.map((block) => (
        <ScheduleBlock key={block.id} block={block} onClick={() => onBlockClick(block)} />
      ))}
    </div>
  );
}

function HourSlot({ date, hour }: { date: Date; hour: number }) {
  const slotDate = new Date(date);
  slotDate.setHours(hour, 0, 0, 0);

  const { setNodeRef } = useDroppable({
    id: `slot-${slotDate.toISOString()}`,
    data: { date: date.toISOString(), hour },
  });

  return <div ref={setNodeRef} className="h-8 border-b hover:bg-accent/10 transition-colors" />;
}

function ScheduleBlock({ block, onClick }: { block: any; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: block.id,
    data: { block },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    top: `${getTimePosition(block.start_at)}rem`,
    height: `${getTimeDuration(block.start_at, block.end_at)}rem`,
  };

  const statusColors: any = {
    draft: "bg-slate-500",
    scheduled: "bg-blue-500",
    approved: "bg-green-500",
    posted: "bg-purple-500",
    failed: "bg-red-500",
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`absolute left-1 right-1 ${
        statusColors[block.status] || "bg-primary"
      } text-primary-foreground rounded-md p-2 cursor-move hover:ring-2 hover:ring-primary shadow-md`}
      style={style}
      onClick={onClick}
    >
      <div className="text-xs font-semibold truncate">
        {block.title_override || block.content_items?.title || "Untitled"}
      </div>
      <div className="text-xs opacity-75 truncate">{block.platform}</div>
      {block.status === "approved" && (
        <Badge className="absolute top-1 right-1 text-xs" variant="secondary">
          ✓
        </Badge>
      )}
    </div>
  );
}

function getTimePosition(isoTime: string): number {
  const date = new Date(isoTime);
  const hours = date.getHours() - 8; // Offset from 8am
  const minutes = date.getMinutes();
  return hours * 2 + minutes / 30 + 3; // 2rem per hour (kompakter), 30min slots, +3 for header
}

function getTimeDuration(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms / 1000 / 60 / 30; // Convert to 30min slots in rem (kompakter)
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.toDateString() === d2.toDateString();
}
