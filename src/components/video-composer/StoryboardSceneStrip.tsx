/**
 * StoryboardSceneStrip — vertical (desktop) / horizontal (mobile) cinematic
 * filmstrip that lists every scene as a glanceable thumbnail tile.
 *
 * Owns:
 *   - DnD reorder via @dnd-kit (delegated to parent's onReorder callback)
 *   - Click-to-select → emits onSelect(sceneId)
 *   - Continuity hint chip between consecutive scenes
 *   - Add-Scene button at the end
 *
 * Does NOT own:
 *   - Scene editing → that's the StudioPane on the right
 *   - Render/Delete actions → those live inside SceneCard inside StudioPane
 */
import { Plus, ArrowDown, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ComposerScene, ComposerCharacter } from '@/types/video-composer';
import SceneStripTile from './SceneStripTile';

interface StoryboardSceneStripProps {
  scenes: ComposerScene[];
  selectedSceneId?: string;
  characters?: ComposerCharacter[];
  onSelect: (sceneId: string) => void;
  onReorder: (next: ComposerScene[]) => void;
  onAddScene: () => void;
  className?: string;
}

function SortableTile({
  scene,
  index,
  isActive,
  characters,
  onSelect,
}: {
  scene: ComposerScene;
  index: number;
  isActive: boolean;
  characters?: ComposerCharacter[];
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* Drag handle (top-right corner, only visible on hover) */}
      <button
        type="button"
        aria-label="Szene verschieben"
        className="absolute -left-2 top-2 z-10 h-7 w-5 flex items-center justify-center rounded-md bg-background/70 backdrop-blur border border-border/40 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground cursor-grab active:cursor-grabbing touch-none transition-opacity"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <SceneStripTile
        scene={scene}
        index={index}
        isActive={isActive}
        characters={characters}
        onSelect={onSelect}
      />
    </div>
  );
}

export function StoryboardSceneStrip({
  scenes,
  selectedSceneId,
  characters,
  onSelect,
  onReorder,
  onAddScene,
  className,
}: StoryboardSceneStripProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    const newIndex = scenes.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(scenes, oldIndex, newIndex).map((s, i) => ({ ...s, orderIndex: i }));
    onReorder(next);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
          Szenen · {scenes.length}
        </span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2.5">
            {scenes.map((scene, index) => {
              const isActive = scene.id === selectedSceneId;
              return (
                <div key={scene.id}>
                  <SortableTile
                    scene={scene}
                    index={index}
                    isActive={isActive}
                    characters={characters}
                    onSelect={() => onSelect(scene.id)}
                  />
                  {index < scenes.length - 1 && (
                    <div className="flex items-center justify-center py-1.5">
                      <ArrowDown className="h-3 w-3 text-primary/30" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <Button
        size="sm"
        variant="outline"
        onClick={onAddScene}
        className="w-full gap-1.5 text-xs border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5"
      >
        <Plus className="h-3.5 w-3.5" /> Szene hinzufügen
      </Button>
    </div>
  );
}

export default StoryboardSceneStrip;
