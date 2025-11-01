import { DndContext, DragOverlay, useDraggable, useDroppable, DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface WeekGridProps {
  weeks: number;
  startDate: string;
  blocks: any[];
  recommendations: any[];
  onBlockDrop: (blockData: any) => void;
  onBlockClick: (block: any) => void;
  workspaceId: string;
  weekplanId: string;
}

export function WeekGrid({
  weeks,
  startDate,
  blocks,
  recommendations,
  onBlockDrop,
  onBlockClick,
  workspaceId,
  weekplanId,
}: WeekGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const startDateObj = new Date(startDate);
  const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 6-22h

  const weekDates = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(startDateObj);
    d.setDate(d.getDate() + i * 7);
    return d;
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const dropData = over.data.current as any;
    const dragData = active.data.current as any;

    if (dropData?.date && dragData?.content) {
      // Creating new block from content item
      const dropDate = new Date(dropData.date);
      dropDate.setHours(dropData.hour || 10, 0, 0, 0);

      const duration = dragData.content.duration_sec || 3600; // Default 1 hour
      const endDate = new Date(dropDate.getTime() + duration * 1000);

      const blockData = {
        weekplan_id: weekplanId,
        content_id: dragData.content.id,
        platform: dragData.content.targets?.[0] || "Instagram",
        start_at: dropDate.toISOString(),
        end_at: endDate.toISOString(),
        status: "draft",
      };

      onBlockDrop(blockData);
    } else if (dropData?.date && dragData?.block) {
      // Moving existing block
      const dropDate = new Date(dropData.date);
      dropDate.setHours(dropData.hour || dragData.block.start_at.split("T")[1].split(":")[0], 0, 0, 0);

      const duration = new Date(dragData.block.end_at).getTime() - new Date(dragData.block.start_at).getTime();
      const endDate = new Date(dropDate.getTime() + duration);

      onBlockDrop({
        ...dragData.block,
        start_at: dropDate.toISOString(),
        end_at: endDate.toISOString(),
      });
    }
  };

  return (
    <DndContext onDragStart={(e) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-auto bg-background">
        <div className="min-w-max">
          <div className="grid grid-cols-[80px_repeat(var(--weeks),1fr)] gap-0" style={{ "--weeks": weeks } as any}>
            {/* Time Column */}
            <div className="sticky left-0 bg-background z-20 border-r">
              <div className="h-12 border-b" />
              {hours.map((hour) => (
                <div key={hour} className="h-16 border-b px-2 py-1 text-xs text-muted-foreground">
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

      <DragOverlay>
        {activeId ? (
          <Card className="p-2 bg-primary text-primary-foreground opacity-80">
            <div className="text-xs font-semibold">Moving...</div>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
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
    <div ref={setNodeRef} className="relative border-r min-h-[64rem]">
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

  return <div ref={setNodeRef} className="h-16 border-b hover:bg-accent/5 transition-colors" />;
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
  const hours = date.getHours() - 6; // Offset from 6am
  const minutes = date.getMinutes();
  return hours * 4 + minutes / 15 + 3; // 4rem per hour, 15min slots, +3 for header
}

function getTimeDuration(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms / 1000 / 60 / 15; // Convert to 15min slots in rem
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.toDateString() === d2.toDateString();
}
