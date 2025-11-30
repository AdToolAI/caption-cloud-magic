import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FolderOpen, Headphones, Type, Sparkles, Wand2,
  Mic, Music, Volume2, Search, Play, Plus, Loader2
} from 'lucide-react';
import { AudioClip } from '@/types/timeline';
import { AudioEnhancements } from '@/types/directors-cut';
import { cn } from '@/lib/utils';

interface CapCutSidebarProps {
  onAddClip: (trackId: string, clip: Omit<AudioClip, 'id'>) => void;
  audioEnhancements: AudioEnhancements;
  onAudioChange: (enhancements: AudioEnhancements) => void;
}

const MUSIC_PRESETS = [
  { name: 'Upbeat Corporate', duration: 120, mood: 'energetic' },
  { name: 'Calm Piano', duration: 180, mood: 'relaxed' },
  { name: 'Epic Cinematic', duration: 90, mood: 'dramatic' },
  { name: 'Lo-Fi Chill', duration: 150, mood: 'chill' },
  { name: 'Electronic Pop', duration: 135, mood: 'upbeat' },
];

const SFX_PRESETS = [
  { name: 'Whoosh', duration: 1, category: 'transition' },
  { name: 'Click', duration: 0.5, category: 'ui' },
  { name: 'Pop', duration: 0.3, category: 'notification' },
  { name: 'Impact', duration: 1.5, category: 'dramatic' },
  { name: 'Swoosh', duration: 0.8, category: 'transition' },
  { name: 'Ding', duration: 0.6, category: 'notification' },
];

export const CapCutSidebar: React.FC<CapCutSidebarProps> = ({
  onAddClip,
  audioEnhancements,
  onAudioChange,
}) => {
  const [voiceText, setVoiceText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateVoice = async () => {
    if (!voiceText.trim()) return;
    setIsGenerating(true);
    // Simulate AI generation
    setTimeout(() => {
      onAddClip('track-voiceover', {
        trackId: 'track-voiceover',
        name: 'AI Voice',
        url: '',
        startTime: 0,
        duration: 5,
        trimStart: 0,
        trimEnd: 5,
        volume: 100,
        fadeIn: 0,
        fadeOut: 0,
        source: 'ai-generated',
        color: '#f59e0b',
      });
      setIsGenerating(false);
      setVoiceText('');
    }, 2000);
  };

  return (
    <div className="w-64 flex flex-col border-r border-[#2a2a2a] bg-[#1e1e1e]">
      <Tabs defaultValue="audio" className="flex-1 flex flex-col">
        <TabsList className="h-12 grid grid-cols-5 bg-[#242424] rounded-none border-b border-[#2a2a2a] p-0">
          <TabsTrigger 
            value="media" 
            className="rounded-none data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#00d4ff] text-white/60"
          >
            <FolderOpen className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger 
            value="audio"
            className="rounded-none data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#00d4ff] text-white/60"
          >
            <Headphones className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger 
            value="text"
            className="rounded-none data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#00d4ff] text-white/60"
          >
            <Type className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger 
            value="effects"
            className="rounded-none data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#00d4ff] text-white/60"
          >
            <Sparkles className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger 
            value="enhance"
            className="rounded-none data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#00d4ff] text-white/60"
          >
            <Wand2 className="h-4 w-4" />
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          {/* Media Tab */}
          <TabsContent value="media" className="m-0 p-3">
            <div className="text-center text-white/40 py-8">
              <FolderOpen className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Drag media here</p>
            </div>
          </TabsContent>

          {/* Audio Tab */}
          <TabsContent value="audio" className="m-0 p-0">
            {/* AI Voice Section */}
            <div className="p-3 border-b border-[#2a2a2a]">
              <div className="flex items-center gap-2 mb-3">
                <Mic className="h-4 w-4 text-[#00d4ff]" />
                <span className="text-sm font-medium text-white">AI Voice-Over</span>
              </div>
              <textarea
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                placeholder="Enter text for AI voice..."
                className="w-full h-20 bg-[#2a2a2a] border border-[#3a3a3a] rounded-md p-2 text-sm text-white placeholder:text-white/40 resize-none focus:outline-none focus:border-[#00d4ff]"
              />
              <Button 
                className="w-full mt-2 bg-[#00d4ff] hover:bg-[#00b8e0] text-black text-sm h-8"
                onClick={handleGenerateVoice}
                disabled={!voiceText.trim() || isGenerating}
              >
                {isGenerating ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating...</>
                ) : (
                  <><Mic className="h-3.5 w-3.5 mr-1.5" /> Generate Voice</>
                )}
              </Button>
            </div>

            {/* Music Section */}
            <div className="p-3 border-b border-[#2a2a2a]">
              <div className="flex items-center gap-2 mb-3">
                <Music className="h-4 w-4 text-[#00d4ff]" />
                <span className="text-sm font-medium text-white">Music</span>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search music..."
                  className="pl-8 h-8 bg-[#2a2a2a] border-[#3a3a3a] text-sm text-white placeholder:text-white/40"
                />
              </div>
              <div className="space-y-1">
                {MUSIC_PRESETS.map((music, i) => (
                  <button
                    key={i}
                    className="w-full flex items-center gap-2 p-2 rounded hover:bg-[#2a2a2a] transition-colors group"
                    onClick={() => onAddClip('track-music', {
                      trackId: 'track-music',
                      name: music.name,
                      url: '',
                      startTime: 0,
                      duration: music.duration,
                      trimStart: 0,
                      trimEnd: music.duration,
                      volume: 70,
                      fadeIn: 2,
                      fadeOut: 2,
                      source: 'library',
                      color: '#10b981',
                    })}
                  >
                    <div className="w-8 h-8 rounded bg-[#2a2a2a] group-hover:bg-[#3a3a3a] flex items-center justify-center">
                      <Play className="h-3.5 w-3.5 text-white/60" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-xs text-white">{music.name}</p>
                      <p className="text-[10px] text-white/40">{Math.floor(music.duration / 60)}:{(music.duration % 60).toString().padStart(2, '0')}</p>
                    </div>
                    <Plus className="h-4 w-4 text-white/40 opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>

            {/* SFX Section */}
            <div className="p-3">
              <div className="flex items-center gap-2 mb-3">
                <Volume2 className="h-4 w-4 text-[#00d4ff]" />
                <span className="text-sm font-medium text-white">Sound Effects</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {SFX_PRESETS.map((sfx, i) => (
                  <button
                    key={i}
                    className="p-2 rounded bg-[#2a2a2a] hover:bg-[#3a3a3a] transition-colors text-left"
                    onClick={() => onAddClip('track-sfx', {
                      trackId: 'track-sfx',
                      name: sfx.name,
                      url: '',
                      startTime: 0,
                      duration: sfx.duration,
                      trimStart: 0,
                      trimEnd: sfx.duration,
                      volume: 100,
                      fadeIn: 0,
                      fadeOut: 0,
                      source: 'library',
                      color: '#ec4899',
                    })}
                  >
                    <p className="text-xs text-white">{sfx.name}</p>
                    <p className="text-[10px] text-white/40">{sfx.duration}s</p>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Text Tab */}
          <TabsContent value="text" className="m-0 p-3">
            <div className="text-center text-white/40 py-8">
              <Type className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">AI Captions</p>
              <p className="text-xs mt-1">Coming soon</p>
            </div>
          </TabsContent>

          {/* Effects Tab */}
          <TabsContent value="effects" className="m-0 p-3">
            <div className="text-center text-white/40 py-8">
              <Sparkles className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Audio Effects</p>
              <p className="text-xs mt-1">Coming soon</p>
            </div>
          </TabsContent>

          {/* Enhance Tab */}
          <TabsContent value="enhance" className="m-0 p-3 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Wand2 className="h-4 w-4 text-[#00d4ff]" />
              <span className="text-sm font-medium text-white">AI Enhancement</span>
            </div>

            {/* Noise Reduction */}
            <div className="space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-white/70">Noise Reduction</span>
                <input
                  type="checkbox"
                  checked={audioEnhancements.noise_reduction}
                  onChange={(e) => onAudioChange({ ...audioEnhancements, noise_reduction: e.target.checked })}
                  className="w-4 h-4 rounded bg-[#2a2a2a] border-[#3a3a3a]"
                />
              </label>
              {audioEnhancements.noise_reduction && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Level</span>
                    <span className="text-[10px] text-white/40">{audioEnhancements.noise_reduction_level}%</span>
                  </div>
                  <Slider
                    value={[audioEnhancements.noise_reduction_level]}
                    max={100}
                    step={1}
                    onValueChange={([v]) => onAudioChange({ ...audioEnhancements, noise_reduction_level: v })}
                  />
                </>
              )}
            </div>

            {/* Voice Enhancement */}
            <div className="space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-white/70">Voice Clarity</span>
                <input
                  type="checkbox"
                  checked={audioEnhancements.voice_enhancement}
                  onChange={(e) => onAudioChange({ ...audioEnhancements, voice_enhancement: e.target.checked })}
                  className="w-4 h-4 rounded bg-[#2a2a2a] border-[#3a3a3a]"
                />
              </label>
            </div>

            {/* Auto Ducking */}
            <div className="pt-2 border-t border-[#2a2a2a]">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-white/70">Auto-Ducking</span>
                <input
                  type="checkbox"
                  checked={audioEnhancements.auto_ducking}
                  onChange={(e) => onAudioChange({ ...audioEnhancements, auto_ducking: e.target.checked })}
                  className="w-4 h-4 rounded bg-[#2a2a2a] border-[#3a3a3a]"
                />
              </label>
              <p className="text-[10px] text-white/40 mt-1">Lower music when voice plays</p>
              {audioEnhancements.auto_ducking && (
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Ducking Level</span>
                    <span className="text-[10px] text-white/40">{audioEnhancements.ducking_level}%</span>
                  </div>
                  <Slider
                    value={[audioEnhancements.ducking_level]}
                    max={100}
                    step={1}
                    onValueChange={([v]) => onAudioChange({ ...audioEnhancements, ducking_level: v })}
                  />
                </div>
              )}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};
