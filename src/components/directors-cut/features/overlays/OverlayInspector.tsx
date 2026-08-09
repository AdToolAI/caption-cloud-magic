import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OverlayAnimation, TextOverlay } from '@/types/directors-cut';
import { useTx } from '@/lib/i18nText';
import { tx } from '@/lib/i18nText';

interface OverlayInspectorProps {
  overlay: TextOverlay;
  onUpdate: (patch: Partial<TextOverlay>) => void;
  onUpdateStyle: (patch: Partial<TextOverlay['style']>) => void;
}

function useAnimationOptions(tx: ReturnType<typeof useTx>): { value: OverlayAnimation; label: string }[] {
  return [
    { value: 'none', label: tx({ de: 'Ohne', en: 'None', es: 'Ninguna' }) },
    { value: 'fadeIn', label: tx({ de: 'Einblenden', en: 'Fade in', es: 'Aparecer' }) },
    { value: 'slideUp', label: tx({ de: 'Von unten', en: 'From below', es: 'Desde abajo' }) },
    { value: 'slideDown', label: tx({ de: 'Von oben', en: 'From above', es: 'Desde arriba' }) },
    { value: 'slideLeft', label: tx({ de: 'Von rechts', en: 'From the right', es: 'Desde la derecha' }) },
    { value: 'slideRight', label: tx({ de: 'Von links', en: 'From the left', es: 'Desde la izquierda' }) },
    { value: 'wipe', label: 'Wipe' },
    { value: 'pop', label: 'Pop' },
    { value: 'blurIn', label: 'Blur-In' },
    { value: 'scaleUp', label: 'Scale Up' },
    { value: 'stagger', label: tx({ de: 'Wort für Wort', en: 'Word by word', es: 'Palabra por palabra' }) },
    { value: 'typewriter', label: tx({ de: 'Schreibmaschine', en: 'Typewriter', es: 'Máquina de escribir' }) },
    { value: 'tickerLoop', label: tx({ de: 'Ticker-Lauf', en: 'Ticker loop', es: 'Bucle de ticker' }) },
  ];
}

const FILLS = ['transparent', 'rgba(10,10,15,0.85)', 'rgba(255,255,255,0.14)', '#F5C76A', '#E5484D', '#0A84FF'];
const COLORS = ['#FFFFFF', '#0A0A0F', '#F5C76A', '#E5484D', '#34C759', '#0A84FF'];

/** Kontext-Inspektor für Grafik-Overlays (Banner, Schilder, Störer …). */
export function OverlayInspector({ overlay, onUpdate, onUpdateStyle }: OverlayInspectorProps) {
  const tx = useTx();
  const ANIMATION_OPTIONS = useAnimationOptions(tx);
  const s = overlay.style;
  const box = overlay.box ?? { x: 0.1, y: 0.4, w: 0.8, h: 0.15 };
  const hasSlots = ['lowerThird', 'card', 'quote', 'banner'].includes(overlay.kind ?? 'text');

  return (
    <div className="space-y-5 min-w-0">
      {/* Inhalt */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{overlay.kind === 'progress' ? tx({ de: 'Beschriftung (optional)', en: 'Label (optional)', es: 'Etiqueta (opcional)' }) : tx({ de: 'Text', en: 'Text', es: 'Texto' })}</Label>
        <Textarea
          value={overlay.text}
          onChange={(e) => onUpdate({ text: e.target.value, slots: hasSlots ? { ...overlay.slots, title: e.target.value } : overlay.slots })}
          rows={2}
          className="resize-y bg-white/5 border-white/20 focus:border-primary [overflow-wrap:anywhere]"
        />
        {hasSlots && (
          <Input
            value={overlay.slots?.subtitle ?? ''}
            onChange={(e) => onUpdate({ slots: { ...overlay.slots, subtitle: e.target.value } })}
            placeholder={tx({ de: "Unterzeile", en: "Subtitle", es: "Subtítulo" })}
            className="bg-white/5 border-white/20"
          />
        )}
        {overlay.kind === 'logo' && (
          <Input
            value={overlay.slots?.imageUrl ?? ''}
            onChange={(e) => onUpdate({ slots: { ...overlay.slots, imageUrl: e.target.value || null } })}
            placeholder={tx({ de: "Logo-URL (leer = Text)", en: "Logo URL (empty = text)", es: "URL del logo (vacío = texto)" })}
            className="bg-white/5 border-white/20"
          />
        )}
      </div>

      {/* Animation */}
      <div className="grid grid-cols-2 gap-3 min-w-0">
        <div className="space-y-2 min-w-0">
          <Label className="text-sm font-medium">{tx({ de: 'Einblendung', en: 'Entry', es: 'Entrada' })}</Label>
          <Select
            value={overlay.enter ?? overlay.animation}
            onValueChange={(v) => onUpdate({ enter: v as OverlayAnimation, animation: v as TextOverlay['animation'] })}
          >
            <SelectTrigger className="bg-white/5 border-white/20"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-background z-50">
              {ANIMATION_OPTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 min-w-0">
          <Label className="text-sm font-medium">{tx({ de: 'Ausblendung', en: 'Exit', es: 'Salida' })}</Label>
          <Select value={overlay.exit ?? 'none'} onValueChange={(v) => onUpdate({ exit: v as OverlayAnimation })}>
            <SelectTrigger className="bg-white/5 border-white/20"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-background z-50">
              {ANIMATION_OPTIONS.filter((a) => a.value !== 'tickerLoop' && a.value !== 'typewriter').map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Typografie */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <Label className="font-medium">{tx({ de: 'Schriftgröße', en: 'Font size', es: 'Tamaño de fuente' })}</Label>
            <span className="text-muted-foreground">{Math.round((s.fontSizeRel ?? 0.038) * 1080)} px</span>
          </div>
          <Slider
            value={[Math.round((s.fontSizeRel ?? 0.038) * 1080)]}
            min={14}
            max={140}
            step={1}
            onValueChange={([v]) => onUpdateStyle({ fontSizeRel: v / 1080 })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 min-w-0">
          <div className="space-y-1.5 min-w-0">
            <Label className="text-sm font-medium">{tx({ de: 'Schriftstärke', en: 'Font weight', es: 'Grosor de fuente' })}</Label>
            <Select value={String(s.fontWeight ?? 700)} onValueChange={(v) => onUpdateStyle({ fontWeight: Number(v) })}>
              <SelectTrigger className="bg-white/5 border-white/20"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-background z-50">
                {[400, 500, 600, 700, 800, 900].map((w) => (
                  <SelectItem key={w} value={String(w)}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-0">
            <Label className="text-sm font-medium">{tx({ de: 'Ausrichtung', en: 'Alignment', es: 'Alineación' })}</Label>
            <Select value={s.align ?? 'center'} onValueChange={(v) => onUpdateStyle({ align: v as 'left' | 'center' | 'right' })}>
              <SelectTrigger className="bg-white/5 border-white/20"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="left">{tx({ de: 'Links', en: 'Left', es: 'Izquierda' })}</SelectItem>
                <SelectItem value="center">{tx({ de: 'Mittig', en: 'Center', es: 'Centro' })}</SelectItem>
                <SelectItem value="right">{tx({ de: 'Rechts', en: 'Right', es: 'Derecha' })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={s.uppercase ?? false} onCheckedChange={(v) => onUpdateStyle({ uppercase: v })} />
          <span className="text-sm text-muted-foreground">{tx({ de: 'Großbuchstaben', en: 'Uppercase', es: 'Mayúsculas' })}</span>
        </div>
      </div>

      {/* Farben */}
      <div className="grid grid-cols-2 gap-4 min-w-0">
        <div className="space-y-2 min-w-0">
          <Label className="text-sm font-medium">{tx({ de: 'Textfarbe', en: 'Text color', es: 'Color de texto' })}</Label>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onUpdateStyle({ color: c })}
                className={`w-7 h-7 rounded-lg border-2 ${s.color === c ? 'border-white' : 'border-transparent hover:border-white/50'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-2 min-w-0">
          <Label className="text-sm font-medium">{tx({ de: 'Fläche', en: 'Fill', es: 'Relleno' })}</Label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              title={tx({ de: "Goldverlauf", en: "Gold gradient", es: "Degradado dorado" })}
              onClick={() => onUpdateStyle({ fill: null, backgroundColor: undefined, gradient: ['#F5C76A', '#C79B3F'] })}
              className={`w-7 h-7 rounded-lg border-2 ${
                !s.fill && !s.backgroundColor && s.gradient ? 'border-white' : 'border-transparent hover:border-white/50'
              }`}
              style={{ background: 'linear-gradient(135deg, #F5C76A, #C79B3F)' }}
            />
            {FILLS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onUpdateStyle({ fill: c, backgroundColor: undefined, gradient: null })}
                className={`w-7 h-7 rounded-lg border-2 ${
                  (s.fill ?? s.backgroundColor) === c ? 'border-white' : 'border-transparent hover:border-white/50'
                } ${c === 'transparent' ? 'bg-[repeating-conic-gradient(#808080_0_90deg,transparent_0_180deg)_0_0/8px_8px]' : ''}`}
                style={c === 'transparent' ? undefined : { backgroundColor: c }}
              />
            ))}

          </div>
        </div>

      </div>

      {/* Form */}
      <div className="grid grid-cols-2 gap-4 min-w-0">
        <div className="space-y-1.5 min-w-0">
          <div className="flex justify-between text-sm">
            <Label className="font-medium">{tx({ de: 'Ecken', en: 'Corners', es: 'Bordes' })}</Label>
            <span className="text-muted-foreground">{Math.round((s.radius ?? 0.014) * 1080)} px</span>
          </div>
          <Slider value={[Math.round((s.radius ?? 0.014) * 1080)]} min={0} max={120} step={1} onValueChange={([v]) => onUpdateStyle({ radius: v / 1080 })} />
        </div>
        <div className="space-y-1.5 min-w-0">
          <div className="flex justify-between text-sm">
            <Label className="font-medium">{tx({ de: 'Deckkraft', en: 'Opacity', es: 'Opacidad' })}</Label>
            <span className="text-muted-foreground">{Math.round((s.opacity ?? 1) * 100)} %</span>
          </div>
          <Slider value={[Math.round((s.opacity ?? 1) * 100)]} min={10} max={100} step={1} onValueChange={([v]) => onUpdateStyle({ opacity: v / 100 })} />
        </div>
        <div className="space-y-1.5 min-w-0">
          <div className="flex justify-between text-sm">
            <Label className="font-medium">{tx({ de: 'Drehung', en: 'Rotation', es: 'Rotación' })}</Label>
            <span className="text-muted-foreground">{Math.round(s.rotation ?? 0)}°</span>
          </div>
          <Slider value={[Math.round(s.rotation ?? 0)]} min={-30} max={30} step={1} onValueChange={([v]) => onUpdateStyle({ rotation: v })} />
        </div>
        <div className="space-y-1.5 min-w-0">
          <div className="flex justify-between text-sm">
            <Label className="font-medium">{tx({ de: 'Rand', en: 'Border', es: 'Borde' })}</Label>
            <span className="text-muted-foreground">{Math.round((s.borderWidth ?? 0) * 1080)} px</span>
          </div>
          <Slider
            value={[Math.round((s.borderWidth ?? 0) * 1080)]}
            min={0}
            max={12}
            step={1}
            onValueChange={([v]) => onUpdateStyle({ borderWidth: v / 1080, borderColor: s.borderColor ?? '#FFFFFF' })}
          />
        </div>
      </div>

      {/* Feinposition */}
      <div className="grid grid-cols-2 gap-4 min-w-0">
        {(
          [
            ['x', tx({ de: 'Links', en: 'Left', es: 'Izquierda' })],
            ['y', tx({ de: 'Oben', en: 'Top', es: 'Arriba' })],
            ['w', tx({ de: 'Breite', en: 'Width', es: 'Ancho' })],
            ['h', tx({ de: 'Höhe', en: 'Height', es: 'Alto' })],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-1.5 min-w-0">
            <div className="flex justify-between text-sm">
              <Label className="font-medium">{label}</Label>
              <span className="text-muted-foreground">{Math.round(box[key] * 100)} %</span>
            </div>
            <Slider
              value={[Math.round(box[key] * 100)]}
              min={key === 'w' || key === 'h' ? 4 : 0}
              max={100}
              step={1}
              onValueChange={([v]) => onUpdate({ box: { ...box, [key]: v / 100 } })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
