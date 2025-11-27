import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Eraser, Image, Users, Trash2 } from 'lucide-react';

interface DetectedObject {
  id: string;
  type: 'person' | 'object' | 'text' | 'logo';
  label: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  selected: boolean;
}

interface AIObjectRemovalProps {
  videoUrl: string;
  onObjectsRemoved: (objectIds: string[]) => void;
}

export function AIObjectRemoval({ videoUrl, onObjectsRemoved }: AIObjectRemovalProps) {
  const [isDetecting, setIsDetecting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [activeTab, setActiveTab] = useState('detect');

  const handleDetectObjects = async () => {
    setIsDetecting(true);
    
    // Simulate object detection
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    const mockObjects: DetectedObject[] = [
      { 
        id: '1', 
        type: 'person', 
        label: 'Person im Hintergrund', 
        confidence: 0.92,
        boundingBox: { x: 0.7, y: 0.3, width: 0.15, height: 0.4 },
        selected: false 
      },
      { 
        id: '2', 
        type: 'object', 
        label: 'Störendes Objekt', 
        confidence: 0.87,
        boundingBox: { x: 0.1, y: 0.6, width: 0.1, height: 0.15 },
        selected: false 
      },
      { 
        id: '3', 
        type: 'logo', 
        label: 'Wasserzeichen', 
        confidence: 0.95,
        boundingBox: { x: 0.85, y: 0.9, width: 0.1, height: 0.05 },
        selected: false 
      },
      { 
        id: '4', 
        type: 'text', 
        label: 'Text-Overlay', 
        confidence: 0.89,
        boundingBox: { x: 0.3, y: 0.1, width: 0.4, height: 0.08 },
        selected: false 
      },
    ];
    
    setDetectedObjects(mockObjects);
    setIsDetecting(false);
    setActiveTab('select');
  };

  const toggleObjectSelection = (id: string) => {
    setDetectedObjects(prev => 
      prev.map(obj => 
        obj.id === id ? { ...obj, selected: !obj.selected } : obj
      )
    );
  };

  const handleRemoveSelected = async () => {
    const selectedIds = detectedObjects.filter(o => o.selected).map(o => o.id);
    if (selectedIds.length === 0) return;
    
    setIsRemoving(true);
    
    // Simulate removal processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    onObjectsRemoved(selectedIds);
    setDetectedObjects(prev => prev.filter(o => !o.selected));
    setIsRemoving(false);
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
            <Button 
              className="w-full" 
              onClick={handleDetectObjects}
              disabled={isDetecting}
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
                    </div>
                  </div>
                  {obj.selected && <Trash2 className="h-4 w-4 text-red-500" />}
                </div>
              ))}
            </div>
            
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
