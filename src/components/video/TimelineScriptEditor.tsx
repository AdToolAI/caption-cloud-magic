import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Trash2, GripVertical, Lock, Unlock, Sparkles, Loader2 } from 'lucide-react';
import { ScriptSegment } from '@/types/video';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface TimelineScriptEditorProps {
  segments: ScriptSegment[];
  onSegmentsChange: (segments: ScriptSegment[]) => void;
  totalDuration: number;
  voiceStyle: string;
  voiceSpeed: number;
  mediaUrls: string[];
}

const calculateSegmentDuration = (text: string, speed: number): number => {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  if (words === 0) return 3; // Default 3s for empty
  const baseWordsPerMinute = 150;
  const adjustedWPM = baseWordsPerMinute * speed;
  return Math.max(1, (words / adjustedWPM) * 60); // Minimum 1s
};

function TimelineSegment({ 
  segment, 
  totalDuration, 
  isSelected,
  onClick,
  onUpdate 
}: { 
  segment: ScriptSegment;
  totalDuration: number;
  isSelected: boolean;
  onClick: () => void;
  onUpdate: (id: string, updates: Partial<ScriptSegment>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id: segment.id,
    disabled: segment.locked 
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const left = `${(segment.startTime / totalDuration) * 100}%`;
  const width = `${(segment.duration / totalDuration) * 100}%`;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, left, width }}
      className={`absolute h-16 bg-primary/80 rounded-md border-2 cursor-pointer transition-all hover:bg-primary ${
        isSelected ? 'border-primary ring-2 ring-primary/50 z-10' : 'border-primary-foreground/20'
      } ${segment.locked ? 'cursor-not-allowed opacity-70' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-1 h-full px-2">
        <button
          {...attributes}
          {...listeners}
          className={`cursor-grab active:cursor-grabbing ${segment.locked ? 'cursor-not-allowed' : ''}`}
          disabled={segment.locked}
        >
          <GripVertical className="h-4 w-4 text-primary-foreground/70" />
        </button>
        <div className="flex-1 overflow-hidden">
          <div className="text-xs font-medium text-primary-foreground truncate">
            {segment.text || 'Leeres Segment'}
          </div>
          <div className="text-[10px] text-primary-foreground/70">
            {segment.startTime.toFixed(1)}s - {(segment.startTime + segment.duration).toFixed(1)}s
          </div>
        </div>
        {segment.locked && <Lock className="h-3 w-3 text-primary-foreground/70" />}
      </div>
    </div>
  );
}

export const TimelineScriptEditor = ({
  segments,
  onSegmentsChange,
  totalDuration,
  voiceStyle,
  voiceSpeed,
  mediaUrls
}: TimelineScriptEditorProps) => {
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  const selectedSegment = segments.find(s => s.id === selectedSegmentId);

  const findNextAvailableTime = (): number => {
    if (segments.length === 0) return 0;
    const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime);
    const lastSegment = sortedSegments[sortedSegments.length - 1];
    return Math.min(lastSegment.startTime + lastSegment.duration, totalDuration - 3);
  };

  const addSegment = () => {
    const newSegment: ScriptSegment = {
      id: `segment-${Date.now()}`,
      text: '',
      startTime: findNextAvailableTime(),
      duration: 3,
      voiceSettings: {
        voiceId: voiceStyle,
        speed: voiceSpeed
      },
      locked: false
    };
    
    onSegmentsChange([...segments, newSegment]);
    setSelectedSegmentId(newSegment.id);
    
    toast({
      title: "Segment hinzugefügt",
      description: "Neues Segment zur Timeline hinzugefügt"
    });
  };

  const autoSyncSegments = async () => {
    if (segments.length === 0) {
      toast({
        title: "Keine Segmente vorhanden",
        description: "Füge zuerst Text-Segmente hinzu oder nutze 'Auto-Split'",
        variant: "destructive"
      });
      return;
    }

    setIsAutoSyncing(true);
    
    try {
      // Combine all segment texts
      const fullScript = segments.map(s => s.text).join(' ');
      
      if (!fullScript.trim()) {
        toast({
          title: "Keine Texte vorhanden",
          description: "Füge Text zu deinen Segmenten hinzu",
          variant: "destructive"
        });
        setIsAutoSyncing(false);
        return;
      }

      // Call analyze-script-for-video function
      const { data, error } = await supabase.functions.invoke('analyze-script-for-video', {
        body: {
          scriptText: fullScript,
          imageCount: Math.max(mediaUrls.length, segments.length),
          targetDuration: totalDuration,
          existingSegments: segments.map(s => ({ text: s.text }))
        }
      });

      if (error) throw error;

      if (!data.segments || data.segments.length === 0) {
        throw new Error('Keine Segmente zurückgegeben');
      }

      // Update segments with analyzed timings
      const syncedSegments: ScriptSegment[] = data.segments.map((analyzed: any, index: number) => {
        const existingSegment = segments[index] || segments[0];
        
        return {
          id: existingSegment.id,
          text: analyzed.text || existingSegment.text,
          startTime: analyzed.startTime || 0,
          duration: analyzed.duration || 3,
          voiceSettings: existingSegment.voiceSettings,
          imageIndex: analyzed.imageIndex !== undefined ? analyzed.imageIndex : index % Math.max(mediaUrls.length, 1),
          subtitleSettings: {
            wordTiming: analyzed.wordTimings || []
          },
          locked: existingSegment.locked
        };
      });

      onSegmentsChange(syncedSegments);
      
      toast({
        title: "✓ Auto-Sync erfolgreich",
        description: `${syncedSegments.length} Segmente mit präzisem Timing und Untertiteln synchronisiert`
      });
    } catch (error) {
      console.error('Auto-Sync error:', error);
      toast({
        title: "Auto-Sync fehlgeschlagen",
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: "destructive"
      });
    } finally {
      setIsAutoSyncing(false);
    }
  };

  const autoSplitText = async () => {
    // Get combined text from segments or ask user
    const fullText = segments.map(s => s.text).join(' ').trim();
    
    if (!fullText) {
      toast({
        title: "Kein Text vorhanden",
        description: "Füge zuerst Text zu deinen Segmenten hinzu",
        variant: "destructive"
      });
      return;
    }

    setIsAutoSyncing(true);
    
    try {
      const targetSegmentCount = Math.max(mediaUrls.length, 3);
      
      // Call analyze-script to intelligently split the text
      const { data, error } = await supabase.functions.invoke('analyze-script-for-video', {
        body: {
          scriptText: fullText,
          imageCount: targetSegmentCount,
          targetDuration: totalDuration
        }
      });

      if (error) throw error;

      if (!data.segments || data.segments.length === 0) {
        throw new Error('Keine Segmente zurückgegeben');
      }

      // Create new segments from AI analysis
      const newSegments: ScriptSegment[] = data.segments.map((analyzed: any, index: number) => ({
        id: `segment-split-${Date.now()}-${index}`,
        text: analyzed.text,
        startTime: analyzed.startTime || 0,
        duration: analyzed.duration || 3,
        voiceSettings: {
          voiceId: voiceStyle,
          speed: voiceSpeed
        },
        imageIndex: analyzed.imageIndex,
        subtitleSettings: {
          wordTiming: analyzed.wordTimings || []
        },
        locked: false
      }));

      onSegmentsChange(newSegments);
      
      toast({
        title: "✓ Text in Segmente aufgeteilt",
        description: `${newSegments.length} intelligente Segmente erstellt`
      });
    } catch (error) {
      console.error('Auto-Split error:', error);
      toast({
        title: "Auto-Split fehlgeschlagen",
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: "destructive"
      });
    } finally {
      setIsAutoSyncing(false);
    }
  };

  const updateSegment = (id: string, updates: Partial<ScriptSegment>) => {
    onSegmentsChange(
      segments.map(seg => {
        if (seg.id === id) {
          const updatedSegment = { ...seg, ...updates };
          
          // Auto-calculate duration if text changed
          if (updates.text !== undefined) {
            updatedSegment.duration = calculateSegmentDuration(
              updatedSegment.text, 
              updatedSegment.voiceSettings?.speed || voiceSpeed
            );
          }
          
          return updatedSegment;
        }
        return seg;
      })
    );
  };

  const deleteSegment = (id: string) => {
    onSegmentsChange(segments.filter(seg => seg.id !== id));
    if (selectedSegmentId === id) {
      setSelectedSegmentId(null);
    }
    
    toast({
      title: "Segment gelöscht",
      description: "Segment von der Timeline entfernt"
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    
    if (!timelineRef.current) return;
    
    const timelineWidth = timelineRef.current.offsetWidth;
    const pixelsPerSecond = timelineWidth / totalDuration;
    const timeDelta = delta.x / pixelsPerSecond;
    
    const segment = segments.find(s => s.id === active.id);
    if (!segment) return;
    
    let newStartTime = segment.startTime + timeDelta;
    
    // Snap to 0.5s grid
    newStartTime = Math.round(newStartTime * 2) / 2;
    
    // Clamp to valid range
    newStartTime = Math.max(0, Math.min(newStartTime, totalDuration - segment.duration));
    
    updateSegment(segment.id, { startTime: newStartTime });
  };

  // Generate timeline ruler marks
  const timeMarks = [];
  const step = totalDuration <= 30 ? 5 : totalDuration <= 60 ? 10 : 15;
  for (let i = 0; i <= totalDuration; i += step) {
    timeMarks.push(i);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Timeline Script Editor</CardTitle>
              <CardDescription>
                Platziere Text-Segmente präzise auf der Zeitachse
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={autoSplitText} 
                size="sm" 
                variant="outline"
                disabled={isAutoSyncing || segments.length === 0}
                title="Text intelligent in mehrere Segmente aufteilen"
              >
                {isAutoSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Auto-Split'
                )}
              </Button>
              <Button 
                onClick={autoSyncSegments} 
                size="sm" 
                variant="secondary"
                disabled={isAutoSyncing || segments.length === 0}
                title="Segmente mit präzisem Timing und Untertiteln synchronisieren"
              >
                {isAutoSyncing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Synchronisiere...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Auto-Sync
                  </>
                )}
              </Button>
              <Button onClick={addSegment} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Segment
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Timeline Ruler */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Zeitachse (Gesamt: {totalDuration}s)</Label>
            <div className="relative border rounded-lg p-4 bg-muted/30 min-h-32">
              {/* Time marks */}
              <div className="absolute top-0 left-0 right-0 h-6 border-b flex items-end">
                {timeMarks.map(mark => (
                  <div
                    key={mark}
                    className="absolute text-[10px] text-muted-foreground"
                    style={{ left: `${(mark / totalDuration) * 100}%` }}
                  >
                    <div className="w-px h-2 bg-border mb-1" />
                    {mark}s
                  </div>
                ))}
              </div>

              {/* Timeline track */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <div ref={timelineRef} className="relative mt-8 h-20 bg-background/50 rounded border">
                  {segments.map(segment => (
                    <TimelineSegment
                      key={segment.id}
                      segment={segment}
                      totalDuration={totalDuration}
                      isSelected={selectedSegmentId === segment.id}
                      onClick={() => setSelectedSegmentId(segment.id)}
                      onUpdate={updateSegment}
                    />
                  ))}
                  
                  {segments.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                      Klicke "Segment hinzufügen" um zu starten
                    </div>
                  )}
                </div>
              </DndContext>
            </div>
          </div>

          {/* Segment Details */}
          {selectedSegment && (
            <Card className="border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Segment Details</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateSegment(selectedSegment.id, { locked: !selectedSegment.locked })}
                    >
                      {selectedSegment.locked ? (
                        <><Lock className="h-4 w-4 mr-2" /> Entsperren</>
                      ) : (
                        <><Unlock className="h-4 w-4 mr-2" /> Sperren</>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSegment(selectedSegment.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Text</Label>
                  <Textarea
                    value={selectedSegment.text}
                    onChange={(e) => updateSegment(selectedSegment.id, { text: e.target.value })}
                    placeholder="Segment-Text eingeben..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Start (s)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max={totalDuration}
                      value={selectedSegment.startTime}
                      onChange={(e) => updateSegment(selectedSegment.id, { startTime: parseFloat(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Dauer (s)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={selectedSegment.duration.toFixed(1)}
                      onChange={(e) => updateSegment(selectedSegment.id, { duration: parseFloat(e.target.value) || 1 })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Ende (s)</Label>
                    <Input
                      type="number"
                      disabled
                      value={(selectedSegment.startTime + selectedSegment.duration).toFixed(1)}
                      className="bg-muted"
                    />
                  </div>
                </div>

                {mediaUrls.length > 0 && (
                  <div className="space-y-2">
                    <Label>Bild während Segment</Label>
                    <Select
                      value={selectedSegment.imageIndex?.toString() || ''}
                      onValueChange={(value) => updateSegment(selectedSegment.id, { imageIndex: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Kein Bild ausgewählt" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-1">Kein Bild</SelectItem>
                        {mediaUrls.map((url, index) => (
                          <SelectItem key={index} value={index.toString()}>
                            Bild {index + 1}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="pt-2 text-xs text-muted-foreground space-y-1">
                  <div>💡 <strong>Tipp:</strong> Ziehe Segmente auf der Timeline um die Position zu ändern</div>
                  <div>✨ <strong>Auto-Split:</strong> Teilt Text intelligent in mehrere Segmente auf</div>
                  <div>🎯 <strong>Auto-Sync:</strong> Optimiert Timing und generiert word-by-word Untertitel</div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm">
            <span className="text-muted-foreground">
              {segments.length} Segment{segments.length !== 1 ? 'e' : ''}
            </span>
            <span className="font-medium">
              Gesamtdauer: {segments.reduce((sum, s) => Math.max(sum, s.startTime + s.duration), 0).toFixed(1)}s / {totalDuration}s
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
