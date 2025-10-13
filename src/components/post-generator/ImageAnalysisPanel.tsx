import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Download, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ImageAnalysisPanelProps {
  imageUrl: string;
  brandKitId?: string;
}

export const ImageAnalysisPanel = ({ imageUrl, brandKitId }: ImageAnalysisPanelProps) => {
  const { toast } = useToast();

  const { data: analysis, isLoading, error } = useQuery({
    queryKey: ['image-analysis', imageUrl, brandKitId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('analyze-image-v2', {
        body: { imageUrl, brandKitId }
      });

      if (error) throw error;
      return data;
    },
    enabled: !!imageUrl,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Analysiere Bild...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        <div className="text-center space-y-2">
          <AlertCircle className="w-8 h-8 mx-auto" />
          <p className="text-sm">Bildanalyse fehlgeschlagen</p>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="space-y-4">
      {/* Original Image */}
      <div className="aspect-square rounded-lg overflow-hidden bg-muted">
        <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
      </div>

      {/* Quality Score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Qualitäts-Check</h3>
          <Badge variant={analysis.quality.qualityScore >= 80 ? "default" : "secondary"}>
            {analysis.quality.qualityScore >= 80 ? (
              <CheckCircle className="w-3 h-3 mr-1" />
            ) : (
              <AlertCircle className="w-3 h-3 mr-1" />
            )}
            {analysis.quality.qualityScore}/100
          </Badge>
        </div>

        <div className="text-xs space-y-1 text-muted-foreground">
          <p>Auflösung: {analysis.quality.resolution.width} x {analysis.quality.resolution.height}px</p>
          <p>Dateigröße: {(analysis.quality.fileSize / 1024 / 1024).toFixed(2)} MB</p>
        </div>

        {analysis.quality.issues.length > 0 && (
          <div className="space-y-1">
            {analysis.quality.issues.map((issue: string, idx: number) => (
              <p key={idx} className="text-xs text-destructive flex items-start gap-1">
                <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                {issue}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* CI Color Match */}
      {analysis.ciMatch && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">CI-Farbtreffer</h3>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span>Primärfarbe:</span>
              <Badge variant="outline">{analysis.ciMatch.primaryColorMatch}%</Badge>
            </div>
            <div className="flex justify-between">
              <span>Sekundärfarbe:</span>
              <Badge variant="outline">{analysis.ciMatch.secondaryColorMatch}%</Badge>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Gesamt:</span>
              <Badge variant={analysis.ciMatch.overallMatch >= 60 ? "default" : "secondary"}>
                {analysis.ciMatch.overallMatch}%
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Crops */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">Auto-Crops</h3>
        <div className="grid grid-cols-3 gap-2">
          <CropPreview
            label="1:1"
            url={analysis.crops.square}
            aspectClass="aspect-square"
          />
          <CropPreview
            label="4:5"
            url={analysis.crops.portrait}
            aspectClass="aspect-[4/5]"
          />
          <CropPreview
            label="9:16"
            url={analysis.crops.story}
            aspectClass="aspect-[9/16]"
          />
        </div>
      </div>
    </div>
  );
};

interface CropPreviewProps {
  label: string;
  url: string;
  aspectClass: string;
}

const CropPreview = ({ label, url, aspectClass }: CropPreviewProps) => {
  const handleDownload = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `crop-${label}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <div className="relative group">
      <div className={`${aspectClass} bg-muted rounded overflow-hidden`}>
        <img src={url} alt={`Crop ${label}`} className="w-full h-full object-cover" />
      </div>
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
        <span className="text-white text-xs font-semibold">{label}</span>
        <Button
          size="sm"
          variant="secondary"
          className="h-6 px-2 text-xs"
          onClick={handleDownload}
        >
          <Download className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};
