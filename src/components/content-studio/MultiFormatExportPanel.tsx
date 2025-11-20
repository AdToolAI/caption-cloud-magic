import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MultiFormatExportPanelProps {
  projectId: string;
  onExportComplete?: (results: any[]) => void;
}

export function MultiFormatExportPanel({ projectId, onExportComplete }: MultiFormatExportPanelProps) {
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['mp4']);
  const [selectedRatios, setSelectedRatios] = useState<string[]>(['9:16']);
  const [quality, setQuality] = useState('1080p');
  const [includeWatermark, setIncludeWatermark] = useState(false);
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const formats = [
    { id: 'mp4', label: 'MP4', credits: 5 },
    { id: 'webm', label: 'WebM', credits: 5 },
    { id: 'gif', label: 'GIF', credits: 5 }
  ];

  const aspectRatios = [
    { id: '9:16', label: '9:16 (Stories/Reels)' },
    { id: '16:9', label: '16:9 (YouTube)' },
    { id: '1:1', label: '1:1 (Instagram)' }
  ];

  const qualities = [
    { id: '720p', label: '720p HD' },
    { id: '1080p', label: '1080p Full HD' },
    { id: '4k', label: '4K Ultra HD' }
  ];

  const totalVariants = selectedFormats.length * selectedRatios.length;
  const creditsPerVariant = 5;
  const totalCredits = totalVariants * creditsPerVariant;

  const handleFormatToggle = (formatId: string) => {
    setSelectedFormats(prev =>
      prev.includes(formatId)
        ? prev.filter(f => f !== formatId)
        : [...prev, formatId]
    );
  };

  const handleRatioToggle = (ratioId: string) => {
    setSelectedRatios(prev =>
      prev.includes(ratioId)
        ? prev.filter(r => r !== ratioId)
        : [...prev, ratioId]
    );
  };

  const handleExport = async () => {
    if (selectedFormats.length === 0 || selectedRatios.length === 0) {
      toast.error("Bitte wähle mindestens ein Format und Seitenverhältnis");
      return;
    }

    setIsExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('render-multi-format', {
        body: {
          project_id: projectId,
          export_settings: {
            formats: selectedFormats,
            aspect_ratios: selectedRatios,
            quality,
            include_watermark: includeWatermark,
            include_subtitles: includeSubtitles
          }
        }
      });

      if (error) throw error;

      toast.success(`${data.rendered_videos.length} Videos erfolgreich erstellt!`);
      onExportComplete?.(data.rendered_videos);
    } catch (error) {
      console.error('Export error:', error);
      toast.error((error as Error).message || 'Export fehlgeschlagen');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Multi-Format Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Formats */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Formate</Label>
          <div className="grid grid-cols-3 gap-3">
            {formats.map(format => (
              <div
                key={format.id}
                className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer"
                onClick={() => handleFormatToggle(format.id)}
              >
                <Checkbox
                  id={format.id}
                  checked={selectedFormats.includes(format.id)}
                  onCheckedChange={() => handleFormatToggle(format.id)}
                />
                <Label htmlFor={format.id} className="cursor-pointer flex-1">
                  {format.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Aspect Ratios */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Seitenverhältnisse</Label>
          <div className="grid grid-cols-1 gap-3">
            {aspectRatios.map(ratio => (
              <div
                key={ratio.id}
                className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer"
                onClick={() => handleRatioToggle(ratio.id)}
              >
                <Checkbox
                  id={ratio.id}
                  checked={selectedRatios.includes(ratio.id)}
                  onCheckedChange={() => handleRatioToggle(ratio.id)}
                />
                <Label htmlFor={ratio.id} className="cursor-pointer flex-1">
                  {ratio.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Quality */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Qualität</Label>
          <RadioGroup value={quality} onValueChange={setQuality}>
            {qualities.map(q => (
              <div key={q.id} className="flex items-center space-x-2">
                <RadioGroupItem value={q.id} id={`quality-${q.id}`} />
                <Label htmlFor={`quality-${q.id}`} className="cursor-pointer">
                  {q.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Optionen</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="watermark"
                checked={includeWatermark}
                onCheckedChange={(checked) => setIncludeWatermark(checked as boolean)}
              />
              <Label htmlFor="watermark" className="cursor-pointer">
                Wasserzeichen
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="subtitles"
                checked={includeSubtitles}
                onCheckedChange={(checked) => setIncludeSubtitles(checked as boolean)}
              />
              <Label htmlFor="subtitles" className="cursor-pointer">
                Untertitel
              </Label>
            </div>
          </div>
        </div>

        {/* Cost Summary */}
        <div className="p-4 bg-muted rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Varianten:</span>
            <span className="font-medium">
              {selectedFormats.length} × {selectedRatios.length} = {totalVariants}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Credits pro Video:</span>
            <span className="font-medium">{creditsPerVariant}</span>
          </div>
          <div className="flex justify-between pt-2 border-t">
            <span className="font-semibold">Gesamt:</span>
            <Badge variant="secondary" className="text-base">
              {totalCredits} Credits
            </Badge>
          </div>
        </div>

        {/* Export Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleExport}
          disabled={isExporting || totalVariants === 0}
        >
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exportiere...
            </>
          ) : (
            `Alle Varianten rendern (${totalCredits} Credits)`
          )}
        </Button>
      </CardContent>
    </Card>
  );
}