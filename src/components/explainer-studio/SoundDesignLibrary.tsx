import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Music, Play, Pause, Volume2, Plus, Check, Search,
  Zap, Wind, Bell, MousePointerClick, Sparkles, ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ScriptScene } from '@/types/explainer-studio';

// Sound effect categories
export type SoundCategory = 'transition' | 'ui' | 'ambient' | 'impact' | 'whoosh' | 'notification';

export interface SoundEffect {
  id: string;
  name: string;
  category: SoundCategory;
  duration: number; // in seconds
  tags: string[];
  previewUrl?: string;
}

// Sound effects library
const SOUND_EFFECTS: SoundEffect[] = [
  // Transitions
  { id: 'whoosh-soft', name: 'Whoosh Soft', category: 'whoosh', duration: 0.5, tags: ['smooth', 'subtle'] },
  { id: 'whoosh-fast', name: 'Whoosh Fast', category: 'whoosh', duration: 0.3, tags: ['quick', 'dynamic'] },
  { id: 'swoosh-magic', name: 'Magic Swoosh', category: 'whoosh', duration: 0.6, tags: ['magical', 'sparkle'] },
  { id: 'transition-modern', name: 'Modern Transition', category: 'transition', duration: 0.4, tags: ['tech', 'clean'] },
  { id: 'transition-glitch', name: 'Glitch Transition', category: 'transition', duration: 0.5, tags: ['digital', 'tech'] },
  { id: 'transition-paper', name: 'Paper Slide', category: 'transition', duration: 0.6, tags: ['organic', 'soft'] },
  
  // UI Sounds
  { id: 'click-soft', name: 'Soft Click', category: 'ui', duration: 0.1, tags: ['button', 'subtle'] },
  { id: 'click-pop', name: 'Pop Click', category: 'ui', duration: 0.15, tags: ['fun', 'playful'] },
  { id: 'typing-keyboard', name: 'Keyboard Typing', category: 'ui', duration: 1.0, tags: ['tech', 'work'] },
  { id: 'notification-ding', name: 'Notification Ding', category: 'notification', duration: 0.3, tags: ['alert', 'attention'] },
  { id: 'success-chime', name: 'Success Chime', category: 'notification', duration: 0.5, tags: ['positive', 'achievement'] },
  { id: 'error-buzz', name: 'Error Buzz', category: 'notification', duration: 0.3, tags: ['negative', 'warning'] },
  
  // Ambient
  { id: 'ambient-office', name: 'Office Ambience', category: 'ambient', duration: 10.0, tags: ['work', 'background'] },
  { id: 'ambient-nature', name: 'Nature Sounds', category: 'ambient', duration: 10.0, tags: ['calm', 'outdoor'] },
  { id: 'ambient-city', name: 'City Ambience', category: 'ambient', duration: 10.0, tags: ['urban', 'busy'] },
  { id: 'ambient-tech', name: 'Tech Ambience', category: 'ambient', duration: 10.0, tags: ['futuristic', 'digital'] },
  
  // Impact
  { id: 'impact-boom', name: 'Boom Impact', category: 'impact', duration: 0.8, tags: ['dramatic', 'strong'] },
  { id: 'impact-punch', name: 'Punch', category: 'impact', duration: 0.3, tags: ['action', 'powerful'] },
  { id: 'impact-bass', name: 'Bass Drop', category: 'impact', duration: 0.5, tags: ['music', 'dramatic'] },
  { id: 'impact-reveal', name: 'Reveal Stinger', category: 'impact', duration: 1.0, tags: ['dramatic', 'highlight'] },
];

// Scene type to sound suggestions mapping
const SCENE_SOUND_SUGGESTIONS: Record<string, string[]> = {
  'hook': ['impact-reveal', 'whoosh-fast', 'notification-ding'],
  'problem': ['error-buzz', 'ambient-office', 'impact-punch'],
  'solution': ['success-chime', 'swoosh-magic', 'transition-modern'],
  'feature': ['click-soft', 'typing-keyboard', 'whoosh-soft'],
  'proof': ['success-chime', 'notification-ding', 'ambient-tech'],
  'cta': ['impact-boom', 'success-chime', 'impact-reveal'],
};

const CATEGORY_INFO: Record<SoundCategory, { icon: React.ReactNode; label: string; color: string }> = {
  transition: { icon: <ArrowRight className="h-3 w-3" />, label: 'Übergänge', color: 'bg-blue-500/20 text-blue-400' },
  ui: { icon: <MousePointerClick className="h-3 w-3" />, label: 'UI Sounds', color: 'bg-green-500/20 text-green-400' },
  ambient: { icon: <Wind className="h-3 w-3" />, label: 'Ambient', color: 'bg-purple-500/20 text-purple-400' },
  impact: { icon: <Zap className="h-3 w-3" />, label: 'Impact', color: 'bg-red-500/20 text-red-400' },
  whoosh: { icon: <Sparkles className="h-3 w-3" />, label: 'Whoosh', color: 'bg-cyan-500/20 text-cyan-400' },
  notification: { icon: <Bell className="h-3 w-3" />, label: 'Notifications', color: 'bg-yellow-500/20 text-yellow-400' },
};

export interface SceneSoundConfig {
  sceneId: string;
  effects: Array<{
    soundId: string;
    volume: number;
    startTime: number; // relative to scene start
  }>;
}

interface SoundDesignLibraryProps {
  scenes: ScriptScene[];
  soundConfigs: SceneSoundConfig[];
  onUpdateSoundConfigs: (configs: SceneSoundConfig[]) => void;
}

export function SoundDesignLibrary({ 
  scenes, 
  soundConfigs, 
  onUpdateSoundConfigs 
}: SoundDesignLibraryProps) {
  const [selectedCategory, setSelectedCategory] = useState<SoundCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSceneId, setActiveSceneId] = useState<string | null>(scenes[0]?.id || null);
  const [playingSound, setPlayingSound] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Filter sounds
  const filteredSounds = SOUND_EFFECTS.filter(sound => {
    const matchesCategory = selectedCategory === 'all' || sound.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      sound.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sound.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Get suggestions for active scene
  const activeScene = scenes.find(s => s.id === activeSceneId);
  const suggestions = activeScene 
    ? SCENE_SOUND_SUGGESTIONS[activeScene.type] || []
    : [];
  const suggestedSounds = SOUND_EFFECTS.filter(s => suggestions.includes(s.id));

  // Get config for active scene
  const activeConfig = soundConfigs.find(c => c.sceneId === activeSceneId);

  const handlePlaySound = (soundId: string) => {
    if (playingSound === soundId) {
      setPlayingSound(null);
      // In production, would stop audio
    } else {
      setPlayingSound(soundId);
      // In production, would play audio
      setTimeout(() => setPlayingSound(null), 1000);
    }
  };

  const handleAddSoundToScene = (soundId: string) => {
    if (!activeSceneId) return;

    const existingConfig = soundConfigs.find(c => c.sceneId === activeSceneId);
    
    if (existingConfig) {
      // Check if already added
      if (existingConfig.effects.some(e => e.soundId === soundId)) return;
      
      const updatedConfigs = soundConfigs.map(c => 
        c.sceneId === activeSceneId
          ? { ...c, effects: [...c.effects, { soundId, volume: 80, startTime: 0 }] }
          : c
      );
      onUpdateSoundConfigs(updatedConfigs);
    } else {
      onUpdateSoundConfigs([
        ...soundConfigs,
        { sceneId: activeSceneId, effects: [{ soundId, volume: 80, startTime: 0 }] }
      ]);
    }
  };

  const handleRemoveSoundFromScene = (soundId: string) => {
    if (!activeSceneId) return;

    const updatedConfigs = soundConfigs.map(c => 
      c.sceneId === activeSceneId
        ? { ...c, effects: c.effects.filter(e => e.soundId !== soundId) }
        : c
    ).filter(c => c.effects.length > 0);
    
    onUpdateSoundConfigs(updatedConfigs);
  };

  const handleUpdateVolume = (soundId: string, volume: number) => {
    const updatedConfigs = soundConfigs.map(c => 
      c.sceneId === activeSceneId
        ? { 
            ...c, 
            effects: c.effects.map(e => 
              e.soundId === soundId ? { ...e, volume } : e
            ) 
          }
        : c
    );
    onUpdateSoundConfigs(updatedConfigs);
  };

  const isSoundInScene = (soundId: string) => 
    activeConfig?.effects.some(e => e.soundId === soundId) || false;

  return (
    <div className="space-y-6">
      {/* Scene Selector */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {scenes.map((scene, index) => {
          const config = soundConfigs.find(c => c.sceneId === scene.id);
          const effectCount = config?.effects.length || 0;
          
          return (
            <button
              key={scene.id}
              onClick={() => setActiveSceneId(scene.id)}
              className={cn(
                "flex-shrink-0 px-4 py-2 rounded-lg border transition-all text-sm",
                activeSceneId === scene.id
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-muted/20 border-white/10 hover:bg-muted/40"
              )}
            >
              <span className="font-medium">Szene {index + 1}</span>
              {effectCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                  {effectCount}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Scene Sounds */}
      {activeConfig && activeConfig.effects.length > 0 && (
        <div className="p-4 rounded-xl bg-primary/10 border border-primary/30">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" />
            Sounds in Szene {scenes.findIndex(s => s.id === activeSceneId) + 1}
          </h4>
          <div className="space-y-2">
            {activeConfig.effects.map(effect => {
              const sound = SOUND_EFFECTS.find(s => s.id === effect.soundId);
              if (!sound) return null;
              
              return (
                <div
                  key={effect.soundId}
                  className="flex items-center gap-3 p-2 rounded-lg bg-card/40"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handlePlaySound(sound.id)}
                  >
                    {playingSound === sound.id ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <span className="text-sm font-medium flex-shrink-0">{sound.name}</span>
                  <div className="flex items-center gap-2 flex-1">
                    <Volume2 className="h-3 w-3 text-muted-foreground" />
                    <Slider
                      value={[effect.volume]}
                      onValueChange={([v]) => handleUpdateVolume(sound.id, v)}
                      min={0}
                      max={100}
                      className="w-24"
                    />
                    <span className="text-xs text-muted-foreground w-8">{effect.volume}%</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                    onClick={() => handleRemoveSoundFromScene(sound.id)}
                  >
                    ×
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Suggestions */}
      {suggestedSounds.length > 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/30">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            KI-Empfehlungen für "{activeScene?.title}"
          </h4>
          <div className="flex flex-wrap gap-2">
            {suggestedSounds.map(sound => (
              <motion.button
                key={sound.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleAddSoundToScene(sound.id)}
                disabled={isSoundInScene(sound.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all",
                  isSoundInScene(sound.id)
                    ? "bg-primary/20 text-primary border border-primary/50"
                    : "bg-white/10 hover:bg-white/20 border border-white/10"
                )}
              >
                {isSoundInScene(sound.id) ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                {sound.name}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Sounds suchen..."
            className="pl-10 bg-muted/20 border-white/10"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button
            variant={selectedCategory === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSelectedCategory('all')}
            className="text-xs"
          >
            Alle
          </Button>
          {Object.entries(CATEGORY_INFO).map(([key, { icon, label }]) => (
            <Button
              key={key}
              variant={selectedCategory === key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedCategory(key as SoundCategory)}
              className="text-xs gap-1"
            >
              {icon}
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Sound Library Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <AnimatePresence mode="popLayout">
          {filteredSounds.map((sound, index) => {
            const isInScene = isSoundInScene(sound.id);
            const categoryInfo = CATEGORY_INFO[sound.category];
            
            return (
              <motion.div
                key={sound.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.02 }}
                className={cn(
                  "relative p-3 rounded-lg border transition-all",
                  isInScene
                    ? "bg-primary/10 border-primary/30"
                    : "bg-muted/20 border-white/10 hover:bg-muted/30"
                )}
              >
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={() => handlePlaySound(sound.id)}
                  >
                    {playingSound === sound.id ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{sound.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", categoryInfo.color)}>
                        {categoryInfo.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{sound.duration}s</span>
                    </div>
                  </div>
                  <Button
                    variant={isInScene ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7 flex-shrink-0"
                    onClick={() => isInScene ? handleRemoveSoundFromScene(sound.id) : handleAddSoundToScene(sound.id)}
                  >
                    {isInScene ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filteredSounds.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Music className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Keine Sounds gefunden</p>
        </div>
      )}
    </div>
  );
}
