import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Stamp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_WATERMARK_CONFIG,
  type WatermarkConfig,
  type WatermarkPosition,
  type WatermarkSize,
} from '@/types/video-composer';

interface WatermarkEditorProps {
  value: WatermarkConfig | undefined;
  onChange: (next: WatermarkConfig) => void;
}

const POSITIONS: Array<{ id: WatermarkPosition; label: string }> = [
  { id: 'top-left', label: '↖' },
  { id: 'top-right', label: '↗' },
  { id: 'center', label: '●' },
  { id: 'bottom-left', label: '↙' },
  { id: 'bottom-right', label: '↘' },
];

const SIZES: Array<{ id: WatermarkSize; label: string; px: number }> = [
  { id: 'small', label: 'Klein', px: 16 },
  { id: 'medium', label: 'Mittel', px: 24 },
  { id: 'large', label: 'Groß', px: 36 },
];

export default function WatermarkEditor({ value, onChange }: WatermarkEditorProps) {
  const config: WatermarkConfig = value ?? DEFAULT_WATERMARK_CONFIG;
  const update = (patch: Partial<WatermarkConfig>) => onChange({ ...config, ...patch });

  // Live preview alignment
  const previewAlign = (() => {
    const justify =
      config.position === 'top-left' || config.position === 'bottom-left'
        ? 'flex-start'
        : config.position === 'top-right' || config.position === 'bottom-right'
        ? 'flex-end'
        : 'center';
    const align =
      config.position === 'top-left' || config.position === 'top-right'
        ? 'flex-start'
        : config.position === 'bottom-left' || config.position === 'bottom-right'
        ? 'flex-end'
        : 'center';
    return { justifyContent: justify, alignItems: align };
  })();

  const previewFontPx =
    SIZES.find((s) => s.id === config.size)?.px ?? 24;

  return (
    <Card className="border-border/40 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Stamp className="h-4 w-4 text-primary" /> Wasserzeichen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Wasserzeichen anzeigen</p>
            <p className="text-[10px] text-muted-foreground">
              Eigener Text-Stempel über dem ganzen Video
            </p>
          </div>
          <Switch
            checked={!!config.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
          />
        </div>

        {config.enabled && (
          <>
            {/* Text */}
            <div className="space-y-1.5">
              <Label className="text-xs">Text</Label>
              <Input
                value={config.text}
                onChange={(e) => update({ text: e.target.value })}
                placeholder="@deinname  ·  MyBrand  ·  www.example.com"
                maxLength={60}
              />
            </div>

            {/* Position */}
            <div className="space-y-1.5">
              <Label className="text-xs">Position</Label>
              <div className="grid grid-cols-5 gap-2">
                {POSITIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => update({ position: p.id })}
                    className={cn(
                      'h-10 rounded-md border text-base transition-all',
                      config.position === p.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/40 hover:border-primary/50 text-muted-foreground'
                    )}
                    aria-label={p.id}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Size */}
            <div className="space-y-1.5">
              <Label className="text-xs">Größe</Label>
              <div className="grid grid-cols-3 gap-2">
                {SIZES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => update({ size: s.id })}
                    className={cn(
                      'h-9 rounded-md border text-xs font-medium transition-all',
                      config.size === s.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/40 hover:border-primary/50 text-muted-foreground'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Opacity */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Deckkraft</Label>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {Math.round(config.opacity * 100)}%
                </span>
              </div>
              <Slider
                value={[Math.round(config.opacity * 100)]}
                min={30}
                max={100}
                step={5}
                onValueChange={([v]) => update({ opacity: v / 100 })}
              />
            </div>

            {/* Live preview */}
            <div className="space-y-1.5">
              <Label className="text-xs">Vorschau</Label>
              <div
                className="relative w-full h-32 rounded-md overflow-hidden border border-border/40 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex p-3"
                style={previewAlign}
              >
                <span
                  style={{
                    fontSize: `${Math.max(10, previewFontPx * 0.45)}px`,
                    color: '#FFFFFF',
                    opacity: config.opacity,
                    fontWeight: 600,
                    textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {config.text || 'Dein Watermark'}
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
