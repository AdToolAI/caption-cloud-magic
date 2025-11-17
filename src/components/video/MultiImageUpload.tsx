import { useState, useCallback } from 'react';
import { Upload, X, GripVertical, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

interface UploadedImage {
  id: string;
  url: string;
  file: File;
  uploading?: boolean;
  progress?: number;
}

interface MultiImageUploadProps {
  value: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  maxFiles?: number;
  minFiles?: number;
  disabled?: boolean;
  label?: string;
}

export function MultiImageUpload({
  value = [],
  onChange,
  maxFiles = 5,
  minFiles = 1,
  disabled = false,
  label = 'Bilder hochladen'
}: MultiImageUploadProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || disabled) return;

    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      toast.error('Bitte nur Bilddateien hochladen');
      return;
    }

    if (value.length + imageFiles.length > maxFiles) {
      toast.error(`Maximal ${maxFiles} Bilder erlaubt`);
      return;
    }

    // Create preview URLs for new images
    const newImages: UploadedImage[] = imageFiles.map(file => ({
      id: `temp-${Date.now()}-${Math.random()}`,
      url: URL.createObjectURL(file),
      file,
      uploading: false,
      progress: 0
    }));

    onChange([...value, ...newImages]);
  }, [value, onChange, maxFiles, disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const removeImage = useCallback((id: string) => {
    const imageToRemove = value.find(img => img.id === id);
    if (imageToRemove) {
      URL.revokeObjectURL(imageToRemove.url);
    }
    onChange(value.filter(img => img.id !== id));
  }, [value, onChange]);

  const moveImage = useCallback((fromIndex: number, toIndex: number) => {
    const newImages = [...value];
    const [movedImage] = newImages.splice(fromIndex, 1);
    newImages.splice(toIndex, 0, movedImage);
    onChange(newImages);
  }, [value, onChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          {label}
          {minFiles > 0 && (
            <span className="text-muted-foreground ml-1">
              ({value.length}/{maxFiles} • Min: {minFiles})
            </span>
          )}
        </label>
      </div>

      {/* Upload Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50'}
        `}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={disabled || value.length >= maxFiles}
          onChange={(e) => handleFiles(e.target.files)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
        <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-1">
          Bilder hier ablegen oder klicken zum Hochladen
        </p>
        <p className="text-xs text-muted-foreground">
          PNG, JPG, WebP bis 10MB • Max. {maxFiles} Bilder
        </p>
      </div>

      {/* Image Grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {value.map((image, index) => (
            <div
              key={image.id}
              className="relative group rounded-lg overflow-hidden border border-border bg-muted"
            >
              {/* Drag Handle */}
              <div
                className="absolute top-2 left-2 z-10 cursor-move opacity-0 group-hover:opacity-100 transition-opacity"
                onMouseDown={(e) => {
                  e.preventDefault();
                  // Simple drag implementation
                }}
              >
                <div className="bg-background/80 backdrop-blur-sm rounded p-1">
                  <GripVertical className="h-4 w-4 text-foreground" />
                </div>
              </div>

              {/* Remove Button */}
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-2 right-2 z-10 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeImage(image.id)}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>

              {/* Image Preview */}
              <div className="aspect-square relative">
                {image.uploading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                    <ImageIcon className="h-8 w-8 mb-2 text-muted-foreground animate-pulse" />
                    <Progress value={image.progress} className="w-3/4" />
                    <p className="text-xs text-muted-foreground mt-2">
                      {image.progress}% hochgeladen
                    </p>
                  </div>
                ) : (
                  <img
                    src={image.url}
                    alt={`Upload ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Image Number Badge */}
              <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1 text-xs font-medium">
                #{index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Message */}
      {value.length > 0 && value.length < minFiles && (
        <p className="text-sm text-destructive">
          Noch {minFiles - value.length} Bild(er) erforderlich
        </p>
      )}
    </div>
  );
}
