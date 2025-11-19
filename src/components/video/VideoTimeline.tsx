import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

interface TimelineClip {
  id: string;
  type: 'intro' | 'main' | 'outro' | 'custom';
  duration: number;
  transition: 'none' | 'fade' | 'wipe' | 'zoom';
  content: string;
}

interface VideoTimelineProps {
  clips: TimelineClip[];
  onClipsChange: (clips: TimelineClip[]) => void;
  totalDuration?: number;
}

function SortableClip({ clip, onUpdate, onDelete }: { 
  clip: TimelineClip; 
  onUpdate: (id: string, updates: Partial<TimelineClip>) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: clip.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-card border rounded-lg p-4 mb-3">
      <div className="flex items-start gap-3">
        <button {...attributes} {...listeners} className="mt-1 cursor-grab active:cursor-grabbing">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </button>
        
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium capitalize">{clip.type}</div>
              <div className="text-sm text-muted-foreground">{clip.content}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onDelete(clip.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Dauer (Sekunden)</Label>
              <Slider
                value={[clip.duration]}
                onValueChange={([value]) => onUpdate(clip.id, { duration: value })}
                min={1}
                max={15}
                step={0.5}
                className="w-full"
              />
              <div className="text-xs text-muted-foreground text-right">{clip.duration}s</div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Übergang</Label>
              <Select value={clip.transition} onValueChange={(value) => onUpdate(clip.id, { transition: value as TimelineClip['transition'] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Übergang</SelectItem>
                  <SelectItem value="fade">Fade</SelectItem>
                  <SelectItem value="wipe">Wipe</SelectItem>
                  <SelectItem value="zoom">Zoom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Visual Timeline Bar */}
          <div className="relative h-8 bg-muted rounded overflow-hidden">
            <div 
              className="absolute inset-0 bg-primary/20 border-l-2 border-primary"
              style={{ width: `${(clip.duration / 15) * 100}%` }}
            >
              <div className="h-full flex items-center px-2 text-xs font-medium">
                {clip.duration}s
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const VideoTimeline = ({ clips, onClipsChange, totalDuration = 0 }: VideoTimelineProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = clips.findIndex((c) => c.id === active.id);
      const newIndex = clips.findIndex((c) => c.id === over.id);
      onClipsChange(arrayMove(clips, oldIndex, newIndex));
    }
  };

  const handleUpdateClip = (id: string, updates: Partial<TimelineClip>) => {
    onClipsChange(clips.map((clip) => (clip.id === id ? { ...clip, ...updates } : clip)));
  };

  const handleDeleteClip = (id: string) => {
    onClipsChange(clips.filter((clip) => clip.id !== id));
  };

  const handleAddClip = () => {
    const newClip: TimelineClip = {
      id: `clip-${Date.now()}`,
      type: 'custom',
      duration: 3,
      transition: 'fade',
      content: 'Neuer Clip',
    };
    onClipsChange([...clips, newClip]);
  };

  const calculatedTotal = clips.reduce((sum, clip) => sum + clip.duration, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Video-Timeline</CardTitle>
        <CardDescription>
          Clips neu anordnen, Übergänge hinzufügen und Dauer anpassen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total Duration Display */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">Gesamtdauer</span>
          <span className="text-lg font-bold">{calculatedTotal.toFixed(1)}s</span>
        </div>

        {/* Timeline Visual Overview */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Zeitleisten-Übersicht</Label>
          <div className="h-12 bg-muted rounded-lg overflow-hidden flex">
            {clips.map((clip, index) => (
              <div
                key={clip.id}
                className="h-full border-r border-background flex items-center justify-center text-xs font-medium bg-primary/10 hover:bg-primary/20 transition-colors"
                style={{ width: `${(clip.duration / calculatedTotal) * 100}%` }}
                title={`${clip.type} - ${clip.duration}s - ${clip.transition}`}
              >
                {clip.type}
              </div>
            ))}
          </div>
        </div>

        {/* Sortable Clips */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={clips.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {clips.map((clip) => (
                <SortableClip
                  key={clip.id}
                  clip={clip}
                  onUpdate={handleUpdateClip}
                  onDelete={handleDeleteClip}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Add Clip Button */}
        <Button onClick={handleAddClip} variant="outline" className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Clip hinzufügen
        </Button>

        {/* Audio Track Info */}
        <div className="pt-4 border-t">
          <div className="text-sm text-muted-foreground mb-2">🎵 Audio-Track</div>
          <div className="h-6 bg-accent/20 rounded relative overflow-hidden">
            <div className="absolute inset-0 flex items-center px-2 text-xs">
              Voiceover ({calculatedTotal.toFixed(1)}s)
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
