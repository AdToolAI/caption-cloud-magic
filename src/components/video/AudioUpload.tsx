import { useState, useCallback } from 'react';
import { Upload, X, Music, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface AudioUploadProps {
  value: { url: string; volume: number } | null;
  onChange: (audio: { url: string; volume: number } | null) => void;
  disabled?: boolean;
  label?: string;
}

export function AudioUpload({
  value,
  onChange,
  disabled = false,
  label = 'Hintergrundmusik'
}: AudioUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File | null) => {
    if (!file || disabled) return;

    if (!file.type.startsWith('audio/')) {
      toast.error('Bitte nur Audiodateien hochladen');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Audio zu groß. Maximal 10MB erlaubt');
      return;
    }

    setUploading(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return prev;
        }
        return prev + 10;
      });
    }, 200);

    try {
      const url = URL.createObjectURL(file);
      onChange({ url, volume: 0.5 });
      setProgress(100);
      toast.success('Audio hochgeladen');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Fehler beim Hochladen');
      clearInterval(interval);
    } finally {
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 500);
    }
  }, [onChange, disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const handleRemove = useCallback(() => {
    if (value) {
      URL.revokeObjectURL(value.url);
    }
    onChange(null);
  }, [value, onChange]);

  const handleVolumeChange = useCallback((newVolume: number[]) => {
    if (value) {
      onChange({ ...value, volume: newVolume[0] });
    }
  }, [value, onChange]);

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium">{label}</label>

      {!value ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
            ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50'}
          `}
        >
          <input
            type="file"
            accept="audio/*"
            disabled={disabled || uploading}
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          {uploading ? (
            <div className="space-y-3">
              <Music className="h-8 w-8 mx-auto text-primary animate-pulse" />
              <Progress value={progress} className="max-w-xs mx-auto" />
              <p className="text-xs text-muted-foreground">{progress}%</p>
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-1">
                Audio hier ablegen
              </p>
              <p className="text-xs text-muted-foreground">
                MP3, WAV, OGG bis 10MB
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4 p-4 rounded-lg border border-border bg-muted">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <Music className="h-5 w-5 text-primary" />
              <audio src={value.url} controls className="flex-1 h-8" />
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleRemove}
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Lautstärke</Label>
              <span className="text-xs text-muted-foreground">
                {Math.round(value.volume * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <Slider
                value={[value.volume]}
                onValueChange={handleVolumeChange}
                max={1}
                step={0.1}
                disabled={disabled}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
