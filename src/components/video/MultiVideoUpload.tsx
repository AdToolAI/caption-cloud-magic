import { useState, useCallback, useRef } from 'react';
import { Upload, X, GripVertical, Video as VideoIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

interface UploadedVideo {
  id: string;
  url: string;
  file: File;
  uploading?: boolean;
  progress?: number;
  duration?: number;
  thumbnail?: string;
}

interface MultiVideoUploadProps {
  value: UploadedVideo[];
  onChange: (videos: UploadedVideo[]) => void;
  maxFiles?: number;
  minFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
  label?: string;
}

export function MultiVideoUpload({
  value = [],
  onChange,
  maxFiles = 3,
  minFiles = 1,
  maxSizeMB = 100,
  disabled = false,
  label = 'Videos hochladen'
}: MultiVideoUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const generateThumbnail = useCallback((file: File, videoId: string): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.currentTime = 1; // Capture at 1 second
      
      video.addEventListener('loadeddata', () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
          resolve(thumbnail);
        }
        URL.revokeObjectURL(video.src);
      });

      video.addEventListener('error', () => {
        resolve(''); // Fallback if thumbnail generation fails
      });
    });
  }, []);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || disabled) return;

    const fileArray = Array.from(files);
    const videoFiles = fileArray.filter(file => file.type.startsWith('video/'));

    if (videoFiles.length === 0) {
      toast.error('Bitte nur Videodateien hochladen');
      return;
    }

    // Check file size
    const oversizedFiles = videoFiles.filter(file => file.size > maxSizeMB * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      toast.error(`Maximale Dateigröße: ${maxSizeMB}MB pro Video`);
      return;
    }

    if (value.length + videoFiles.length > maxFiles) {
      toast.error(`Maximal ${maxFiles} Videos erlaubt`);
      return;
    }

    // Create preview URLs and generate thumbnails for new videos
    const newVideos: UploadedVideo[] = await Promise.all(
      videoFiles.map(async (file) => {
        const id = `temp-${Date.now()}-${Math.random()}`;
        const url = URL.createObjectURL(file);
        const thumbnail = await generateThumbnail(file, id);
        
        // Get video duration
        const video = document.createElement('video');
        video.src = url;
        await new Promise(resolve => {
          video.addEventListener('loadedmetadata', resolve);
        });
        const duration = Math.round(video.duration);

        return {
          id,
          url,
          file,
          uploading: false,
          progress: 0,
          duration,
          thumbnail
        };
      })
    );

    onChange([...value, ...newVideos]);
  }, [value, onChange, maxFiles, maxSizeMB, disabled, generateThumbnail]);

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

  const removeVideo = useCallback((id: string) => {
    const videoToRemove = value.find(vid => vid.id === id);
    if (videoToRemove) {
      URL.revokeObjectURL(videoToRemove.url);
    }
    onChange(value.filter(vid => vid.id !== id));
  }, [value, onChange]);

  const moveVideo = useCallback((fromIndex: number, toIndex: number) => {
    const newVideos = [...value];
    const [movedVideo] = newVideos.splice(fromIndex, 1);
    newVideos.splice(toIndex, 0, movedVideo);
    onChange(newVideos);
  }, [value, onChange]);

  const formatFileSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
          accept="video/mp4,video/quicktime,video/avi,video/webm,video/mov"
          multiple
          disabled={disabled || value.length >= maxFiles}
          onChange={(e) => handleFiles(e.target.files)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
        <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-1">
          Videos hier ablegen oder klicken zum Auswählen
        </p>
        <p className="text-xs text-muted-foreground">
          Max. {maxFiles} Videos • Max. {maxSizeMB}MB pro Video
        </p>
      </div>

      {/* Video Grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {value.map((video, index) => (
            <div
              key={video.id}
              className="relative group border rounded-lg overflow-hidden bg-card"
            >
              {/* Thumbnail/Video Preview */}
              <div className="aspect-video bg-muted relative">
                {video.thumbnail ? (
                  <img 
                    src={video.thumbnail} 
                    alt="Video thumbnail" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <VideoIcon className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                
                {/* Duration Badge */}
                {video.duration && (
                  <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                    {formatDuration(video.duration)}
                  </div>
                )}

                {/* Upload Progress */}
                {video.uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="text-center text-white">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                      <Progress value={video.progress || 0} className="w-32" />
                      <p className="text-xs mt-2">{video.progress || 0}%</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Video Info */}
              <div className="p-3">
                <p className="text-sm font-medium truncate">{video.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(video.file.size)}
                </p>
              </div>

              {/* Controls */}
              <div className="absolute top-2 right-2 flex gap-2">
                {/* Drag Handle */}
                {value.length > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
                    onMouseDown={(e) => {
                      const startY = e.clientY;
                      const startIndex = index;
                      
                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        const deltaY = moveEvent.clientY - startY;
                        const threshold = 100;
                        
                        if (Math.abs(deltaY) > threshold) {
                          const newIndex = deltaY > 0 
                            ? Math.min(startIndex + 1, value.length - 1)
                            : Math.max(startIndex - 1, 0);
                          
                          if (newIndex !== startIndex) {
                            moveVideo(startIndex, newIndex);
                          }
                        }
                      };
                      
                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                      };
                      
                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                    }}
                  >
                    <GripVertical className="h-4 w-4" />
                  </Button>
                )}

                {/* Remove Button */}
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeVideo(video.id)}
                  disabled={disabled}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Validation Message */}
      {value.length < minFiles && (
        <p className="text-sm text-destructive">
          Mindestens {minFiles} Video{minFiles > 1 ? 's' : ''} erforderlich
        </p>
      )}
    </div>
  );
}
