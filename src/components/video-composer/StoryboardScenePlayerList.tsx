/**
 * StoryboardScenePlayerList — Stage 18: replaces the old vertical filmstrip.
 *
 * Each scene is rendered as a `SceneInlinePlayer` with an inline "Generieren"
 * CTA so the user never has to leave the Storyboard tab. Drag-and-drop
 * reordering is preserved via @dnd-kit.
 */
import { Plus, GripVertical } from 'lucide-react';
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
import type { ComposerScene, TransitionStyle } from '@/types/video-composer';
import SceneInlinePlayer from './SceneInlinePlayer';
import { TransitionHandle } from './TransitionHandle';

interface Props {
  scenes: ComposerScene[];
  selectedSceneId?: string;
  generatingMap: Record<string, boolean>;
  onSelect: (sceneId: string) => void;
  onReorder: (scenes: ComposerScene[]) => void;
  onAddScene: () => void;
  onGenerate: (scene: ComposerScene) => void;
  onUpdateSceneTransition?: (
    sceneId: string,
    transitionType: TransitionStyle,
    transitionDuration: number,
  ) => void;
  className?: string;
}

function SortablePlayer({
  scene,
  index,
  isActive,
  isGenerating,
  onSelect,
  onGenerate,
}: {
  scene: ComposerScene;
  index: number;
  isActive: boolean;
  isGenerating: boolean;
  onSelect: () => void;
  onGenerate: () => void;
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
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background:
          'linear-gradient(180deg, hsla(225,32%,12%,0.55) 0%, hsla(228,38%,6%,0.35) 100%)',
        boxShadow: isActive
          ? 'inset 0 1px 0 hsla(43,90%,82%,0.28), inset 0 0 0 1px hsla(43,90%,68%,0.32), 0 0 0 1px hsla(43,90%,68%,0.42), 0 16px 40px -18px hsla(43,90%,68%,0.45)'
          : 'inset 0 1px 0 hsla(43,90%,82%,0.16), inset 0 0 0 1px hsla(43,90%,68%,0.16), 0 0 0 1px hsla(43,90%,68%,0.18)',
      }}
      className="relative group rounded-xl overflow-hidden transition-shadow"
    >
      <button
        type="button"
        aria-label="Szene verschieben"
        className="absolute -left-1 top-2 z-30 h-7 w-5 flex items-center justify-center rounded-md bg-background/70 backdrop-blur border border-border/40 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground cursor-grab active:cursor-grabbing touch-none transition-opacity"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <SceneInlinePlayer
        scene={scene}
        index={index}
        isActive={isActive}
        isGenerating={isGenerating}
        onSelect={onSelect}
        onGenerate={onGenerate}
      />
    </div>
  );
}


export default function StoryboardScenePlayerList({
  scenes,
  selectedSceneId,
  generatingMap,
  onSelect,
  onReorder,
  onAddScene,
  onGenerate,
  onUpdateSceneTransition,
  className,
}: Props) {
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
        <span className="text-[10px] text-muted-foreground/80">Klick = bearbeiten</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {scenes.map((scene, index) => {
              const isLast = index === scenes.length - 1;
              const transitionType = (scene.transitionType ?? 'none') as TransitionStyle;
              const transitionDuration = scene.transitionDuration ?? 0.5;
              return (
                <div key={scene.id}>
                  <SortablePlayer
                    scene={scene}
                    index={index}
                    isActive={scene.id === selectedSceneId}
                    isGenerating={!!generatingMap[scene.id]}
                    onSelect={() => onSelect(scene.id)}
                    onGenerate={() => onGenerate(scene)}
                  />
                  {!isLast && onUpdateSceneTransition && (
                    <TransitionHandle
                      value={transitionType}
                      duration={transitionDuration}
                      onChange={(type, duration) =>
                        onUpdateSceneTransition(scene.id, type, duration)
                      }
                    />
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
