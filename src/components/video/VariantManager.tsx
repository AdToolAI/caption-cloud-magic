import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useVideoVariants } from '@/hooks/useVideoVariants';
import { Download, Trash2, Plus, Video, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { FORMAT_PROFILES, ASPECT_RATIO_PROFILES, COMPRESSION_PROFILES } from '@/lib/compression-profiles';

interface VariantManagerProps {
  videoCreationId: string;
}

export function VariantManager({ videoCreationId }: VariantManagerProps) {
  const { variants, isLoading, deleteVariant, generateVariants, loading } = useVideoVariants(videoCreationId);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['mp4']);
  const [selectedRatios, setSelectedRatios] = useState<string[]>(['16:9']);
  const [selectedQuality, setSelectedQuality] = useState('1080p');

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('Download gestartet');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Download fehlgeschlagen');
    }
  };

  const handleDelete = async (variantId: string) => {
    if (confirm('Variante wirklich löschen?')) {
      deleteVariant(variantId);
    }
  };

  const handleGenerateVariants = async () => {
    const variantConfigs = [];
    for (const format of selectedFormats) {
      for (const ratio of selectedRatios) {
        variantConfigs.push({
          format,
          aspect_ratio: ratio,
          quality: selectedQuality
        });
      }
    }

    await generateVariants(videoCreationId, variantConfigs);
  };

  const groupedVariants = variants.reduce((acc, variant) => {
    const key = `${variant.aspect_ratio}_${variant.format}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(variant);
    return acc;
  }, {} as Record<string, typeof variants>);

  return (
    <div className="space-y-6">
      {/* Existing Variants */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Video Varianten ({variants.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : variants.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Noch keine Varianten erstellt
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedVariants).map(([key, variantGroup]) => {
                const variant = variantGroup[0];
                const formatProfile = FORMAT_PROFILES.find(f => f.id === variant.format);
                const ratioProfile = ASPECT_RATIO_PROFILES.find(r => r.id === variant.aspect_ratio);

                return (
                  <div key={key} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary">{formatProfile?.label || variant.format}</Badge>
                        <Badge variant="outline">{ratioProfile?.label || variant.aspect_ratio}</Badge>
                        {variant.resolution && (
                          <Badge variant="outline">{variant.resolution}</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {variant.file_size_mb && (
                          <div>Größe: {variant.file_size_mb.toFixed(2)} MB</div>
                        )}
                        {variant.duration_sec && (
                          <div>Dauer: {variant.duration_sec}s</div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(
                          variant.file_url,
                          `video_${variant.aspect_ratio}_${variant.format}.${formatProfile?.extension || 'mp4'}`
                        )}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(variant.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate New Variants */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Neue Varianten erstellen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Formats */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Formate</Label>
            <div className="grid grid-cols-3 gap-3">
              {FORMAT_PROFILES.map(format => (
                <div
                  key={format.id}
                  className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer"
                  onClick={() => setSelectedFormats(prev =>
                    prev.includes(format.id)
                      ? prev.filter(f => f !== format.id)
                      : [...prev, format.id]
                  )}
                >
                  <Checkbox
                    id={`format-${format.id}`}
                    checked={selectedFormats.includes(format.id)}
                  />
                  <Label htmlFor={`format-${format.id}`} className="cursor-pointer flex-1">
                    {format.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Aspect Ratios */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Seitenverhältnisse</Label>
            <div className="grid grid-cols-2 gap-3">
              {ASPECT_RATIO_PROFILES.map(ratio => (
                <div
                  key={ratio.id}
                  className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer"
                  onClick={() => setSelectedRatios(prev =>
                    prev.includes(ratio.id)
                      ? prev.filter(r => r !== ratio.id)
                      : [...prev, ratio.id]
                  )}
                >
                  <Checkbox
                    id={`ratio-${ratio.id}`}
                    checked={selectedRatios.includes(ratio.id)}
                  />
                  <Label htmlFor={`ratio-${ratio.id}`} className="cursor-pointer flex-1">
                    {ratio.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Quality */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Qualität</Label>
            <div className="grid grid-cols-4 gap-3">
              {COMPRESSION_PROFILES.map(quality => (
                <Button
                  key={quality.id}
                  variant={selectedQuality === quality.id ? 'default' : 'outline'}
                  onClick={() => setSelectedQuality(quality.id)}
                  className="justify-start"
                >
                  {quality.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">
              Es werden {selectedFormats.length} × {selectedRatios.length} = {' '}
              <span className="font-semibold text-foreground">
                {selectedFormats.length * selectedRatios.length} Varianten
              </span>
              {' '}erstellt
            </div>
          </div>

          {/* Generate Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleGenerateVariants}
            disabled={loading || selectedFormats.length === 0 || selectedRatios.length === 0}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Erstelle Varianten...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                {selectedFormats.length * selectedRatios.length} Varianten erstellen
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
