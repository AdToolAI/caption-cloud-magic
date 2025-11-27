import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Eraser, Image, Users, Trash2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface DetectedObject {
  id: string;
  type: 'person' | 'object' | 'text' | 'logo';
  label: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  timeRange?: { start: number; end: number };
  selected: boolean;
}

interface AIObjectRemovalProps {
  videoUrl: string;
  onObjectsRemoved: (objectIds: string[]) => void;
  onDetectionComplete?: (objects: DetectedObject[]) => void;
}

export function AIObjectRemoval({ videoUrl, onObjectsRemoved, onDetectionComplete }: AIObjectRemovalProps) {
  const [isDetecting, setIsDetecting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [activeTab, setActiveTab] = useState('detect');
  const [error, setError] = useState<string | null>(null);

  const handleDetectObjects = async () => {
    if (!videoUrl) {
      toast({
        title: 'Kein Video ausgewählt',
        description: 'Bitte wähle zuerst ein Video aus.',
        variant: 'destructive'
      });
      return;
    }

    setIsDetecting(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('director-cut-object-removal', {
        body: {
          video_url: videoUrl,
          action: 'detect'
        }
      });

      if (fnError) throw fnError;

      if (data?.success && data?.detected_objects) {
        const objects: DetectedObject[] = data.detected_objects.map((obj: any, index: number) => ({
          id: `obj-${index}`,
          type: obj.type,
          label: obj.label,
          confidence: obj.confidence,
          boundingBox: obj.bounding_box,
          timeRange: obj.time_range,
          selected: false
        }));
        
        setDetectedObjects(objects);
        setActiveTab('select');
        onDetectionComplete?.(objects);
        
        toast({
          title: 'Erkennung abgeschlossen',
          description: `${objects.length} Objekte in ${data.frames_analyzed} Frames gefunden.`
        });
      }
    } catch (err) {
      console.error('Object detection error:', err);
      setError(err instanceof Error ? err.message : 'Erkennung fehlgeschlagen');
      toast({
        title: 'Fehler bei der Erkennung',
        description: 'Bitte versuche es später erneut.',
        variant: 'destructive'
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const toggleObjectSelection = (id: string) => {
    setDetectedObjects(prev => 
      prev.map(obj => 
        obj.id === id ? { ...obj, selected: !obj.selected } : obj
      )
    );
  };

  const handleRemoveSelected = async () => {
    const selectedObjects = detectedObjects.filter(o => o.selected);
    if (selectedObjects.length === 0) {
      toast({
        title: 'Keine Objekte ausgewählt',
        description: 'Bitte wähle mindestens ein Objekt zur Entfernung aus.',
        variant: 'destructive'
      });
      return;
    }
    
    setIsRemoving(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('director-cut-object-removal', {
        body: {
          video_url: videoUrl,
          action: 'remove',
          object_ids: selectedObjects.map(o => o.id),
          objects: selectedObjects.map(o => ({
            type: o.type,
            bounding_box: o.boundingBox,
            time_range: o.timeRange
          }))
        }
      });

      if (fnError) throw fnError;

      if (data?.success) {
        toast({
          title: 'Objekte werden entfernt',
          description: `${selectedObjects.length} Objekte werden im Hintergrund entfernt.`
        });
        
        onObjectsRemoved(selectedObjects.map(o => o.id));
        setDetectedObjects(prev => prev.filter(o => !o.selected));
      }
    } catch (err) {
      console.error('Object removal error:', err);
      setError(err instanceof Error ? err.message : 'Entfernung fehlgeschlagen');
      toast({
        title: 'Fehler bei der Entfernung',
        description: 'Bitte versuche es später erneut.',
        variant: 'destructive'
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const getObjectIcon = (type: DetectedObject['type']) => {
    switch (type) {
      case 'person': return <Users className="h-4 w-4" />;
      case 'logo': return <Image className="h-4 w-4" />;
      default: return <Eraser className="h-4 w-4" />;
    }
  };

  const selectedCount = detectedObjects.filter(o => o.selected).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eraser className="h-4 w-4 text-red-500" />
          AI Object Removal
          <Badge variant="secondary" className="ml-auto">Premium</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="detect">Erkennen</TabsTrigger>
            <TabsTrigger value="select" disabled={detectedObjects.length === 0}>
              Auswählen ({detectedObjects.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="detect" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              KI erkennt automatisch Personen, Objekte, Logos und Text im Video.
            </p>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <Button 
              className="w-full" 
              onClick={handleDetectObjects}
              disabled={isDetecting || !videoUrl}
            >
              {isDetecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analysiere Video...
                </>
              ) : (
                <>
                  <Eraser className="h-4 w-4 mr-2" />
                  Objekte erkennen
                </>
              )}
            </Button>
          </TabsContent>
          
          <TabsContent value="select" className="space-y-3">
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {detectedObjects.map((obj) => (
                <div
                  key={obj.id}
                  onClick={() => toggleObjectSelection(obj.id)}
                  className={`
                    flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all
                    ${obj.selected 
                      ? 'border-red-500 bg-red-500/10' 
                      : 'border-border hover:border-red-500/50'
                    }
                  `}
                >
                  <div className={`
                    w-8 h-8 rounded-md flex items-center justify-center
                    ${obj.selected ? 'bg-red-500 text-white' : 'bg-muted'}
                  `}>
                    {getObjectIcon(obj.type)}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium">{obj.label}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {obj.type}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {Math.round(obj.confidence * 100)}% Konfidenz
                      </span>
                      {obj.timeRange && (
                        <span className="text-[10px] text-muted-foreground">
                          {obj.timeRange.start.toFixed(1)}s - {obj.timeRange.end.toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>
                  {obj.selected && <Trash2 className="h-4 w-4 text-red-500" />}
                </div>
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}
            
            {selectedCount > 0 && (
              <Button 
                className="w-full bg-red-500 hover:bg-red-600" 
                onClick={handleRemoveSelected}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Entferne {selectedCount} Objekt{selectedCount > 1 ? 'e' : ''}...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {selectedCount} Objekt{selectedCount > 1 ? 'e' : ''} entfernen
                  </>
                )}
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
