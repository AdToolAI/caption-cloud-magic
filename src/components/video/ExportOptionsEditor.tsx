import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { FileVideo, FileImage, Film, Smartphone, Monitor, Instagram } from 'lucide-react';

export interface ExportOptions {
  format: 'mp4' | 'webm' | 'gif';
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  quality: '720p' | '1080p' | '4k';
  fps: 24 | 30 | 60;
  includeWatermark: boolean;
  includeEndScreen: boolean;
}

interface ExportOptionsEditorProps {
  options: ExportOptions;
  onChange: (options: ExportOptions) => void;
}

const aspectRatioInfo = {
  '16:9': { icon: Monitor, label: 'YouTube, Desktop', description: 'Standard für YouTube und Desktop' },
  '9:16': { icon: Smartphone, label: 'TikTok, Stories', description: 'Vertikal für Mobile' },
  '1:1': { icon: Instagram, label: 'Instagram Feed', description: 'Quadratisch für Instagram' },
  '4:5': { icon: Film, label: 'Instagram Portrait', description: 'Portrait für Instagram Feed' },
};

export const ExportOptionsEditor = ({ options, onChange }: ExportOptionsEditorProps) => {
  const updateOptions = (updates: Partial<ExportOptions>) => {
    onChange({ ...options, ...updates });
  };

  const AspectRatioIcon = aspectRatioInfo[options.aspectRatio].icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export-Optionen</CardTitle>
        <CardDescription>Wähle Format und Qualität für dein Video</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Format Selection */}
        <div className="space-y-3">
          <Label>Export-Format</Label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => updateOptions({ format: 'mp4' })}
              className={`p-4 border rounded-lg transition-all ${
                options.format === 'mp4' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <FileVideo className="h-6 w-6 mx-auto mb-2" />
              <div className="text-sm font-medium">MP4</div>
              <div className="text-xs text-muted-foreground">Standard</div>
            </button>
            <button
              onClick={() => updateOptions({ format: 'webm' })}
              className={`p-4 border rounded-lg transition-all ${
                options.format === 'webm' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <Film className="h-6 w-6 mx-auto mb-2" />
              <div className="text-sm font-medium">WebM</div>
              <div className="text-xs text-muted-foreground">Web-optimiert</div>
            </button>
            <button
              onClick={() => updateOptions({ format: 'gif' })}
              className={`p-4 border rounded-lg transition-all ${
                options.format === 'gif' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <FileImage className="h-6 w-6 mx-auto mb-2" />
              <div className="text-sm font-medium">GIF</div>
              <div className="text-xs text-muted-foreground">Preview</div>
            </button>
          </div>
        </div>

        <Separator />

        {/* Aspect Ratio */}
        <div className="space-y-3">
          <Label>Seitenverhältnis</Label>
          <Select value={options.aspectRatio} onValueChange={(value) => updateOptions({ aspectRatio: value as ExportOptions['aspectRatio'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(aspectRatioInfo).map(([ratio, info]) => {
                const Icon = info.icon;
                return (
                  <SelectItem key={ratio} value={ratio}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span>{ratio} - {info.label}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <AspectRatioIcon className="h-5 w-5 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {aspectRatioInfo[options.aspectRatio].description}
            </div>
          </div>
        </div>

        {/* Quality (only for video formats) */}
        {options.format !== 'gif' && (
          <div className="space-y-2">
            <Label>Qualität</Label>
            <Select value={options.quality} onValueChange={(value) => updateOptions({ quality: value as ExportOptions['quality'] })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="720p">
                  HD (720p)
                  <Badge variant="secondary" className="ml-2">Schnell</Badge>
                </SelectItem>
                <SelectItem value="1080p">
                  Full HD (1080p)
                  <Badge variant="secondary" className="ml-2">Empfohlen</Badge>
                </SelectItem>
                <SelectItem value="4k">
                  4K (2160p)
                  <Badge variant="secondary" className="ml-2">Premium</Badge>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* FPS (only for video formats) */}
        {options.format !== 'gif' && (
          <div className="space-y-2">
            <Label>Framerate (FPS)</Label>
            <Select value={String(options.fps)} onValueChange={(value) => updateOptions({ fps: Number(value) as ExportOptions['fps'] })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">24 FPS (Cinematic)</SelectItem>
                <SelectItem value="30">30 FPS (Standard)</SelectItem>
                <SelectItem value="60">60 FPS (Smooth)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <Separator />

        {/* Additional Options */}
        <div className="space-y-4">
          <Label>Zusätzliche Optionen</Label>
          
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <div className="font-medium text-sm">Wasserzeichen</div>
              <div className="text-xs text-muted-foreground">Logo im Video anzeigen</div>
            </div>
            <Switch
              checked={options.includeWatermark}
              onCheckedChange={(checked) => updateOptions({ includeWatermark: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <div className="font-medium text-sm">Ende-Screen</div>
              <div className="text-xs text-muted-foreground">CTA und Logo am Ende</div>
            </div>
            <Switch
              checked={options.includeEndScreen}
              onCheckedChange={(checked) => updateOptions({ includeEndScreen: checked })}
            />
          </div>
        </div>

        {/* File Size Estimate */}
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Geschätzte Dateigröße:</span>
            <span className="font-medium">
              {options.format === 'gif' ? '~2-5 MB' : 
               options.quality === '4k' ? '~50-100 MB' :
               options.quality === '1080p' ? '~20-40 MB' : '~10-20 MB'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
