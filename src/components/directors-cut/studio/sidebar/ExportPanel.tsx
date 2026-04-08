import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Film } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExportSettings } from '@/types/directors-cut';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ExportPanelProps {
  exportSettings: ExportSettings;
  onExportSettingsChange: (settings: ExportSettings) => void;
  onExport: () => void;
  scenesCount: number;
  videoDuration: number;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  exportSettings,
  onExportSettingsChange,
  onExport,
  scenesCount,
  videoDuration,
}) => {
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-[#00d4ff]" />
          <span className="text-sm font-medium text-white">Export</span>
        </div>

        {/* Project Info */}
        <div className="space-y-2 p-2.5 rounded bg-[#2a2a2a] border border-[#3a3a3a]">
          <div className="flex items-center gap-1.5 mb-1">
            <Film className="h-3 w-3 text-white/40" />
            <span className="text-[11px] text-white/50 font-medium">Projekt-Info</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-white/40">Szenen</span>
            <span className="text-white/70">{scenesCount}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-white/40">Dauer</span>
            <span className="text-white/70">{formatTime(videoDuration)}</span>
          </div>
        </div>

        {/* Quality */}
        <div className="space-y-2">
          <label className="text-xs text-white/50 font-medium">Qualität</label>
          <Select
            value={exportSettings.quality}
            onValueChange={(v) => onExportSettingsChange({ ...exportSettings, quality: v as any })}
          >
            <SelectTrigger className="h-8 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
              <SelectItem value="sd" className="text-white text-xs">SD (480p)</SelectItem>
              <SelectItem value="hd" className="text-white text-xs">HD (720p)</SelectItem>
              <SelectItem value="fhd" className="text-white text-xs">Full HD (1080p)</SelectItem>
              <SelectItem value="4k" className="text-white text-xs">4K (2160p)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Format */}
        <div className="space-y-2">
          <label className="text-xs text-white/50 font-medium">Format</label>
          <Select
            value={exportSettings.format}
            onValueChange={(v) => onExportSettingsChange({ ...exportSettings, format: v as any })}
          >
            <SelectTrigger className="h-8 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
              <SelectItem value="mp4" className="text-white text-xs">MP4</SelectItem>
              <SelectItem value="webm" className="text-white text-xs">WebM</SelectItem>
              <SelectItem value="mov" className="text-white text-xs">MOV</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* FPS */}
        <div className="space-y-2">
          <label className="text-xs text-white/50 font-medium">FPS</label>
          <Select
            value={String(exportSettings.fps)}
            onValueChange={(v) => onExportSettingsChange({ ...exportSettings, fps: Number(v) as any })}
          >
            <SelectTrigger className="h-8 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
              <SelectItem value="24" className="text-white text-xs">24 fps</SelectItem>
              <SelectItem value="30" className="text-white text-xs">30 fps</SelectItem>
              <SelectItem value="60" className="text-white text-xs">60 fps</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-2">
          <label className="text-xs text-white/50 font-medium">Seitenverhältnis</label>
          <Select
            value={exportSettings.aspect_ratio}
            onValueChange={(v) => onExportSettingsChange({ ...exportSettings, aspect_ratio: v as any })}
          >
            <SelectTrigger className="h-8 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
              <SelectItem value="16:9" className="text-white text-xs">16:9 (Widescreen)</SelectItem>
              <SelectItem value="9:16" className="text-white text-xs">9:16 (Portrait)</SelectItem>
              <SelectItem value="1:1" className="text-white text-xs">1:1 (Quadrat)</SelectItem>
              <SelectItem value="4:3" className="text-white text-xs">4:3 (Classic)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Export Button */}
        <Button
          onClick={onExport}
          className="w-full bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white font-semibold"
          size="lg"
        >
          <Download className="h-4 w-4 mr-2" />
          Video exportieren
        </Button>

        <p className="text-[10px] text-white/30 text-center">
          Das Video wird serverseitig gerendert und zum Download bereitgestellt.
        </p>
      </div>
    </ScrollArea>
  );
};
