import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Film, Clapperboard, Camera, Tv, Clock, Palette, Layers, PenTool, Box, Minimize2, Zap, Hand, Play, Image, Droplets, Sparkles, Scissors, CuboidIcon as Cube, MonitorSmartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import type { UniversalVideoStyle } from '@/types/universal-video-creator';

interface FilmStyle {
  id: UniversalVideoStyle;
  nameKey: string;
  descKey: string;
  icon: React.ElementType;
  gradient: string;
}

const FILM_TYPES: FilmStyle[] = [
  { id: 'comic', nameKey: 'style_comic', descKey: 'style_comic_desc', icon: Zap, gradient: 'from-yellow-500 to-orange-500' },
  { id: 'cinematic', nameKey: 'style_cinematic', descKey: 'style_cinematic_desc', icon: Film, gradient: 'from-amber-600 to-rose-600' },
  { id: 'documentary', nameKey: 'style_documentary', descKey: 'style_documentary_desc', icon: Camera, gradient: 'from-slate-500 to-zinc-600' },
  { id: 'cartoon', nameKey: 'style_cartoon', descKey: 'style_cartoon_desc', icon: Tv, gradient: 'from-green-400 to-cyan-500' },
  { id: 'anime', nameKey: 'style_anime', descKey: 'style_anime_desc', icon: Sparkles, gradient: 'from-pink-500 to-purple-600' },
  { id: 'vintage-retro', nameKey: 'style_vintage', descKey: 'style_vintage_desc', icon: Clock, gradient: 'from-amber-700 to-yellow-800' },
];

const DESIGN_STYLES: FilmStyle[] = [
  { id: 'flat-design', nameKey: 'style_flat', descKey: 'style_flat_desc', icon: Layers, gradient: 'from-blue-500 to-indigo-500' },
  { id: 'isometric', nameKey: 'style_isometric', descKey: 'style_isometric_desc', icon: Box, gradient: 'from-teal-500 to-emerald-500' },
  { id: 'whiteboard', nameKey: 'style_whiteboard', descKey: 'style_whiteboard_desc', icon: PenTool, gradient: 'from-gray-400 to-gray-600' },
  { id: 'corporate', nameKey: 'style_corporate', descKey: 'style_corporate_desc', icon: Clapperboard, gradient: 'from-blue-600 to-blue-800' },
  { id: 'modern-3d', nameKey: 'style_modern3d', descKey: 'style_modern3d_desc', icon: Cube, gradient: 'from-violet-500 to-purple-600' },
  { id: 'minimalist', nameKey: 'style_minimalist', descKey: 'style_minimalist_desc', icon: Minimize2, gradient: 'from-neutral-400 to-neutral-600' },
  { id: 'bold-colorful', nameKey: 'style_bold', descKey: 'style_bold_desc', icon: Palette, gradient: 'from-rose-500 to-orange-500' },
  { id: 'hand-drawn', nameKey: 'style_handdrawn', descKey: 'style_handdrawn_desc', icon: Hand, gradient: 'from-amber-500 to-lime-500' },
  { id: 'motion-graphics', nameKey: 'style_motiongraphics', descKey: 'style_motiongraphics_desc', icon: Play, gradient: 'from-cyan-500 to-blue-500' },
  { id: 'photo-realistic', nameKey: 'style_photorealistic', descKey: 'style_photorealistic_desc', icon: Image, gradient: 'from-emerald-600 to-teal-700' },
  { id: 'watercolor', nameKey: 'style_watercolor', descKey: 'style_watercolor_desc', icon: Droplets, gradient: 'from-sky-400 to-indigo-400' },
  { id: 'neon-cyberpunk', nameKey: 'style_neon', descKey: 'style_neon_desc', icon: MonitorSmartphone, gradient: 'from-fuchsia-500 to-cyan-400' },
  { id: 'paper-cutout', nameKey: 'style_paper', descKey: 'style_paper_desc', icon: Scissors, gradient: 'from-orange-400 to-red-400' },
  { id: 'clay-3d', nameKey: 'style_clay', descKey: 'style_clay_desc', icon: Cube, gradient: 'from-pink-400 to-rose-500' },
];

interface FilmStyleSelectorProps {
  onConfirm: (style: UniversalVideoStyle) => void;
}

function StyleCard({ style, isSelected, onClick, index, t }: { style: FilmStyle; isSelected: boolean; onClick: () => void; index: number; t: (key: string) => any }) {
  const Icon = style.icon;
  const name = t(`uvc.${style.nameKey}`);
  const desc = t(`uvc.${style.descKey}`);
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
        <div className="text-sm font-semibold text-foreground">{typeof name === 'string' && !name.startsWith('uvc.') ? name : style.nameKey}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{typeof desc === 'string' && !desc.startsWith('uvc.') ? desc : style.descKey}</div>
      </div>
    </motion.button>
  );
}

export function FilmStyleSelector({ onConfirm }: FilmStyleSelectorProps) {
  const [selected, setSelected] = useState<UniversalVideoStyle | null>(null);
  const { t } = useTranslation();

  const selectedInfo = [...FILM_TYPES, ...DESIGN_STYLES].find(s => s.id === selected);
  const selectedName = selectedInfo ? t(`uvc.${selectedInfo.nameKey}`) : '';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">{t('uvc.filmStyleTitle')}</h2>
        <p className="text-muted-foreground">
          {t('uvc.filmStyleDesc')}
        </p>
      </div>

      {/* Filmarten */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
          <Film className="w-4 h-4 text-primary" />
          {t('uvc.filmTypes')}
          <span className="text-xs text-muted-foreground font-normal normal-case tracking-normal">— {t('uvc.filmTypesHint')}</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {FILM_TYPES.map((style, i) => (
            <StyleCard
              key={style.id}
              style={style}
              isSelected={selected === style.id}
              onClick={() => setSelected(style.id)}
              index={i}
              t={t}
            />
          ))}
        </div>
      </div>

      {/* Stilrichtungen */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          {t('uvc.designStyles')}
          <span className="text-xs text-muted-foreground font-normal normal-case tracking-normal">— {t('uvc.designStylesHint')}</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {DESIGN_STYLES.map((style, i) => (
            <StyleCard
              key={style.id}
              style={style}
              isSelected={selected === style.id}
              onClick={() => setSelected(style.id)}
              index={i + FILM_TYPES.length}
              t={t}
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
            {t('uvc.continueWith')} {typeof selectedName === 'string' && !selectedName.startsWith('uvc.') ? selectedName : selected}
          </button>
        </motion.div>
      )}
    </div>
  );
}
