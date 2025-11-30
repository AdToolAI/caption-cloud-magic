import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  X, Mic, Music, Volume1, Sparkles, Film, Palette,
  Wand2, Waves, AudioLines, Zap, Brain, Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SceneAnalysis } from '@/types/directors-cut';
import { AudioClip } from '@/types/timeline';

interface FloatingAIPanelProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onClose: () => void;
  audioEnhancements: any;
  onAudioChange: (enhancements: any) => void;
  scenes: SceneAnalysis[];
  currentTime: number;
  onAddClip: (trackId: string, clip: Omit<AudioClip, 'id' | 'trackId'>) => void;
}

const AI_TABS = [
  { id: 'voice', icon: Mic, label: 'Voice' },
  { id: 'music', icon: Music, label: 'Music' },
  { id: 'sfx', icon: Volume1, label: 'SFX' },
  { id: 'ai', icon: Sparkles, label: 'AI' },
  { id: 'scenes', icon: Film, label: 'Scenes' },
  { id: 'fx', icon: Palette, label: 'FX' },
];

export function FloatingAIPanel({
  activeTab,
  onTabChange,
  onClose,
  audioEnhancements,
  onAudioChange,
  scenes,
  currentTime,
  onAddClip,
}: FloatingAIPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="w-80 h-full flex flex-col border-l border-white/10"
    >
      {/* Glass Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-2xl" />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.5)]">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">AI Tools</span>
          </div>
          <motion.button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={onTabChange} className="flex-1 flex flex-col">
          <TabsList className="grid grid-cols-6 gap-1 p-2 bg-transparent">
            {AI_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg transition-all data-[state=active]:bg-violet-600/30 data-[state=active]:text-violet-300 data-[state=active]:shadow-[0_0_10px_rgba(139,92,246,0.3)]",
                  "text-white/50 hover:text-white/80 hover:bg-white/5"
                )}
              >
                <tab.icon className="h-4 w-4" />
                <span className="text-[10px]">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Voice Tab */}
            <TabsContent value="voice" className="mt-0 space-y-4">
              <AIVoicePanel onAddClip={onAddClip} currentTime={currentTime} />
            </TabsContent>

            {/* Music Tab */}
            <TabsContent value="music" className="mt-0 space-y-4">
              <AIMusicPanel onAddClip={onAddClip} currentTime={currentTime} />
            </TabsContent>

            {/* SFX Tab */}
            <TabsContent value="sfx" className="mt-0 space-y-4">
              <AISFXPanel onAddClip={onAddClip} currentTime={currentTime} scenes={scenes} />
            </TabsContent>

            {/* AI Enhancement Tab */}
            <TabsContent value="ai" className="mt-0 space-y-4">
              <AIEnhancementPanel 
                audioEnhancements={audioEnhancements}
                onAudioChange={onAudioChange}
              />
            </TabsContent>

            {/* Scenes Tab */}
            <TabsContent value="scenes" className="mt-0 space-y-4">
              <AIScenesPanel scenes={scenes} />
            </TabsContent>

            {/* FX Tab */}
            <TabsContent value="fx" className="mt-0 space-y-4">
              <AIFXPanel />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </motion.div>
  );
}

// Voice Panel
function AIVoicePanel({ onAddClip, currentTime }: { onAddClip: (trackId: string, clip: any) => void; currentTime: number }) {
  const [voiceText, setVoiceText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('sarah');
  const [isGenerating, setIsGenerating] = useState(false);

  const VOICES = [
    { id: 'sarah', name: 'Sarah', desc: 'Warm & Professional' },
    { id: 'brian', name: 'Brian', desc: 'Deep & Authoritative' },
    { id: 'lily', name: 'Lily', desc: 'Friendly & Energetic' },
    { id: 'george', name: 'George', desc: 'British & Sophisticated' },
  ];

  const handleGenerate = async () => {
    if (!voiceText.trim()) return;
    setIsGenerating(true);
    // Simulate generation
    setTimeout(() => {
      onAddClip('track-voiceover', {
        name: voiceText.slice(0, 20) + '...',
        url: '',
        startTime: currentTime,
        duration: 5,
        trimStart: 0,
        trimEnd: 5,
        volume: 100,
        fadeIn: 0.2,
        fadeOut: 0.2,
        source: 'ai-generated' as const,
      });
      setIsGenerating(false);
      setVoiceText('');
    }, 2000);
  };

  return (
    <div className="space-y-4">
      <GlassCard>
        <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Mic className="h-4 w-4 text-violet-400" />
          AI Voice-Over
        </h3>
        
        <Textarea
          value={voiceText}
          onChange={(e) => setVoiceText(e.target.value)}
          placeholder="Enter text for voice-over..."
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
          rows={3}
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          {VOICES.map((voice) => (
            <motion.button
              key={voice.id}
              onClick={() => setSelectedVoice(voice.id)}
              className={cn(
                "p-2 rounded-lg border text-left transition-all",
                selectedVoice === voice.id
                  ? "border-violet-500 bg-violet-500/20 shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="text-xs font-medium text-white">{voice.name}</div>
              <div className="text-[10px] text-white/50">{voice.desc}</div>
            </motion.button>
          ))}
        </div>

        <NeonButton 
          onClick={handleGenerate} 
          loading={isGenerating}
          className="w-full mt-3"
        >
          <Wand2 className="h-4 w-4 mr-2" />
          Generate Voice
        </NeonButton>
      </GlassCard>
    </div>
  );
}

// Music Panel
function AIMusicPanel({ onAddClip, currentTime }: { onAddClip: (trackId: string, clip: any) => void; currentTime: number }) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const MOODS = ['Epic', 'Chill', 'Upbeat', 'Emotional', 'Corporate', 'Cinematic'];

  return (
    <div className="space-y-4">
      <GlassCard>
        <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Music className="h-4 w-4 text-emerald-400" />
          AI Music Search
        </h3>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search music..."
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 text-sm"
        />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {MOODS.map((mood) => (
            <motion.button
              key={mood}
              className="px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-white/70 hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:text-emerald-300 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {mood}
            </motion.button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {['Epic Cinematic Rise', 'Corporate Success', 'Chill Lofi Beat'].map((track, i) => (
            <motion.div
              key={track}
              className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer group"
              whileHover={{ x: 2 }}
            >
              <div className="w-8 h-8 rounded bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 flex items-center justify-center">
                <Music className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-white font-medium">{track}</div>
                <div className="text-[10px] text-white/50">2:34 • Royalty Free</div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 h-7 px-2"
                onClick={() => onAddClip('track-music', {
                  name: track,
                  url: '',
                  startTime: currentTime,
                  duration: 154,
                  trimStart: 0,
                  trimEnd: 154,
                  volume: 70,
                  fadeIn: 1,
                  fadeOut: 1,
                  source: 'library' as const,
                })}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </motion.div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

// SFX Panel
function AISFXPanel({ onAddClip, currentTime, scenes }: { onAddClip: (trackId: string, clip: any) => void; currentTime: number; scenes: SceneAnalysis[] }) {
  const SFX_CATEGORIES = [
    { name: 'Whoosh', icon: '💨' },
    { name: 'Impact', icon: '💥' },
    { name: 'Pop', icon: '🎈' },
    { name: 'Click', icon: '👆' },
    { name: 'Swipe', icon: '👋' },
    { name: 'Notification', icon: '🔔' },
  ];

  return (
    <div className="space-y-4">
      <GlassCard>
        <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Volume1 className="h-4 w-4 text-pink-400" />
          Sound Effects
        </h3>

        <div className="grid grid-cols-3 gap-2">
          {SFX_CATEGORIES.map((sfx) => (
            <motion.button
              key={sfx.name}
              className="p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-pink-500/20 hover:border-pink-500/50 transition-all flex flex-col items-center gap-1"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onAddClip('track-sfx', {
                name: sfx.name,
                url: '',
                startTime: currentTime,
                duration: 0.5,
                trimStart: 0,
                trimEnd: 0.5,
                volume: 100,
                fadeIn: 0,
                fadeOut: 0.1,
                source: 'library' as const,
              })}
            >
              <span className="text-xl">{sfx.icon}</span>
              <span className="text-[10px] text-white/70">{sfx.name}</span>
            </motion.button>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Brain className="h-4 w-4 text-cyan-400" />
          AI Auto-SFX
        </h3>
        <p className="text-xs text-white/50 mb-3">
          Automatically add sound effects based on scene content
        </p>
        <NeonButton className="w-full">
          <Zap className="h-4 w-4 mr-2" />
          Generate SFX for All Scenes
        </NeonButton>
      </GlassCard>
    </div>
  );
}

// Enhancement Panel
function AIEnhancementPanel({ audioEnhancements, onAudioChange }: { audioEnhancements: any; onAudioChange: (enhancements: any) => void }) {
  return (
    <div className="space-y-4">
      <GlassCard>
        <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Waves className="h-4 w-4 text-cyan-400" />
          Noise Reduction
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-white/70">Enable</Label>
            <Switch 
              checked={audioEnhancements?.noiseReduction?.enabled}
              onCheckedChange={(checked) => onAudioChange({
                ...audioEnhancements,
                noiseReduction: { ...audioEnhancements?.noiseReduction, enabled: checked }
              })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-white/50">Strength</Label>
            <Slider
              value={[audioEnhancements?.noiseReduction?.strength || 50]}
              onValueChange={([v]) => onAudioChange({
                ...audioEnhancements,
                noiseReduction: { ...audioEnhancements?.noiseReduction, strength: v }
              })}
              max={100}
              className="cursor-pointer"
            />
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <AudioLines className="h-4 w-4 text-amber-400" />
          Voice Enhancement
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-white/70">Enable</Label>
            <Switch 
              checked={audioEnhancements?.voiceEnhancement?.enabled}
              onCheckedChange={(checked) => onAudioChange({
                ...audioEnhancements,
                voiceEnhancement: { ...audioEnhancements?.voiceEnhancement, enabled: checked }
              })}
            />
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-violet-400" />
          Auto-Ducking
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-white/70">Enable</Label>
            <Switch 
              checked={audioEnhancements?.autoDucking?.enabled}
              onCheckedChange={(checked) => onAudioChange({
                ...audioEnhancements,
                autoDucking: { ...audioEnhancements?.autoDucking, enabled: checked }
              })}
            />
          </div>
          <p className="text-[10px] text-white/40">
            Automatically lower music when voice is detected
          </p>
        </div>
      </GlassCard>
    </div>
  );
}

// Scenes Panel
function AIScenesPanel({ scenes }: { scenes: SceneAnalysis[] }) {
  return (
    <div className="space-y-4">
      <GlassCard>
        <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Film className="h-4 w-4 text-violet-400" />
          Scene Analysis
        </h3>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {scenes.map((scene, index) => (
            <div key={scene.id} className="p-2 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-violet-400">#{index + 1}</span>
                <span className="text-xs text-white/80 truncate flex-1">
                  {scene.description || `Scene ${index + 1}`}
                </span>
              </div>
              <div className="text-[10px] text-white/40 mt-1">
                {scene.start_time.toFixed(1)}s - {scene.end_time.toFixed(1)}s
              </div>
            </div>
          ))}
        </div>
        <NeonButton className="w-full mt-3">
          <Sparkles className="h-4 w-4 mr-2" />
          Re-Analyze Scenes
        </NeonButton>
      </GlassCard>
    </div>
  );
}

// FX Panel
function AIFXPanel() {
  const PRESETS = [
    { name: 'Radio', desc: 'AM radio effect' },
    { name: 'Phone', desc: 'Phone call effect' },
    { name: 'Echo', desc: 'Large room echo' },
    { name: 'Underwater', desc: 'Muffled underwater' },
  ];

  return (
    <div className="space-y-4">
      <GlassCard>
        <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-pink-400" />
          Audio Effects
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => (
            <motion.button
              key={preset.name}
              className="p-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-pink-500/20 hover:border-pink-500/50 transition-all text-left"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="text-xs font-medium text-white">{preset.name}</div>
              <div className="text-[10px] text-white/50">{preset.desc}</div>
            </motion.button>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

// Utility Components
function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded-xl p-4 bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 backdrop-blur-sm",
      className
    )}>
      {children}
    </div>
  );
}

function NeonButton({ 
  children, 
  onClick, 
  loading = false,
  className 
}: { 
  children: React.ReactNode; 
  onClick?: () => void;
  loading?: boolean;
  className?: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "px-4 py-2 rounded-lg font-medium text-sm flex items-center justify-center",
        "bg-gradient-to-r from-violet-600 to-purple-600 text-white",
        "shadow-[0_0_20px_rgba(139,92,246,0.4)]",
        "hover:shadow-[0_0_30px_rgba(139,92,246,0.6)]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "transition-all",
        className
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : children}
    </motion.button>
  );
}
