import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SortableSceneItemProps {
  id: string;
  children: ReactNode;
  /** Optional badge shown above the drag handle (e.g. "#1") */
  badge?: ReactNode;
  className?: string;
}

/**
 * Wraps a scene card in a sortable container with a visible drag handle.
 * Only the handle starts dragging — clicks on buttons/inputs in the card
 * still work normally.
 */
export function SortableSceneItem({ id, children, badge, className }: SortableSceneItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-stretch gap-2',
        isDragging && 'shadow-glow scale-[1.02]',
        className
      )}
    >
      {/* Drag handle column */}
      <div className="flex flex-col items-center justify-center gap-1 py-1 shrink-0">
        {badge}
        <button
          type="button"
          aria-label="Szene per Drag & Drop verschieben"
          className="flex h-8 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      {/* Card content */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
