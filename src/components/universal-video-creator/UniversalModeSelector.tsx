import { motion } from 'framer-motion';
import { Sparkles, Hand, ArrowRight, Clock, Zap, Palette, Video, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VideoCategory } from '@/types/universal-video-creator';
import { VIDEO_CATEGORIES } from '@/types/universal-video-creator';
import { ALL_CATEGORY_INTERVIEWS } from '@/config/universal-video-interviews';

export type UniversalGenerationMode = 'full-service' | 'manual';

interface UniversalModeSelectorProps {
  selectedCategory: VideoCategory;
  onSelectMode: (mode: UniversalGenerationMode) => void;
  onBack: () => void;
}

export function UniversalModeSelector({ selectedCategory, onSelectMode, onBack }: UniversalModeSelectorProps) {
  const category = VIDEO_CATEGORIES.find(c => c.category === selectedCategory);
  const interview = ALL_CATEGORY_INTERVIEWS[selectedCategory];
  const questionCount = interview?.phases?.length || 20;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Category Badge */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <button 
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F5C76A]/10 border border-[#F5C76A]/30 mb-4 hover:bg-[#F5C76A]/20 transition-colors cursor-pointer"
        >
          <Video className="h-4 w-4 text-[#F5C76A]" />
          <span className="text-sm font-medium text-[#F5C76A]">{category?.name}</span>
          <span className="text-xs text-muted-foreground">• Kategorie ändern</span>
        </button>
        
        <h2 className="text-3xl font-bold mb-4">
          <span className="bg-gradient-to-r from-[#F5C76A] via-amber-300 to-[#F5C76A] bg-clip-text text-transparent">
            Wie möchtest du dein {category?.name} erstellen?
          </span>
        </h2>
        <p className="text-muted-foreground text-lg">
          Wähle zwischen vollautomatischer KI-Erstellung oder manueller Kontrolle
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Full-Service Mode */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          whileHover={{ scale: 1.02 }}
          className={cn(
            "relative overflow-hidden rounded-2xl border-2 cursor-pointer transition-all duration-300",
            "bg-gradient-to-br from-[#F5C76A]/10 via-purple-500/5 to-cyan-500/10",
            "border-[#F5C76A]/30 hover:border-[#F5C76A]/60",
            "hover:shadow-[0_0_40px_rgba(245,199,106,0.2)]"
          )}
          onClick={() => onSelectMode('full-service')}
        >
          {/* Recommended Badge */}
          <div className="absolute top-4 right-4">
            <div className="px-3 py-1 rounded-full bg-[#F5C76A]/20 border border-[#F5C76A]/40 text-xs font-medium text-[#F5C76A]">
              Empfohlen
            </div>
          </div>

          <div className="p-8">
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F5C76A]/30 to-purple-500/30 flex items-center justify-center mb-6">
              <Sparkles className="h-8 w-8 text-[#F5C76A]" />
            </div>

            {/* Title */}
            <h3 className="text-2xl font-bold mb-2">🤖 Full-Service KI</h3>
            <p className="text-muted-foreground mb-6">
              Lehn dich zurück – die KI erstellt dein komplettes {category?.name} automatisch
            </p>

            {/* Features */}
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-[#F5C76A]/20 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-[#F5C76A]" />
                </div>
                <span>{questionCount} tiefgehende Interview-Fragen</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-green-400" />
                </div>
                <span>Fertig in ~5-15 Minuten</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-cyan-400" />
                </div>
                <span>Keine manuelle Arbeit nötig</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Palette className="h-4 w-4 text-purple-400" />
                </div>
                <span>Premium Flux 1.1 Pro Visuals</span>
              </div>
            </div>

            {/* What you get */}
            <div className="bg-muted/20 rounded-xl p-4 mb-6">
              <p className="text-xs text-muted-foreground mb-2">Du erhältst:</p>
              <p className="text-sm">
                ✓ KI-Drehbuch  ✓ Premium Visuals  ✓ Voice-Over  ✓ Musik  ✓ 3 Formate
              </p>
            </div>

            <Button 
              size="lg" 
              className={cn(
                "w-full bg-gradient-to-r from-[#F5C76A] via-[#F5C76A] to-amber-500",
                "hover:shadow-[0_0_30px_rgba(245,199,106,0.4)] text-black font-semibold"
              )}
            >
              Full-Service starten
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </motion.div>

        {/* Manual Mode */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.02 }}
          className={cn(
            "relative overflow-hidden rounded-2xl border-2 cursor-pointer transition-all duration-300",
            "bg-card/60 backdrop-blur-xl",
            "border-white/10 hover:border-white/30",
            "hover:shadow-[0_0_30px_rgba(255,255,255,0.1)]"
          )}
          onClick={() => onSelectMode('manual')}
        >
          <div className="p-8">
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-6">
              <Hand className="h-8 w-8 text-foreground" />
            </div>

            {/* Title */}
            <h3 className="text-2xl font-bold mb-2">✋ Manueller Modus</h3>
            <p className="text-muted-foreground mb-6">
              Volle Kontrolle über jeden Schritt – für kreative Perfektion
            </p>

            {/* Features */}
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                </div>
                <span>Jeden Schritt selbst gestalten</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <span>~20-40 Minuten Bearbeitung</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center">
                  <Hand className="h-4 w-4 text-muted-foreground" />
                </div>
                <span>Szenen einzeln bearbeiten</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center">
                  <Video className="h-4 w-4 text-muted-foreground" />
                </div>
                <span>Bis zu 5 Minuten Videolänge</span>
              </div>
            </div>

            {/* Steps preview */}
            <div className="bg-muted/20 rounded-xl p-4 mb-6">
              <p className="text-xs text-muted-foreground mb-2">8 Schritte:</p>
              <p className="text-sm">
                Briefing → Drehbuch → Storyboard → Visuals → Animation → Audio → Export
              </p>
            </div>

            <Button 
              variant="outline" 
              size="lg" 
              className="w-full"
            >
              Manuell starten
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Compare note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-center text-sm text-muted-foreground mt-8"
      >
        💡 Du kannst jederzeit vom Full-Service in den manuellen Modus wechseln
      </motion.p>
    </div>
  );
}
