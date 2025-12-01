import React from 'react';
import { AudioTrack, AudioClip, SubtitleClip, DEFAULT_SUBTITLE_STYLE } from '@/types/timeline';
import { AudioEnhancements } from '@/types/directors-cut';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Volume2, Clock, Scissors, Music, MessageSquare, Trash2, Type, AlignVerticalJustifyCenter, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CapCutPropertiesPanelProps {
  selectedClip: AudioClip | undefined;
  audioTracks: AudioTrack[];
  onTracksChange: (tracks: AudioTrack[]) => void;
  audioEnhancements: AudioEnhancements;
  onAudioChange: (enhancements: AudioEnhancements) => void;
  selectedSubtitle?: SubtitleClip;
  onSubtitleUpdate?: (clipId: string, updates: Partial<SubtitleClip>) => void;
  onSubtitleDelete?: (clipId: string) => void;
  onClipDelete?: (clipId: string) => void;
}

const SUBTITLE_STYLES = [
  { id: 'standard', label: 'Standard' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'subtitle', label: 'Untertitel' },
  { id: 'highlight', label: 'Highlight' },
] as const;

export const CapCutPropertiesPanel: React.FC<CapCutPropertiesPanelProps> = ({
  selectedClip,
  audioTracks,
  onTracksChange,
  audioEnhancements,
  onAudioChange,
  selectedSubtitle,
  onSubtitleUpdate,
  onSubtitleDelete,
  onClipDelete,
}) => {
  const updateClip = (updates: Partial<AudioClip>) => {
    if (!selectedClip) return;
    onTracksChange(
      audioTracks.map(track => ({
        ...track,
        clips: track.clips.map(clip =>
          clip.id === selectedClip.id ? { ...clip, ...updates } : clip
        ),
      }))
    );
  };

  return (
    <div className="w-64 flex flex-col border-l border-[#2a2a2a] bg-[#1e1e1e]">
      <div className="h-10 flex items-center px-3 border-b border-[#2a2a2a] bg-[#242424]">
        <span className="text-xs text-white/60">Properties</span>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {selectedSubtitle ? (
          <div className="space-y-4">
            {/* Subtitle Header */}
            <div className="flex items-center gap-2 pb-2 border-b border-[#3a3a3a]">
              <MessageSquare className="h-4 w-4 text-purple-400" />
              <span className="text-sm text-white font-medium">Untertitel</span>
            </div>
            
            {/* Text Input */}
            <div>
              <label className="text-xs text-white/60 block mb-1.5">Text</label>
              <Textarea
                value={selectedSubtitle.text}
                onChange={(e) => onSubtitleUpdate?.(selectedSubtitle.id, { text: e.target.value })}
                placeholder="Untertitel-Text eingeben..."
                className="min-h-[80px] bg-[#2a2a2a] border-[#3a3a3a] text-sm text-white resize-none"
              />
            </div>
            
            {/* Timing */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-3.5 w-3.5 text-purple-400" />
                <label className="text-xs text-white/60">Timing</label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/40 block mb-1">Start (Sek)</label>
                  <Input
                    type="number"
                    value={selectedSubtitle.startTime.toFixed(1)}
                    onChange={(e) => onSubtitleUpdate?.(selectedSubtitle.id, { 
                      startTime: Math.max(0, parseFloat(e.target.value) || 0)
                    })}
                    className="h-7 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white"
                    step={0.1}
                    min={0}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 block mb-1">Ende (Sek)</label>
                  <Input
                    type="number"
                    value={selectedSubtitle.endTime.toFixed(1)}
                    onChange={(e) => onSubtitleUpdate?.(selectedSubtitle.id, { 
                      endTime: Math.max(0.1, parseFloat(e.target.value) || 0.1)
                    })}
                    className="h-7 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white"
                    step={0.1}
                    min={0.1}
                  />
                </div>
              </div>
            </div>
            
            {/* Duration (calculated) */}
            <div className="flex justify-between text-xs text-white/50 bg-[#2a2a2a] px-2 py-1.5 rounded">
              <span>Dauer:</span>
              <span>{Math.max(0, selectedSubtitle.endTime - selectedSubtitle.startTime).toFixed(1)}s</span>
            </div>
            
            {/* Style Selector */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Type className="h-3.5 w-3.5 text-purple-400" />
                <label className="text-xs text-white/60">Stil</label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SUBTITLE_STYLES.map(style => (
                  <button
                    key={style.id}
                    onClick={() => onSubtitleUpdate?.(selectedSubtitle.id, { style: style.id })}
                    className={cn(
                      "px-2 py-1.5 rounded text-xs transition-colors",
                      selectedSubtitle.style === style.id 
                        ? "bg-purple-600 text-white" 
                        : "bg-[#2a2a2a] text-white/60 hover:bg-[#3a3a3a]"
                    )}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Position Selector */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlignVerticalJustifyCenter className="h-3.5 w-3.5 text-purple-400" />
                <label className="text-xs text-white/60">Position</label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['top', 'center', 'bottom'] as const).map(pos => (
                  <button
                    key={pos}
                    onClick={() => onSubtitleUpdate?.(selectedSubtitle.id, { position: pos })}
                    className={cn(
                      "px-2 py-1.5 rounded text-xs transition-colors",
                      (selectedSubtitle.position || DEFAULT_SUBTITLE_STYLE.position) === pos 
                        ? "bg-purple-600 text-white" 
                        : "bg-[#2a2a2a] text-white/60 hover:bg-[#3a3a3a]"
                    )}
                  >
                    {pos === 'top' ? 'Oben' : pos === 'center' ? 'Mitte' : 'Unten'}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div>
              <label className="text-xs text-white/60 block mb-2">Schriftgröße</label>
              <div className="grid grid-cols-4 gap-1">
                {([
                  { id: 'small', label: 'S' },
                  { id: 'medium', label: 'M' },
                  { id: 'large', label: 'L' },
                  { id: 'xl', label: 'XL' },
                ] as const).map(size => (
                  <button
                    key={size.id}
                    onClick={() => onSubtitleUpdate?.(selectedSubtitle.id, { fontSize: size.id })}
                    className={cn(
                      "px-2 py-1.5 rounded text-xs transition-colors",
                      (selectedSubtitle.fontSize || DEFAULT_SUBTITLE_STYLE.fontSize) === size.id 
                        ? "bg-purple-600 text-white" 
                        : "bg-[#2a2a2a] text-white/60 hover:bg-[#3a3a3a]"
                    )}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Palette className="h-3.5 w-3.5 text-purple-400" />
                <label className="text-xs text-white/60">Farben</label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-white/40 block mb-1.5">Text</label>
                  <input 
                    type="color" 
                    value={selectedSubtitle.color || DEFAULT_SUBTITLE_STYLE.color}
                    onChange={(e) => onSubtitleUpdate?.(selectedSubtitle.id, { color: e.target.value })}
                    className="w-full h-8 rounded cursor-pointer bg-[#2a2a2a] border border-[#3a3a3a]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 block mb-1.5">Hintergrund</label>
                  <input 
                    type="color" 
                    value={(selectedSubtitle.backgroundColor || DEFAULT_SUBTITLE_STYLE.backgroundColor).slice(0, 7)}
                    onChange={(e) => onSubtitleUpdate?.(selectedSubtitle.id, { 
                      backgroundColor: e.target.value + 'CC'
                    })}
                    className="w-full h-8 rounded cursor-pointer bg-[#2a2a2a] border border-[#3a3a3a]"
                  />
                </div>
              </div>
            </div>

            {/* Font Family */}
            <div>
              <label className="text-xs text-white/60 block mb-1.5">Schriftart</label>
              <Select
                value={selectedSubtitle.fontFamily || DEFAULT_SUBTITLE_STYLE.fontFamily}
                onValueChange={(value) => onSubtitleUpdate?.(selectedSubtitle.id, { fontFamily: value })}
              >
                <SelectTrigger className="h-8 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inter">Inter (Standard)</SelectItem>
                  <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                  <SelectItem value="Georgia, serif">Georgia</SelectItem>
                  <SelectItem value="Impact, sans-serif">Impact</SelectItem>
                  <SelectItem value="Courier New, monospace">Courier New</SelectItem>
                  <SelectItem value="Comic Sans MS, cursive">Comic Sans</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Max Lines */}
            <div>
              <label className="text-xs text-white/60 block mb-2">Max. Zeilen</label>
              <div className="grid grid-cols-2 gap-2">
                {([2, 3] as const).map(lines => (
                  <button
                    key={lines}
                    onClick={() => onSubtitleUpdate?.(selectedSubtitle.id, { maxLines: lines })}
                    className={cn(
                      "px-2 py-1.5 rounded text-xs transition-colors",
                      (selectedSubtitle.maxLines || DEFAULT_SUBTITLE_STYLE.maxLines) === lines 
                        ? "bg-purple-600 text-white" 
                        : "bg-[#2a2a2a] text-white/60 hover:bg-[#3a3a3a]"
                    )}
                  >
                    {lines} Zeilen
                  </button>
                ))}
              </div>
            </div>

            {/* Text Outline / Umrandung */}
            <div>
              <label className="text-xs text-white/60 block mb-2">Umrandung</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onSubtitleUpdate?.(selectedSubtitle.id, { 
                    textStroke: !selectedSubtitle.textStroke 
                  })}
                  className={cn(
                    "px-3 py-1.5 rounded text-xs transition-colors",
                    selectedSubtitle.textStroke 
                      ? "bg-purple-600 text-white" 
                      : "bg-[#2a2a2a] text-white/60 hover:bg-[#3a3a3a]"
                  )}
                >
                  {selectedSubtitle.textStroke ? 'Ein' : 'Aus'}
                </button>
                
                {selectedSubtitle.textStroke && (
                  <input 
                    type="color" 
                    value={selectedSubtitle.textStrokeColor || DEFAULT_SUBTITLE_STYLE.textStrokeColor}
                    onChange={(e) => onSubtitleUpdate?.(selectedSubtitle.id, { 
                      textStrokeColor: e.target.value 
                    })}
                    className="w-8 h-8 rounded cursor-pointer bg-[#2a2a2a] border border-[#3a3a3a]"
                    title="Umrandungsfarbe"
                  />
                )}
              </div>
            </div>
            
            {/* Delete Button */}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onSubtitleDelete?.(selectedSubtitle.id)}
              className="w-full mt-4"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Untertitel löschen
            </Button>
          </div>
        ) : selectedClip ? (
          <div className="space-y-4">
            {/* Clip Name */}
            <div>
              <label className="text-xs text-white/60 block mb-1.5">Name</label>
              <Input
                value={selectedClip.name}
                onChange={(e) => updateClip({ name: e.target.value })}
                className="h-8 bg-[#2a2a2a] border-[#3a3a3a] text-sm text-white"
              />
            </div>

            {/* Volume */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Volume2 className="h-3.5 w-3.5 text-[#00d4ff]" />
                <label className="text-xs text-white/60">Volume</label>
                <span className="text-xs text-white/40 ml-auto">{selectedClip.volume}%</span>
              </div>
              <Slider
                value={[selectedClip.volume]}
                max={150}
                step={1}
                onValueChange={([v]) => updateClip({ volume: v })}
              />
            </div>

            {/* Timing */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-3.5 w-3.5 text-[#00d4ff]" />
                <label className="text-xs text-white/60">Timing</label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/40 block mb-1">Start</label>
                  <Input
                    type="number"
                    value={selectedClip.startTime.toFixed(1)}
                    onChange={(e) => updateClip({ startTime: parseFloat(e.target.value) || 0 })}
                    className="h-7 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white"
                    step={0.1}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 block mb-1">Duration</label>
                  <Input
                    type="number"
                    value={selectedClip.duration.toFixed(1)}
                    onChange={(e) => updateClip({ duration: parseFloat(e.target.value) || 1 })}
                    className="h-7 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white"
                    step={0.1}
                    min={0.1}
                  />
                </div>
              </div>
            </div>

            {/* Fade */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Music className="h-3.5 w-3.5 text-[#00d4ff]" />
                <label className="text-xs text-white/60">Fade</label>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-white/40">Fade In</span>
                    <span className="text-[10px] text-white/40">{selectedClip.fadeIn}s</span>
                  </div>
                  <Slider
                    value={[selectedClip.fadeIn]}
                    max={5}
                    step={0.1}
                    onValueChange={([v]) => updateClip({ fadeIn: v })}
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-white/40">Fade Out</span>
                    <span className="text-[10px] text-white/40">{selectedClip.fadeOut}s</span>
                  </div>
                  <Slider
                    value={[selectedClip.fadeOut]}
                    max={5}
                    step={0.1}
                    onValueChange={([v]) => updateClip({ fadeOut: v })}
                  />
                </div>
              </div>
            </div>

            {/* Trim */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Scissors className="h-3.5 w-3.5 text-[#00d4ff]" />
                <label className="text-xs text-white/60">Trim</label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/40 block mb-1">Trim Start</label>
                  <Input
                    type="number"
                    value={selectedClip.trimStart.toFixed(1)}
                    onChange={(e) => updateClip({ trimStart: parseFloat(e.target.value) || 0 })}
                    className="h-7 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white"
                    step={0.1}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 block mb-1">Trim End</label>
                  <Input
                    type="number"
                    value={selectedClip.trimEnd.toFixed(1)}
                    onChange={(e) => updateClip({ trimEnd: parseFloat(e.target.value) || 0 })}
                    className="h-7 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white"
                    step={0.1}
                  />
                </div>
              </div>
            </div>

            {/* Delete Audio Clip Button */}
            {onClipDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onClipDelete(selectedClip.id)}
                className="w-full mt-4"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {selectedClip.source === 'original' ? 'Original Audio entfernen' : 
                 selectedClip.source === 'ai-generated' ? 'Voice-Over entfernen' : 
                 'Audio-Clip löschen'}
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-[#2a2a2a] flex items-center justify-center mx-auto mb-3">
              <Volume2 className="h-5 w-5 text-white/40" />
            </div>
            <p className="text-xs text-white/40">Select a clip to edit</p>
          </div>
        )}
      </div>

      {/* Project Audio Settings */}
      <div className="border-t border-[#2a2a2a] p-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-white/60">Master Volume</span>
          <span className="text-xs text-white/40 ml-auto">{audioEnhancements.master_volume}%</span>
        </div>
        <Slider
          value={[audioEnhancements.master_volume]}
          max={150}
          step={1}
          onValueChange={([v]) => onAudioChange({ ...audioEnhancements, master_volume: v })}
        />
      </div>
    </div>
  );
};
