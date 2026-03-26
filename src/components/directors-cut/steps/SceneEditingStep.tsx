import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { 
  Scissors, 
  Sparkles, 
  X, 
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Lightbulb,
  Palette,
  Clock,
  Wand2,
  Film,
  Turtle,
  Rabbit,
  Timer,
  Volume2,
  Activity,
  Shuffle,
  Plus,
  Undo2
} from 'lucide-react';
import { SceneAnalysis, TransitionAssignment, GlobalEffects, SceneEffects, AudioEnhancements } from '@/types/directors-cut';
import { AddMediaDialog } from '../ui/AddMediaDialog';
import { AISoraEnhance } from '../features/AISoraEnhance';
import { SceneCard } from '../ui/SceneCard';
import { TransitionPicker } from '../ui/TransitionPicker';
import { VisualTimeline } from '../ui/VisualTimeline';
import { DirectorsCutPreviewPlayer } from '../DirectorsCutPreviewPlayer';
import { ContextualActionBar } from '../ui/ContextualActionBar';
import { SmartTemplates, SmartTemplate } from '../ui/SmartTemplates';
import { AudioWaveformOverlay } from '../ui/AudioWaveformOverlay';
import { MotionIntensityOverlay } from '../ui/MotionIntensityOverlay';
import { ColorAnalysisOverlay } from '../ui/ColorAnalysisOverlay';
import { AISceneRemix } from '../ui/AISceneRemix';
import { SplitScreenComparison } from '../ui/SplitScreenComparison';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { cn } from '@/lib/utils';

interface SceneEditingStepProps {
  videoUrl: string;
  videoDuration: number;
  scenes: SceneAnalysis[];
  onScenesUpdate: (scenes: SceneAnalysis[]) => void;
  transitions: TransitionAssignment[];
  onTransitionsChange: (transitions: TransitionAssignment[]) => void;
  // New props for preview player
  appliedEffects?: GlobalEffects;
  sceneEffects?: Record<string, SceneEffects>;
  audio?: AudioEnhancements;
}

export function SceneEditingStep({
  videoUrl,
  videoDuration,
  scenes,
  onScenesUpdate,
  transitions,
  onTransitionsChange,
  appliedEffects = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    sharpness: 0,
    temperature: 0,
    vignette: 0,
  },
  sceneEffects = {},
  audio = {
    master_volume: 100,
    noise_reduction: false,
    noise_reduction_level: 0,
    auto_ducking: false,
    ducking_level: 0,
    voice_enhancement: false,
    added_sounds: [],
  },
}: SceneEditingStepProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [editingTransitionId, setEditingTransitionId] = useState<string | null>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const lastTimeUpdateRef = useRef(0);
  
  // Throttled time update to reduce UI re-renders during playback
  const handleThrottledTimeUpdate = useCallback((time: number) => {
    const now = performance.now();
    if (now - lastTimeUpdateRef.current > 150) { // ~6.6 updates/sec
      lastTimeUpdateRef.current = now;
      setCurrentVideoTime(time);
    }
  }, []);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  
  // Multi-Layer Preview Overlay toggles
  const [showAudioOverlay, setShowAudioOverlay] = useState(false);
  const [showMotionOverlay, setShowMotionOverlay] = useState(false);
  const [showColorOverlay, setShowColorOverlay] = useState(false);
  const [showRemixDialog, setShowRemixDialog] = useState(false);
  const [showSplitScreen, setShowSplitScreen] = useState(false);
  
  // Add Media Dialog
  const [showAddMediaDialog, setShowAddMediaDialog] = useState(false);
  
  // Undo system for deleted scenes
  const [deletedScenes, setDeletedScenes] = useState<{
    scene: SceneAnalysis;
    index: number;
    transitions: TransitionAssignment[];
    timestamp: number;
  }[]>([]);

  const selectedScene = scenes.find(s => s.id === selectedSceneId);
  const selectedSceneIndex = scenes.findIndex(s => s.id === selectedSceneId);

  // Calculate actual total duration based on extended scenes
  const actualTotalDuration = useMemo(() => {
    return scenes.reduce((sum, s) => sum + (s.end_time - s.start_time), 0);
  }, [scenes]);

  // Get transition for editing scene
  const editingTransition = transitions.find(t => t.sceneId === editingTransitionId);

  // Keyboard navigation
  const navigateScene = useCallback((direction: 'prev' | 'next') => {
    if (scenes.length === 0) return;
    
    if (!selectedSceneId) {
      setSelectedSceneId(scenes[0].id);
      return;
    }
    
    const currentIndex = scenes.findIndex(s => s.id === selectedSceneId);
    let newIndex = direction === 'next' 
      ? Math.min(currentIndex + 1, scenes.length - 1)
      : Math.max(currentIndex - 1, 0);
    
    setSelectedSceneId(scenes[newIndex].id);
  }, [scenes, selectedSceneId]);

  useKeyboardShortcuts({
    onClose: () => {
      setSelectedSceneId(null);
      setEditingTransitionId(null);
    },
  }, true);
  // Keyboard shortcuts placeholder - actual handler added after function declarations

  const handleTransitionTypeChange = useCallback((type: string) => {
    if (!editingTransitionId) return;
    
    const existing = transitions.find(t => t.sceneId === editingTransitionId);
    
    if (type === 'none') {
      onTransitionsChange(transitions.filter(t => t.sceneId !== editingTransitionId));
    } else if (existing) {
      onTransitionsChange(transitions.map(t => 
        t.sceneId === editingTransitionId ? { ...t, transitionType: type } : t
      ));
    } else {
      onTransitionsChange([...transitions, {
        sceneId: editingTransitionId,
        transitionType: type,
        duration: 0.5,
        aiSuggested: false,
      }]);
    }
  }, [editingTransitionId, transitions, onTransitionsChange]);

  const handleTransitionDurationChange = useCallback((duration: number) => {
    if (!editingTransitionId) return;
    
    onTransitionsChange(transitions.map(t =>
      t.sceneId === editingTransitionId ? { ...t, duration } : t
    ));
  }, [editingTransitionId, transitions, onTransitionsChange]);

  const applyAiSuggestions = () => {
    // Apply AI-suggested transitions to all scenes
    const aiTransitions: TransitionAssignment[] = scenes.slice(0, -1).map((scene, index) => {
      const existing = transitions.find(t => t.sceneId === scene.id);
      if (existing?.aiSuggested) return existing;
      
      // Smart AI logic based on scene mood
      const mood = scene.mood?.toLowerCase() || 'neutral';
      let transitionType = 'crossfade';
      let confidence = 0.85;
      let reasoning = 'Standard-Überblendung für neutrale Szenen';
      
      if (mood === 'energetic' || mood === 'action') {
        transitionType = 'wipe';
        confidence = 0.9;
        reasoning = 'Dynamischer Wipe-Effekt passt zur energetischen Stimmung';
      } else if (mood === 'calm' || mood === 'peaceful') {
        transitionType = 'dissolve';
        confidence = 0.92;
        reasoning = 'Sanfter Dissolve-Effekt für ruhige, friedliche Szenen';
      } else if (mood === 'dramatic') {
        transitionType = 'fade';
        confidence = 0.88;
        reasoning = 'Fade to Black verstärkt dramatische Momente';
      }
      
      return {
        sceneId: scene.id,
        transitionType,
        duration: 0.5,
        aiSuggested: true,
        confidence,
        reasoning,
      };
    });
    
    onTransitionsChange(aiTransitions);
  };

  const getTransitionForScene = (sceneId: string) => {
    return transitions.find(t => t.sceneId === sceneId);
  };

  // Maximum extension ratio: 1:3 (scene can be 3x longer = 0.33x slower)
  const MAX_EXTENSION_RATIO = 3;
  const MIN_PLAYBACK_RATE = 1 / MAX_EXTENSION_RATIO; // 0.33x
  const MAX_PLAYBACK_RATE = MAX_EXTENSION_RATIO; // 3x (scene can be 3x shorter = 3x faster)

  // Handle scene duration change with time remapping
  // SHIFTS subsequent scenes instead of maintaining total length
  const handleSceneDurationChange = useCallback((sceneId: string, newDuration: number) => {
    const sceneIndex = scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) return;

    const scene = scenes[sceneIndex];
    const originalDuration = (scene.original_end_time ?? scene.end_time) - (scene.original_start_time ?? scene.start_time);
    
    // Clamp to 1:3 ratio limits
    const minDuration = Math.max(0.5, originalDuration / MAX_EXTENSION_RATIO);
    const maxDuration = originalDuration * MAX_EXTENSION_RATIO;
    const clampedDuration = Math.max(minDuration, Math.min(maxDuration, newDuration));
    
    // Calculate playback rate (original / new = rate)
    const playbackRate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, originalDuration / clampedDuration));
    
    // Calculate duration change delta
    const currentDuration = scene.end_time - scene.start_time;
    const durationDelta = clampedDuration - currentDuration;
    
    // Update the scene with new duration and SHIFT all subsequent scenes
    const newEndTime = scene.start_time + clampedDuration;
    
    const updatedScenes = scenes.map((s, idx) => {
      if (idx === sceneIndex) {
        return {
          ...s,
          end_time: newEndTime,
          playbackRate,
          original_start_time: s.original_start_time ?? s.start_time,
          original_end_time: s.original_end_time ?? s.end_time,
        };
      }
      // SHIFT all subsequent scenes by the delta (not just adjust neighbor)
      if (idx > sceneIndex) {
        return {
          ...s,
          start_time: s.start_time + durationDelta,
          end_time: s.end_time + durationDelta,
        };
      }
      return s;
    });

    onScenesUpdate(updatedScenes);
  }, [scenes, onScenesUpdate]);

  // Handle divider drag from timeline - SHIFTS subsequent scenes
  const handleTimelineDurationChange = useCallback((
    leftSceneId: string, 
    newLeftEnd: number
  ) => {
    const sceneIndex = scenes.findIndex(s => s.id === leftSceneId);
    if (sceneIndex === -1) return;

    const scene = scenes[sceneIndex];
    const originalDuration = (scene.original_end_time ?? scene.end_time) - (scene.original_start_time ?? scene.start_time);
    const newDuration = newLeftEnd - scene.start_time;
    
    // Clamp to 1:3 ratio limits
    const minDuration = Math.max(0.5, originalDuration / MAX_EXTENSION_RATIO);
    const maxDuration = originalDuration * MAX_EXTENSION_RATIO;
    const clampedDuration = Math.max(minDuration, Math.min(maxDuration, newDuration));
    const clampedEndTime = scene.start_time + clampedDuration;
    
    const playbackRate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, originalDuration / clampedDuration));
    
    // Calculate duration change delta
    const currentDuration = scene.end_time - scene.start_time;
    const durationDelta = clampedDuration - currentDuration;

    const updatedScenes = scenes.map((s, idx) => {
      if (s.id === leftSceneId) {
        return {
          ...s,
          end_time: clampedEndTime,
          playbackRate,
          original_start_time: s.original_start_time ?? s.start_time,
          original_end_time: s.original_end_time ?? s.end_time,
        };
      }
      // SHIFT all subsequent scenes by the delta
      if (idx > sceneIndex) {
        return {
          ...s,
          start_time: s.start_time + durationDelta,
          end_time: s.end_time + durationDelta,
        };
      }
      return s;
    });

    onScenesUpdate(updatedScenes);
  }, [scenes, onScenesUpdate]);

  // Find current scene based on video time
  const getCurrentScene = useCallback(() => {
    return scenes.find(scene => 
      currentVideoTime >= scene.start_time && currentVideoTime < scene.end_time
    );
  }, [scenes, currentVideoTime]);

  const currentScene = getCurrentScene();
  const { toast } = useToast();

  // Quick Actions handlers
  const handleQuickSpeedChange = useCallback((speed: number) => {
    if (!selectedSceneId) return;
    
    const scene = scenes.find(s => s.id === selectedSceneId);
    if (!scene) return;
    
    const originalDuration = (scene.original_end_time ?? scene.end_time) - (scene.original_start_time ?? scene.start_time);
    const newDuration = originalDuration / speed;
    
    handleSceneDurationChange(selectedSceneId, newDuration);
    
    toast({
      title: `Speed: ${speed}x`,
      description: speed < 1 ? 'Zeitlupe aktiviert' : speed === 1 ? 'Normale Geschwindigkeit' : 'Zeitraffer aktiviert',
    });
  }, [selectedSceneId, scenes, handleSceneDurationChange, toast]);

  const handleSplitScene = useCallback(() => {
    if (!selectedSceneId) return;
    
    const sceneIndex = scenes.findIndex(s => s.id === selectedSceneId);
    const scene = scenes[sceneIndex];
    if (!scene) return;
    
    const midPoint = (scene.start_time + scene.end_time) / 2;
    const originalMidPoint = ((scene.original_start_time ?? scene.start_time) + (scene.original_end_time ?? scene.end_time)) / 2;
    
    const newScenes = [...scenes];
    const firstHalf: SceneAnalysis = {
      ...scene,
      id: `${scene.id}-a`,
      end_time: midPoint,
      original_end_time: originalMidPoint,
      description: `${scene.description} (Teil 1)`,
    };
    const secondHalf: SceneAnalysis = {
      ...scene,
      id: `${scene.id}-b`,
      start_time: midPoint,
      original_start_time: originalMidPoint,
      description: `${scene.description} (Teil 2)`,
    };
    
    newScenes.splice(sceneIndex, 1, firstHalf, secondHalf);
    onScenesUpdate(newScenes);
    setSelectedSceneId(firstHalf.id);
    
    toast({
      title: 'Szene geteilt',
      description: 'Die Szene wurde in zwei Teile aufgeteilt',
    });
  }, [selectedSceneId, scenes, onScenesUpdate, toast]);

  const handleCopyScene = useCallback(() => {
    if (!selectedSceneId) return;
    
    const sceneIndex = scenes.findIndex(s => s.id === selectedSceneId);
    const scene = scenes[sceneIndex];
    if (!scene) return;
    
    const duration = scene.end_time - scene.start_time;
    const lastScene = scenes[scenes.length - 1];
    
    const copiedScene: SceneAnalysis = {
      ...scene,
      id: `${scene.id}-copy-${Date.now()}`,
      start_time: lastScene.end_time,
      end_time: lastScene.end_time + duration,
      description: `${scene.description} (Kopie)`,
    };
    
    onScenesUpdate([...scenes, copiedScene]);
    
    toast({
      title: 'Szene dupliziert',
      description: 'Die Kopie wurde am Ende hinzugefügt',
    });
  }, [selectedSceneId, scenes, onScenesUpdate, toast]);

  const handleDeleteScene = useCallback(() => {
    if (!selectedSceneId || scenes.length <= 1) return;
    
    const sceneIndex = scenes.findIndex(s => s.id === selectedSceneId);
    const scene = scenes[sceneIndex];
    if (!scene) return;
    
    const duration = scene.end_time - scene.start_time;
    
    // Save to undo stack before deleting
    const sceneTransitions = transitions.filter(t => t.sceneId === selectedSceneId);
    setDeletedScenes(prev => [...prev, {
      scene,
      index: sceneIndex,
      transitions: sceneTransitions,
      timestamp: Date.now(),
    }]);
    
    // Remove scene and shift subsequent scenes backward
    const newScenes = scenes
      .filter(s => s.id !== selectedSceneId)
      .map((s, idx) => {
        if (idx >= sceneIndex) {
          return {
            ...s,
            start_time: s.start_time - duration,
            end_time: s.end_time - duration,
          };
        }
        return s;
      });
    
    // Also remove any transitions for this scene
    onTransitionsChange(transitions.filter(t => t.sceneId !== selectedSceneId));
    onScenesUpdate(newScenes);
    
    // Select next scene or previous if was last
    const nextIndex = Math.min(sceneIndex, newScenes.length - 1);
    setSelectedSceneId(newScenes[nextIndex]?.id || null);
    
    toast({
      title: 'Szene gelöscht',
      description: 'Drücke Strg+Z zum Rückgängig machen',
      action: (
        <ToastAction altText="Rückgängig" onClick={() => handleUndoDelete()}>
          <Undo2 className="h-4 w-4 mr-1" />
          Rückgängig
        </ToastAction>
      ),
    });
  }, [selectedSceneId, scenes, transitions, onScenesUpdate, onTransitionsChange, toast]);

  // Undo delete scene
  const handleUndoDelete = useCallback(() => {
    const lastDeleted = deletedScenes[deletedScenes.length - 1];
    if (!lastDeleted) return;
    
    const { scene, index, transitions: sceneTransitions } = lastDeleted;
    const duration = scene.end_time - scene.start_time;
    
    // Insert scene back at original position and shift subsequent scenes
    const newScenes = [...scenes];
    
    // Shift subsequent scenes forward to make room
    for (let i = index; i < newScenes.length; i++) {
      newScenes[i] = {
        ...newScenes[i],
        start_time: newScenes[i].start_time + duration,
        end_time: newScenes[i].end_time + duration,
      };
    }
    
    // Insert the scene back
    newScenes.splice(index, 0, scene);
    
    // Restore transitions
    onTransitionsChange([...transitions, ...sceneTransitions]);
    onScenesUpdate(newScenes);
    
    // Remove from undo stack
    setDeletedScenes(prev => prev.slice(0, -1));
    
    // Select restored scene
    setSelectedSceneId(scene.id);
    
    toast({
      title: 'Szene wiederhergestellt',
      description: 'Die gelöschte Szene wurde wiederhergestellt',
    });
  }, [deletedScenes, scenes, transitions, onScenesUpdate, onTransitionsChange, toast]);

  // Add new scene
  const handleAddScene = useCallback((insertAfterSelected: boolean = false) => {
    const lastScene = scenes[scenes.length - 1];
    const newStartTime = insertAfterSelected && selectedSceneId
      ? scenes.find(s => s.id === selectedSceneId)?.end_time || lastScene.end_time
      : lastScene.end_time;
    
    const newScene: SceneAnalysis = {
      id: `scene-new-${Date.now()}`,
      start_time: newStartTime,
      end_time: newStartTime + 5, // Default 5 seconds
      description: 'Neue Szene',
      mood: 'neutral',
      suggested_effects: [],
      ai_suggestions: [],
      isFromOriginalVideo: false,
    };
    
    if (insertAfterSelected && selectedSceneId) {
      const insertIndex = scenes.findIndex(s => s.id === selectedSceneId) + 1;
      const newScenes = [...scenes];
      
      // Shift subsequent scenes by 5 seconds
      for (let i = insertIndex; i < newScenes.length; i++) {
        newScenes[i] = {
          ...newScenes[i],
          start_time: newScenes[i].start_time + 5,
          end_time: newScenes[i].end_time + 5,
        };
      }
      
      newScenes.splice(insertIndex, 0, newScene);
      onScenesUpdate(newScenes);
    } else {
      onScenesUpdate([...scenes, newScene]);
    }
    
    setSelectedSceneId(newScene.id);
    toast({
      title: 'Szene hinzugefügt',
      description: 'Eine neue leere Szene wurde erstellt',
    });
  }, [scenes, selectedSceneId, onScenesUpdate, toast]);

  // Add media as new scene
  const handleAddMedia = useCallback((media: { type: 'video' | 'image'; url: string; duration: number; name: string; thumbnail?: string }) => {
    const lastScene = scenes[scenes.length - 1];
    
    const newScene: SceneAnalysis = {
      id: `scene-media-${Date.now()}`,
      start_time: lastScene.end_time,
      end_time: lastScene.end_time + media.duration,
      description: media.name,
      mood: 'neutral',
      suggested_effects: [],
      ai_suggestions: [],
      isFromOriginalVideo: false,
      additionalMedia: {
        type: media.type,
        url: media.url,
        duration: media.duration,
        thumbnail: media.thumbnail,
        name: media.name,
      },
    };
    
    onScenesUpdate([...scenes, newScene]);
    setSelectedSceneId(newScene.id);
    
    toast({
      title: 'Medien hinzugefügt',
      description: `${media.type === 'video' ? 'Video' : 'Bild'} wurde als neue Szene hinzugefügt`,
    });
  }, [scenes, onScenesUpdate, toast]);

  const handleOpenEffects = useCallback(() => {
    toast({
      title: 'Effekte',
      description: 'Wechsle zu Schritt 4 (Style) für Effekte',
    });
  }, [toast]);

  // Handle keyboard navigation and shortcuts (must be after handler function declarations)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key === 'ArrowLeft') navigateScene('prev');
      if (e.key === 'ArrowRight') navigateScene('next');
      if (e.key === '?') setShowKeyboardHelp(v => !v);
      if (e.key === 't' && selectedSceneId) {
        setEditingTransitionId(selectedSceneId);
      }
      
      // Scene editing shortcuts
      if (e.key === 's' && selectedSceneId && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleSplitScene();
      }
      if (e.key === 'd' && selectedSceneId && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleCopyScene();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSceneId && scenes.length > 1) {
        e.preventDefault();
        handleDeleteScene();
      }
      
      // Ctrl/Cmd+Z for undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && deletedScenes.length > 0) {
        e.preventDefault();
        handleUndoDelete();
      }
      
      // Number keys for quick transition selection
      if (['1', '2', '3', '4', '5', '6'].includes(e.key) && editingTransitionId) {
        const types = ['none', 'crossfade', 'fade', 'dissolve', 'wipe', 'slide'];
        handleTransitionTypeChange(types[parseInt(e.key) - 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateScene, selectedSceneId, editingTransitionId, handleSplitScene, handleCopyScene, handleDeleteScene, handleUndoDelete, deletedScenes.length, scenes.length, handleTransitionTypeChange]);

  // Handle Smart Template application
  const handleApplyTemplate = useCallback((template: SmartTemplate) => {
    // Apply transitions to all scenes based on template
    const newTransitions: TransitionAssignment[] = scenes.slice(0, -1).map((scene) => ({
      sceneId: scene.id,
      transitionType: template.preview.transitionType,
      duration: 0.5,
      aiSuggested: false,
    }));
    
    onTransitionsChange(newTransitions);
    setActiveTemplateId(template.id);
    
    toast({
      title: `Template "${template.name}" angewendet`,
      description: `${newTransitions.length} Übergänge und Effekte wurden angewendet`,
    });
  }, [scenes, onTransitionsChange, toast]);

  // Get current playback rate for selected scene
  const selectedSceneSpeed = useMemo(() => {
    if (!selectedScene) return 1;
    return selectedScene.playbackRate ?? 1;
  }, [selectedScene]);

  // Handle AI Scene Remix
  const handleApplyRemix = useCallback((newScenes: SceneAnalysis[]) => {
    onScenesUpdate(newScenes);
    // Clear transitions when remixing (they'll need to be regenerated)
    onTransitionsChange([]);
    toast({
      title: 'Szenen neu angeordnet',
      description: `${newScenes.length} Szenen wurden gemäß der KI-Strategie neu sortiert`,
    });
  }, [onScenesUpdate, onTransitionsChange, toast]);

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Scissors className="h-5 w-5 text-primary" />
            Szenen-Editor
          </h3>
          <p className="text-sm text-muted-foreground">
            Bearbeite Szenen und konfiguriere Übergänge visuell
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowKeyboardHelp(v => !v)}
            className="text-xs"
          >
            <Keyboard className="h-3.5 w-3.5 mr-1.5" />
            Shortcuts
          </Button>
          {deletedScenes.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUndoDelete}
              className="text-xs border-orange-500/50 text-orange-600 hover:bg-orange-500/10"
            >
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Rückgängig ({deletedScenes.length})
            </Button>
          )}
          <Button
            onClick={() => handleAddScene(false)}
            size="sm"
            variant="outline"
            className="text-xs border-green-500/50 text-green-600 hover:bg-green-500/10"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Szene
          </Button>
          <Button
            onClick={() => setShowAddMediaDialog(true)}
            size="sm"
            variant="outline"
            className="text-xs border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
          >
            <Film className="h-3.5 w-3.5 mr-1.5" />
            Medien
          </Button>
          <Button
            onClick={applyAiSuggestions}
            size="sm"
            className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
          >
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />
            AI Übergänge
          </Button>
          <Button
            onClick={() => setShowRemixDialog(true)}
            size="sm"
            variant="outline"
            className="border-pink-500/50 text-pink-600 hover:bg-pink-500/10"
          >
            <Shuffle className="h-3.5 w-3.5 mr-1.5" />
            AI Remix
          </Button>
        </div>
      </div>

      {/* Keyboard Shortcuts Help */}
      <AnimatePresence>
        {showKeyboardHelp && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="bg-muted/50 border-dashed">
              <CardContent className="py-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {[
                    { key: '← →', action: 'Szene wechseln' },
                    { key: 'T', action: 'Transition öffnen' },
                    { key: '1-6', action: 'Transition wählen' },
                    { key: 'ESC', action: 'Schließen' },
                    { key: '?', action: 'Hilfe ein/aus' },
                    { key: 'Space', action: 'Play/Pause' },
                    { key: 'S', action: 'Szene teilen' },
                    { key: 'D', action: 'Szene duplizieren' },
                    { key: '⌫', action: 'Szene löschen' },
                    { key: '⌘Z', action: 'Rückgängig' },
                  ].map(({ key, action }) => (
                    <div key={key} className="flex items-center gap-2">
                      <kbd className="px-2 py-1 rounded bg-background border text-[10px] font-mono">
                        {key}
                      </kbd>
                      <span className="text-muted-foreground">{action}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Smart Templates - One-Click Styles */}
      <SmartTemplates 
        onApply={handleApplyTemplate}
        currentTemplateId={activeTemplateId ?? undefined}
      />

      {/* Split-Screen Comparison Mode */}
      <SplitScreenComparison
        originalVideoUrl={videoUrl}
        isActive={showSplitScreen}
        onToggle={() => setShowSplitScreen(v => !v)}
        appliedEffects={appliedEffects}
      />

      {/* Large Video Preview - like Step 2 */}
      <div className="rounded-xl overflow-hidden bg-black/20 border border-border/50">
        <DirectorsCutPreviewPlayer
          videoUrl={videoUrl}
          effects={appliedEffects}
          sceneEffects={sceneEffects}
          scenes={scenes}
          transitions={transitions}
          audio={audio}
          duration={actualTotalDuration}
          currentTime={currentVideoTime}
          onTimeUpdate={setCurrentVideoTime}
        >
          {/* Current Scene Indicator Overlay */}
          {currentScene && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-16 left-4 right-4 pointer-events-none"
            >
              <div className="backdrop-blur-md bg-black/60 rounded-lg px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                    <Film className="h-3 w-3 mr-1" />
                    Szene {scenes.findIndex(s => s.id === currentScene.id) + 1}
                  </Badge>
                  <span className="text-xs text-white/80 font-mono">
                    {currentScene.start_time.toFixed(1)}s – {currentScene.end_time.toFixed(1)}s
                  </span>
                  {currentScene.mood && (
                    <Badge variant="outline" className="text-white/70 border-white/30 capitalize text-xs">
                      {currentScene.mood}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-white/60 max-w-xs truncate">
                  {currentScene.description}
                </span>
              </div>
            </motion.div>
          )}
        </DirectorsCutPreviewPlayer>
      </div>

      {/* Visual Timeline */}
      <VisualTimeline
        scenes={scenes}
        transitions={transitions}
        videoDuration={actualTotalDuration}
        selectedSceneId={selectedSceneId}
        onSceneSelect={setSelectedSceneId}
        onTransitionClick={setEditingTransitionId}
        onSceneDurationChange={handleTimelineDurationChange}
        thumbnails={thumbnails}
        currentTime={currentVideoTime}
      />

      {/* Multi-Layer Preview Overlays */}
      <div className="space-y-2">
        {/* Toggle Buttons */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-2">Overlays:</span>
          <Button
            variant={showAudioOverlay ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowAudioOverlay(v => !v)}
            className="h-7 text-xs gap-1.5"
          >
            <Volume2 className="w-3.5 h-3.5" />
            Audio
          </Button>
          <Button
            variant={showMotionOverlay ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowMotionOverlay(v => !v)}
            className="h-7 text-xs gap-1.5"
          >
            <Activity className="w-3.5 h-3.5" />
            Motion
          </Button>
          <Button
            variant={showColorOverlay ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowColorOverlay(v => !v)}
            className="h-7 text-xs gap-1.5"
          >
            <Palette className="w-3.5 h-3.5" />
            Farben
          </Button>
        </div>

        {/* Overlay Components */}
        <AnimatePresence>
          {showAudioOverlay && (
            <AudioWaveformOverlay
              videoUrl={videoUrl}
              duration={actualTotalDuration}
              currentTime={currentVideoTime}
            />
          )}
          {showMotionOverlay && (
            <MotionIntensityOverlay
              scenes={scenes}
              duration={actualTotalDuration}
              currentTime={currentVideoTime}
            />
          )}
          {showColorOverlay && (
            <ColorAnalysisOverlay
              scenes={scenes}
              duration={actualTotalDuration}
              currentTime={currentVideoTime}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Main Content Grid - Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scene Cards Grid (2 columns on desktop) */}
        <div className="lg:col-span-2">
          {scenes.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Scissors className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Keine Szenen vorhanden. Bitte zuerst die KI-Analyse durchführen.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {scenes.map((scene, index) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  index={index}
                  isSelected={selectedSceneId === scene.id}
                  thumbnail={thumbnails[scene.id]}
                  transitionType={getTransitionForScene(scene.id)?.transitionType}
                  onClick={() => {
                    setSelectedSceneId(scene.id);
                    setEditingTransitionId(null);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Selected Scene Details Panel (sticky on desktop) */}
        <div className="lg:col-span-1">
          <AnimatePresence mode="wait">
            {selectedScene ? (
              <motion.div
                key={selectedScene.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card className="backdrop-blur-xl bg-card/95 border shadow-xl sticky top-4 max-h-[80vh] overflow-y-auto">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono">
                          Szene {selectedSceneIndex + 1}
                        </Badge>
                        {selectedScene.mood && (
                          <Badge variant="outline" className="capitalize">
                            <Palette className="h-3 w-3 mr-1" />
                            {selectedScene.mood}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => navigateScene('prev')}
                          disabled={selectedSceneIndex === 0}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => navigateScene('next')}
                          disabled={selectedSceneIndex === scenes.length - 1}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setSelectedSceneId(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="text-xs font-mono text-muted-foreground mb-3">
                      {selectedScene.start_time.toFixed(1)}s – {selectedScene.end_time.toFixed(1)}s
                    </div>

                    <p className="text-sm mb-4">{selectedScene.description}</p>

                    {/* Duration Slider with Playback Rate */}
                    <div className="mb-4 p-3 rounded-lg bg-muted/50 border">
                      <div className="flex items-center gap-2 mb-3">
                        <Timer className="h-4 w-4 text-primary" />
                        <Label className="text-xs font-medium">Dauer anpassen</Label>
                      </div>
                      
                      {(() => {
                        const currentDuration = selectedScene.end_time - selectedScene.start_time;
                        const originalDuration = (selectedScene.original_end_time ?? selectedScene.end_time) - 
                          (selectedScene.original_start_time ?? selectedScene.start_time);
                        const playbackRate = selectedScene.playbackRate ?? 1;
                        const isSlowMo = playbackRate < 1;
                        const isFastForward = playbackRate > 1;
                        
                        // 1:3 ratio limits
                        const minDuration = Math.max(0.5, originalDuration / MAX_EXTENSION_RATIO);
                        const maxDuration = originalDuration * MAX_EXTENSION_RATIO;
                        
                        // Calculate new total video duration
                        const totalDuration = scenes.reduce((sum, s) => sum + (s.end_time - s.start_time), 0);
                        const originalTotalDuration = scenes.reduce((sum, s) => {
                          const origDur = (s.original_end_time ?? s.end_time) - (s.original_start_time ?? s.start_time);
                          return sum + origDur;
                        }, 0);
                        const totalDurationChange = totalDuration - originalTotalDuration;
                        
                        return (
                          <>
                            {/* Original vs Current Duration with Max info */}
                            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                              <div>
                                <span className="text-muted-foreground">Original</span>
                                <div className="font-mono font-medium">{originalDuration.toFixed(1)}s</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Aktuell</span>
                                <div className="font-mono font-medium text-primary">{currentDuration.toFixed(1)}s</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Max</span>
                                <div className="font-mono font-medium text-muted-foreground">{maxDuration.toFixed(1)}s</div>
                              </div>
                            </div>
                            
                            {/* Duration Slider with 1:3 ratio */}
                            <Slider
                              value={[currentDuration]}
                              onValueChange={([value]) => handleSceneDurationChange(selectedScene.id, value)}
                              min={minDuration}
                              max={maxDuration}
                              step={0.1}
                              className="mb-3"
                            />
                            
                            {/* Ratio Info */}
                            <div className="text-[10px] text-muted-foreground mb-2">
                              1:3 Ratio — Max 3x langsamer oder 3x schneller
                            </div>
                            
                            {/* Playback Rate Display */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isSlowMo && (
                                  <Badge className="bg-blue-500/80 text-white border-0 text-xs">
                                    <Turtle className="h-3 w-3 mr-1" />
                                    Slow Motion
                                  </Badge>
                                )}
                                {isFastForward && (
                                  <Badge className="bg-orange-500/80 text-white border-0 text-xs">
                                    <Rabbit className="h-3 w-3 mr-1" />
                                    Fast Forward
                                  </Badge>
                                )}
                                {!isSlowMo && !isFastForward && (
                                  <Badge variant="secondary" className="text-xs">
                                    Normal
                                  </Badge>
                                )}
                              </div>
                              <span className="font-mono text-xs font-medium">
                                {playbackRate.toFixed(2)}x
                              </span>
                            </div>
                            
                            {/* New Total Duration Display */}
                            {Math.abs(totalDurationChange) > 0.1 && (
                              <div className="mt-3 pt-2 border-t border-border/50">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Neue Gesamtlänge:</span>
                                  <span className="font-mono font-medium">
                                    {totalDuration.toFixed(1)}s
                                    <span className={cn(
                                      "ml-1",
                                      totalDurationChange > 0 ? "text-blue-500" : "text-orange-500"
                                    )}>
                                      ({totalDurationChange > 0 ? '+' : ''}{totalDurationChange.toFixed(1)}s)
                                    </span>
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* AI Suggestions */}
                    {selectedScene.ai_suggestions && selectedScene.ai_suggestions.length > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Lightbulb className="h-4 w-4 text-yellow-500" />
                          <span className="text-xs font-medium">AI Vorschläge</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedScene.ai_suggestions.map((suggestion, i) => (
                            <Badge key={i} variant="secondary" className="bg-primary/10 text-primary text-xs">
                              <Sparkles className="h-2.5 w-2.5 mr-1" />
                              {suggestion}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI Sora 2 Scene Enhancement - only for scenes ≤12 seconds */}
                    {(selectedScene.end_time - selectedScene.start_time) <= 12 && (
                      <div className="mb-4">
                        <AISoraEnhance
                          scene={selectedScene}
                          videoUrl={videoUrl}
                          aspectRatio="16:9"
                          onEnhancementComplete={(newVideoUrl) => {
                            // Update scene with new AI-generated video
                            const updatedScene: SceneAnalysis = {
                              ...selectedScene,
                              additionalMedia: {
                                type: 'video',
                                url: newVideoUrl,
                                duration: selectedScene.end_time - selectedScene.start_time,
                              },
                              isFromOriginalVideo: false,
                            };
                            onScenesUpdate(scenes.map(s => 
                              s.id === selectedScene.id ? updatedScene : s
                            ));
                          }}
                        />
                      </div>
                    )}

                    {/* Transition Editor (if not last scene) */}
                    {selectedSceneIndex < scenes.length - 1 && (
                      <div className="pt-4 border-t">
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-medium">Übergang zur nächsten Szene</span>
                        </div>
                        <TransitionPicker
                          selectedType={getTransitionForScene(selectedScene.id)?.transitionType || 'none'}
                          duration={getTransitionForScene(selectedScene.id)?.duration || 0.5}
                          onTypeChange={(type) => {
                            setEditingTransitionId(selectedScene.id);
                            handleTransitionTypeChange(type);
                          }}
                          onDurationChange={(duration) => {
                            setEditingTransitionId(selectedScene.id);
                            handleTransitionDurationChange(duration);
                          }}
                          aiRecommendation={getTransitionForScene(selectedScene.id)?.aiSuggested 
                            ? getTransitionForScene(selectedScene.id)?.transitionType 
                            : undefined}
                          aiConfidence={getTransitionForScene(selectedScene.id)?.confidence}
                          aiReasoning={getTransitionForScene(selectedScene.id)?.reasoning}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Card className="border-dashed bg-muted/30">
                  <CardContent className="py-8 text-center">
                    <Film className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      Wähle eine Szene aus, um Details zu bearbeiten
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Nutze ← → Pfeiltasten zum Navigieren
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Stats Footer */}
      {(() => {
        const actualTotalDuration = scenes.reduce((sum, s) => sum + (s.end_time - s.start_time), 0);
        const durationChange = actualTotalDuration - videoDuration;
        
        return (
          <div className="flex items-center justify-center gap-6 py-4 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Scissors className="h-4 w-4" />
              <span>{scenes.length} Szenen</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              <span>{transitions.length} Übergänge</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                {actualTotalDuration.toFixed(1)}s gesamt
                {Math.abs(durationChange) > 0.1 && (
                  <span className={cn(
                    "ml-1 text-xs",
                    durationChange > 0 ? "text-blue-500" : "text-orange-500"
                  )}>
                    ({durationChange > 0 ? '+' : ''}{durationChange.toFixed(1)}s)
                  </span>
                )}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Contextual Quick Actions - Floating Action Bar */}
      <ContextualActionBar
        visible={!!selectedSceneId}
        onSpeedChange={handleQuickSpeedChange}
        onSplit={handleSplitScene}
        onCopy={handleCopyScene}
        onDelete={handleDeleteScene}
        onApplyEffect={handleOpenEffects}
        onAddScene={() => handleAddScene(true)}
        currentSpeed={selectedSceneSpeed}
        sceneName={selectedScene ? `Szene ${selectedSceneIndex + 1}` : undefined}
      />

      {/* AI Scene Remix Dialog */}
      <AISceneRemix
        open={showRemixDialog}
        onOpenChange={setShowRemixDialog}
        scenes={scenes}
        onApplyRemix={handleApplyRemix}
      />

      {/* Add Media Dialog */}
      <AddMediaDialog
        open={showAddMediaDialog}
        onOpenChange={setShowAddMediaDialog}
        onMediaSelect={handleAddMedia}
      />
    </div>
  );
}
