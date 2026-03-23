import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Film, Clapperboard, Camera, Tv, Clock, Palette, Layers, PenTool, Box, Minimize2, Zap, Hand, Play, Image, Droplets, Sparkles, Scissors, CuboidIcon as Cube, MonitorSmartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UniversalVideoStyle } from '@/types/universal-video-creator';

interface FilmStyle {
  id: UniversalVideoStyle;
  name: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
}

const FILM_TYPES: FilmStyle[] = [
  { id: 'comic', name: 'Comic', description: 'Kräftige Outlines, Panels, Pop-Art-Feeling', icon: Zap, gradient: 'from-yellow-500 to-orange-500' },
  { id: 'cinematic', name: 'Cinematic', description: 'Filmisch, warm, Kinoformat', icon: Film, gradient: 'from-amber-600 to-rose-600' },
  { id: 'documentary', name: 'Documentary', description: 'Neutral, klar, sachlich', icon: Camera, gradient: 'from-slate-500 to-zinc-600' },
  { id: 'cartoon', name: 'Cartoon', description: 'Bunt, weich, freundlich', icon: Tv, gradient: 'from-green-400 to-cyan-500' },
  { id: 'anime', name: 'Anime', description: 'Japanisch inspiriert, dynamisch', icon: Sparkles, gradient: 'from-pink-500 to-purple-600' },
  { id: 'vintage-retro', name: 'Vintage / Retro', description: 'Sepia, Grain, Nostalgie', icon: Clock, gradient: 'from-amber-700 to-yellow-800' },
];

const DESIGN_STYLES: FilmStyle[] = [
  { id: 'flat-design', name: 'Flat Design', description: 'Sauber, modern, flach', icon: Layers, gradient: 'from-blue-500 to-indigo-500' },
  { id: 'isometric', name: 'Isometric', description: '3D-Perspektive, technisch', icon: Box, gradient: 'from-teal-500 to-emerald-500' },
  { id: 'whiteboard', name: 'Whiteboard', description: 'Skizzen auf weißem Hintergrund', icon: PenTool, gradient: 'from-gray-400 to-gray-600' },
  { id: 'corporate', name: 'Corporate', description: 'Business, seriös, strukturiert', icon: Clapperboard, gradient: 'from-blue-600 to-blue-800' },
  { id: 'modern-3d', name: 'Modern 3D', description: 'Glatte 3D-Renders, futuristisch', icon: Cube, gradient: 'from-violet-500 to-purple-600' },
  { id: 'minimalist', name: 'Minimalistisch', description: 'Wenig Elemente, viel Raum', icon: Minimize2, gradient: 'from-neutral-400 to-neutral-600' },
  { id: 'bold-colorful', name: 'Bold & Colorful', description: 'Kräftige Farben, mutig', icon: Palette, gradient: 'from-rose-500 to-orange-500' },
  { id: 'hand-drawn', name: 'Hand-Drawn', description: 'Handgezeichnet, organisch', icon: Hand, gradient: 'from-amber-500 to-lime-500' },
  { id: 'motion-graphics', name: 'Motion Graphics', description: 'Dynamische Infografiken', icon: Play, gradient: 'from-cyan-500 to-blue-500' },
  { id: 'photo-realistic', name: 'Photo-Realistic', description: 'Fotorealistische Szenen', icon: Image, gradient: 'from-emerald-600 to-teal-700' },
  { id: 'watercolor', name: 'Watercolor', description: 'Aquarell, weich, künstlerisch', icon: Droplets, gradient: 'from-sky-400 to-indigo-400' },
  { id: 'neon-cyberpunk', name: 'Neon Cyberpunk', description: 'Neon-Lichter, futuristisch', icon: MonitorSmartphone, gradient: 'from-fuchsia-500 to-cyan-400' },
  { id: 'paper-cutout', name: 'Paper Cutout', description: 'Papier-Ausschnitt, Bastel-Look', icon: Scissors, gradient: 'from-orange-400 to-red-400' },
  { id: 'clay-3d', name: 'Clay 3D', description: 'Knetmasse, haptisch, verspielt', icon: Cube, gradient: 'from-pink-400 to-rose-500' },
];

interface FilmStyleSelectorProps {
  onConfirm: (style: UniversalVideoStyle) => void;
}

function StyleCard({ style, isSelected, onClick, index }: { style: FilmStyle; isSelected: boolean; onClick: () => void; index: number }) {
  const Icon = style.icon;
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center gap-2 p-4 rounded-xl border backdrop-blur-sm transition-all text-center',
        isSelected
          ? 'border-primary ring-2 ring-primary/30 bg-primary/10'
          : 'border-border/50 bg-card/40 hover:border-border hover:bg-card/60'
      )}
    >
      {isSelected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 right-2 p-0.5 rounded-full bg-primary"
        >
          <Check className="w-3 h-3 text-primary-foreground" />
        </motion.div>
      )}
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br', style.gradient)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{style.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{style.description}</div>
      </div>
    </motion.button>
  );
}

export function FilmStyleSelector({ onConfirm }: FilmStyleSelectorProps) {
  const [selected, setSelected] = useState<UniversalVideoStyle | null>(null);

  const selectedInfo = [...FILM_TYPES, ...DESIGN_STYLES].find(s => s.id === selected);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Filmart & Stil</h2>
        <p className="text-muted-foreground">
          Wähle den visuellen Stil für dein Video — bestimmt wie deine Bilder generiert werden
        </p>
      </div>

      {/* Filmarten */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
          <Film className="w-4 h-4 text-primary" />
          Filmarten
          <span className="text-xs text-muted-foreground font-normal normal-case tracking-normal">— verändert die gesamte Bildästhetik</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {FILM_TYPES.map((style, i) => (
            <StyleCard
              key={style.id}
              style={style}
              isSelected={selected === style.id}
              onClick={() => setSelected(style.id)}
              index={i}
            />
          ))}
        </div>
      </div>

      {/* Stilrichtungen */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          Stilrichtungen
          <span className="text-xs text-muted-foreground font-normal normal-case tracking-normal">— Design- und Rendering-Stil</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {DESIGN_STYLES.map((style, i) => (
            <StyleCard
              key={style.id}
              style={style}
              isSelected={selected === style.id}
              onClick={() => setSelected(style.id)}
              index={i + FILM_TYPES.length}
            />
          ))}
        </div>
      </div>

      {/* Confirm */}
      {selected && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          <button
            onClick={() => onConfirm(selected)}
            className={cn(
              'px-8 py-3 rounded-xl font-semibold text-black',
              'bg-gradient-to-r from-[hsl(var(--primary))] to-amber-500',
              'hover:shadow-[0_0_30px_hsl(var(--primary)/0.4)]',
              'transition-all duration-300',
            )}
          >
            Weiter mit {selectedInfo?.name}
          </button>
        </motion.div>
      )}
    </div>
  );
}
