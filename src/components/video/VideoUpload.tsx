import { useState, useCallback } from 'react';
import { Upload, X, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

interface VideoUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  label?: string;
  maxSizeMB?: number;
}

export function VideoUpload({
  value,
  onChange,
  disabled = false,
  label = 'Video hochladen',
  maxSizeMB = 100
}: VideoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File | null) => {
    if (!file || disabled) return;

    if (!file.type.startsWith('video/')) {
      toast.error('Bitte nur Videodateien hochladen');
      return;
    }

    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`Video zu groß. Maximal ${maxSizeMB}MB erlaubt`);
      return;
    }

    setUploading(true);
    setProgress(0);

    // Simulate upload progress (replace with actual upload)
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return prev;
        }
        return prev + 10;
      });
    }, 300);

    try {
      // Create preview URL
      const url = URL.createObjectURL(file);
      onChange(url);
      setProgress(100);
      toast.success('Video hochgeladen');
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
  }, [onChange, disabled, maxSizeMB]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const handleRemove = useCallback(() => {
    if (value) {
      URL.revokeObjectURL(value);
    }
    onChange(null);
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
            relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50'}
          `}
        >
          <input
            type="file"
            accept="video/*"
            disabled={disabled || uploading}
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          {uploading ? (
            <div className="space-y-4">
              <Film className="h-10 w-10 mx-auto text-primary animate-pulse" />
              <Progress value={progress} className="max-w-xs mx-auto" />
              <p className="text-sm text-muted-foreground">{progress}% hochgeladen</p>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-1">
                Video hier ablegen oder klicken
              </p>
              <p className="text-xs text-muted-foreground">
                MP4, MOV, AVI bis {maxSizeMB}MB
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
          <Button
            size="icon"
            variant="destructive"
            className="absolute top-2 right-2 z-10"
            onClick={handleRemove}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
          <video
            src={value}
            controls
            className="w-full aspect-video object-cover"
          />
        </div>
      )}
    </div>
  );
}
