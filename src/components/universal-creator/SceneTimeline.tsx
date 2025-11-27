import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, Video, Image, Palette } from 'lucide-react';
import type { Scene, SceneBackground } from '@/types/scene';

interface SceneTimelineProps {
  scenes: Scene[];
  onScenesChange: (scenes: Scene[]) => void;
  onAddScene: () => void;
}

function SortableScene({
  scene,
  onUpdate,
  onDelete,
}: {
  scene: Scene;
  onUpdate: (id: string, updates: Partial<Scene>) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getBackgroundIcon = (background: SceneBackground) => {
    switch (background.type) {
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'color':
      case 'gradient':
        return <Palette className="h-4 w-4" />;
      default:
        return <Palette className="h-4 w-4" />;
    }
  };

  const getBackgroundPreview = (background: SceneBackground) => {
    switch (background.type) {
      case 'video':
        return (
          <div className="relative w-full h-20 bg-muted rounded overflow-hidden">
            <video
              src={background.videoUrl}
              className="w-full h-full object-cover"
              muted
            />
          </div>
        );
      case 'image':
        return (
          <div className="relative w-full h-20 bg-muted rounded overflow-hidden">
            <img
              src={background.imageUrl}
              alt="Background"
              className="w-full h-full object-cover"
            />
          </div>
        );
      case 'gradient':
        return (
          <div
            className="w-full h-20 rounded"
            style={{
              background: `linear-gradient(135deg, ${background.gradientColors?.[0] || '#000'}, ${background.gradientColors?.[1] || '#333'})`,
            }}
          />
        );
      case 'color':
        return (
          <div
            className="w-full h-20 rounded"
            style={{ backgroundColor: background.color || '#000' }}
          />
        );
      default:
        return <div className="w-full h-20 bg-muted rounded" />;
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-card border rounded-lg p-4 mb-3">
      <div className="flex items-start gap-3">
        <button
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </button>

        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getBackgroundIcon(scene.background)}
              <div className="font-medium">Scene {scene.order + 1}</div>
              <div className="text-sm text-muted-foreground capitalize">
                {scene.background.type}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onDelete(scene.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Background Preview */}
          {getBackgroundPreview(scene.background)}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Dauer (Sekunden)</Label>
              <Slider
                value={[scene.duration]}
                onValueChange={([value]) => onUpdate(scene.id, { duration: value })}
                min={1}
                max={30}
                step={0.5}
                className="w-full"
              />
              <div className="text-xs text-muted-foreground text-right">{scene.duration}s</div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Übergang</Label>
              <Select
                value={scene.transition.type}
                onValueChange={(value) =>
                  onUpdate(scene.id, {
                    transition: { ...scene.transition, type: value as Scene['transition']['type'] },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Übergang</SelectItem>
                  <SelectItem value="fade">Fade</SelectItem>
                  <SelectItem value="crossfade">Crossfade</SelectItem>
                  <SelectItem value="slide">Slide</SelectItem>
                  <SelectItem value="zoom">Zoom</SelectItem>
                  <SelectItem value="wipe">Wipe</SelectItem>
                  <SelectItem value="blur">Blur</SelectItem>
                  <SelectItem value="push">Push</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Background Animation</Label>
            <Select
              value={scene.backgroundAnimation?.type || 'none'}
              onValueChange={(value) =>
                onUpdate(scene.id, {
                  backgroundAnimation: {
                    type: value as Scene['backgroundAnimation']['type'],
                    intensity: scene.backgroundAnimation?.intensity || 1.2,
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine Animation</SelectItem>
                <SelectItem value="zoomIn">Zoom In (Ken Burns)</SelectItem>
                <SelectItem value="panLeft">Pan Links</SelectItem>
                <SelectItem value="panRight">Pan Rechts</SelectItem>
                <SelectItem value="panUp">Pan Hoch</SelectItem>
                <SelectItem value="panDown">Pan Runter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Visual Timeline Bar */}
          <div className="relative h-8 bg-muted rounded overflow-hidden">
            <div
              className="absolute inset-0 bg-primary/20 border-l-2 border-primary"
              style={{ width: `${(scene.duration / 30) * 100}%` }}
            >
              <div className="h-full flex items-center px-2 text-xs font-medium">
                {scene.duration}s
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const SceneTimeline = ({ scenes, onScenesChange, onAddScene }: SceneTimelineProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = scenes.findIndex((s) => s.id === active.id);
      const newIndex = scenes.findIndex((s) => s.id === over.id);
      const reordered = arrayMove(scenes, oldIndex, newIndex);
      // Update order property
      const withUpdatedOrder = reordered.map((scene, index) => ({ ...scene, order: index }));
      onScenesChange(withUpdatedOrder);
    }
  };

  const handleUpdateScene = (id: string, updates: Partial<Scene>) => {
    onScenesChange(scenes.map((scene) => (scene.id === id ? { ...scene, ...updates } : scene)));
  };

  const handleDeleteScene = (id: string) => {
    const filtered = scenes.filter((scene) => scene.id !== id);
    // Reorder remaining scenes
    const reordered = filtered.map((scene, index) => ({ ...scene, order: index }));
    onScenesChange(reordered);
  };

  const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Video-Szenen Timeline</CardTitle>
        <CardDescription>
          Erstelle Multi-Scene Videos mit individuellen Backgrounds und Übergängen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total Duration Display */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">Gesamtdauer</span>
          <span className="text-lg font-bold">{totalDuration.toFixed(1)}s</span>
        </div>

        {/* Timeline Visual Overview */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Timeline-Übersicht</Label>
          <div className="h-12 bg-muted rounded-lg overflow-hidden flex">
            {scenes.map((scene) => (
              <div
                key={scene.id}
                className="h-full border-r border-background flex items-center justify-center text-xs font-medium bg-primary/10 hover:bg-primary/20 transition-colors"
                style={{ width: `${(scene.duration / totalDuration) * 100}%` }}
                title={`Scene ${scene.order + 1} - ${scene.duration}s - ${scene.transition.type}`}
              >
                S{scene.order + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Sortable Scenes */}
        {scenes.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {scenes.map((scene) => (
                  <SortableScene
                    key={scene.id}
                    scene={scene}
                    onUpdate={handleUpdateScene}
                    onDelete={handleDeleteScene}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Noch keine Szenen vorhanden</p>
            <p className="text-xs mt-1">Füge eine Szene hinzu, um zu starten</p>
          </div>
        )}

        {/* Add Scene Button */}
        <Button onClick={onAddScene} variant="outline" className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Szene hinzufügen
        </Button>
      </CardContent>
    </Card>
  );
};
