import { Settings } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export interface RenderingOptions {
  quality: '720p' | '1080p' | '4k';
  format: 'mp4' | 'mov' | 'webm';
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  framerate: 24 | 30 | 60;
}

interface RenderingOptionsSelectorProps {
  value: RenderingOptions;
  onChange: (options: RenderingOptions) => void;
}

export const RenderingOptionsSelector = ({ value, onChange }: RenderingOptionsSelectorProps) => {
  const calculateCredits = () => {
    let credits = 50; // Base cost
    
    if (value.quality === '4k') credits = 100;
    else if (value.quality === '1080p') credits = 50;
    else credits = 30; // 720p
    
    if (value.format === 'webm') credits += 10;
    if (value.framerate === 60) credits += 20;
    
    return credits;
  };

  return (
    <Collapsible className="space-y-2">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
        <Settings className="h-4 w-4" />
        Erweiterte Optionen
        <Badge variant="secondary" className="ml-auto">
          {calculateCredits()} Credits
        </Badge>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label>Qualität</Label>
          <Select 
            value={value.quality} 
            onValueChange={(q) => onChange({ ...value, quality: q as RenderingOptions['quality'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="720p">HD (720p) - 30 Credits</SelectItem>
              <SelectItem value="1080p">Full HD (1080p) - 50 Credits</SelectItem>
              <SelectItem value="4k">4K - 100 Credits</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Format</Label>
          <Select 
            value={value.format} 
            onValueChange={(f) => onChange({ ...value, format: f as RenderingOptions['format'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mp4">MP4 (Standard)</SelectItem>
              <SelectItem value="mov">MOV (Apple) +0 Credits</SelectItem>
              <SelectItem value="webm">WebM +10 Credits</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Seitenverhältnis</Label>
          <Select 
            value={value.aspectRatio} 
            onValueChange={(a) => onChange({ ...value, aspectRatio: a as RenderingOptions['aspectRatio'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
              <SelectItem value="9:16">9:16 (Stories)</SelectItem>
              <SelectItem value="1:1">1:1 (Quadrat)</SelectItem>
              <SelectItem value="4:5">4:5 (Instagram)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Framerate</Label>
          <Select 
            value={String(value.framerate)} 
            onValueChange={(fr) => onChange({ ...value, framerate: Number(fr) as RenderingOptions['framerate'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24">24 fps (Cinematic)</SelectItem>
              <SelectItem value="30">30 fps (Standard)</SelectItem>
              <SelectItem value="60">60 fps (Smooth) +20 Credits</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
