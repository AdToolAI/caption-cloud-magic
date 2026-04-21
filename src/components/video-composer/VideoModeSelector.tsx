import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Film, Image as ImageIcon, Layers, Sparkles } from 'lucide-react';
import type { VideoMode } from '@/types/video-composer';

interface VideoModeSelectorProps {
  value: VideoMode;
  language: string;
  onChange: (mode: VideoMode) => void;
}

const MODES: Array<{
  id: VideoMode;
  icon: React.ElementType;
  badge?: { label: { de: string; en: string; es: string }; tone: 'gold' | 'green' | 'cyan' };
  title: { de: string; en: string; es: string };
  desc: { de: string; en: string; es: string };
  cost: { de: string; en: string; es: string };
}> = [
  {
    id: 'video',
    icon: Film,
    badge: { label: { de: 'Premium', en: 'Premium', es: 'Premium' }, tone: 'gold' },
    title: {
      de: 'KI Video-Clips',
      en: 'AI Video Clips',
      es: 'Clips de Video IA',
    },
    desc: {
      de: 'Echte AI-Videoclips (Hailuo / Kling / Sora). Höchste Qualität, dynamische Bewegung.',
      en: 'Real AI video clips (Hailuo / Kling / Sora). Top quality, dynamic motion.',
      es: 'Clips de video IA reales (Hailuo / Kling / Sora). Máxima calidad y movimiento dinámico.',
    },
    cost: {
      de: '~€0.15 – 0.53 / Sek',
      en: '~€0.15 – 0.53 / sec',
      es: '~€0.15 – 0.53 / seg',
    },
  },
  {
    id: 'image',
    icon: ImageIcon,
    badge: { label: { de: 'Günstig', en: 'Budget', es: 'Económico' }, tone: 'green' },
    title: {
      de: 'KI Bild-Szenen',
      en: 'AI Image Scenes',
      es: 'Escenas de Imagen IA',
    },
    desc: {
      de: 'Gemini-Bilder mit cineastischer Ken-Burns-Animation und Glow-Effekten. ~6× günstiger.',
      en: 'Gemini images with cinematic Ken-Burns animation and glow effects. ~6× cheaper.',
      es: 'Imágenes de Gemini con animación Ken-Burns cinematográfica y efectos de brillo. ~6× más barato.',
    },
    cost: {
      de: '~€0.05 / Szene',
      en: '~€0.05 / scene',
      es: '~€0.05 / escena',
    },
  },
  {
    id: 'mixed',
    icon: Layers,
    badge: { label: { de: 'Smart', en: 'Smart', es: 'Inteligente' }, tone: 'cyan' },
    title: {
      de: 'Mixed Mode',
      en: 'Mixed Mode',
      es: 'Modo Mixto',
    },
    desc: {
      de: 'Hero-Szenen (Hook & CTA) als Video, Rest als animierte Bilder. Beste Balance.',
      en: 'Hero scenes (hook & CTA) as video, rest as animated images. Best balance.',
      es: 'Escenas hero (hook y CTA) como video, el resto como imágenes animadas. Mejor balance.',
    },
    cost: {
      de: '~50 % Ersparnis',
      en: '~50% savings',
      es: '~50% de ahorro',
    },
  },
];

export default function VideoModeSelector({ value, language, onChange }: VideoModeSelectorProps) {
  const lang = (language === 'de' || language === 'es' ? language : 'en') as 'de' | 'en' | 'es';
  const headerTitle =
    lang === 'de' ? 'Video-Modus' : lang === 'es' ? 'Modo de Video' : 'Video Mode';
  const headerDesc =
    lang === 'de'
      ? 'Wähle, wie deine Szenen erstellt werden — Video, animierte Bilder oder eine Mischung.'
      : lang === 'es'
        ? 'Elige cómo se crean tus escenas — video, imágenes animadas o una combinación.'
        : 'Choose how your scenes are produced — video, animated images, or a mix.';

  return (
    <Card className="border-border/40 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {headerTitle}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{headerDesc}</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MODES.map(({ id, icon: Icon, badge, title, desc, cost }) => {
            const isActive = value === id;
            const toneClass =
              badge?.tone === 'gold'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : badge?.tone === 'green'
                  ? 'border-green-500/40 bg-green-500/10 text-green-300'
                  : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300';
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(id)}
                className={`relative p-4 rounded-lg border text-left transition-all ${
                  isActive
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border/40 hover:border-border'
                }`}
              >
                {badge && (
                  <Badge
                    variant="outline"
                    className={`absolute top-2 right-2 text-[9px] px-1.5 py-0 h-4 ${toneClass}`}
                  >
                    {badge.label[lang]}
                  </Badge>
                )}
                <Icon
                  className={`h-5 w-5 mb-2 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                />
                <p className={`font-medium text-sm ${isActive ? 'text-primary' : ''}`}>
                  {title[lang]}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-3">
                  {desc[lang]}
                </p>
                <p className="text-[10px] text-foreground/70 mt-2 font-mono">{cost[lang]}</p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
