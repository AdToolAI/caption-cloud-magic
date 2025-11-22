import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export interface SubtitleStyle {
  position: 'top' | 'center' | 'bottom';
  font: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  animation: 'none' | 'fade' | 'slide' | 'bounce' | 'typewriter' | 'highlight' | 'scaleUp' | 'glitch';
  animationSpeed: number;
  outlineStyle: 'none' | 'stroke' | 'box' | 'box-stroke' | 'glow' | 'shadow';
  outlineColor: string;
  outlineWidth: number;
}

interface SubtitleStyleEditorProps {
  style: SubtitleStyle;
  onChange: (style: SubtitleStyle) => void;
  sampleText: string;
  onSampleTextChange: (value: string) => void;
}

const generateStrokeShadow = (color: string, width: number) => {
  const shadows = [];
  for (let x = -width; x <= width; x++) {
    for (let y = -width; y <= width; y++) {
      if (x !== 0 || y !== 0) {
        shadows.push(`${x}px ${y}px 0 ${color}`);
      }
    }
  }
  return shadows.join(', ');
};

const getPreviewStyles = (style: SubtitleStyle): React.CSSProperties => {
  const baseStyle = {
    fontFamily: style.font || 'Inter',
    fontSize: `${style.fontSize || 28}px`,
    fontWeight: 600,
    color: style.color || '#FFFFFF',
    animation: style.animation !== 'none' ? `${style.animation} 2s infinite` : 'none',
  };

  switch (style.outlineStyle) {
    case 'none':
      return {
        ...baseStyle,
        backgroundColor: 'transparent',
        textShadow: 'none',
      };

    case 'stroke':
      return {
        ...baseStyle,
        backgroundColor: 'transparent',
        textShadow: generateStrokeShadow(style.outlineColor, style.outlineWidth),
      };

    case 'box':
      return {
        ...baseStyle,
        backgroundColor: style.backgroundColor 
          ? `${style.backgroundColor}${Math.round((style.backgroundOpacity || 0.8) * 255).toString(16).padStart(2, '0')}`
          : 'rgba(0, 0, 0, 0.8)',
        textShadow: 'none',
      };

    case 'box-stroke':
      return {
        ...baseStyle,
        backgroundColor: style.backgroundColor 
          ? `${style.backgroundColor}${Math.round((style.backgroundOpacity || 0.8) * 255).toString(16).padStart(2, '0')}`
          : 'rgba(0, 0, 0, 0.8)',
        textShadow: generateStrokeShadow(style.outlineColor, style.outlineWidth),
      };

    case 'glow':
      return {
        ...baseStyle,
        backgroundColor: 'transparent',
        textShadow: `
          0 0 10px ${style.outlineColor}80,
          0 0 20px ${style.outlineColor}60,
          0 0 30px ${style.outlineColor}40
        `,
      };

    case 'shadow':
      return {
        ...baseStyle,
        backgroundColor: 'transparent',
        textShadow: `2px 2px 4px ${style.outlineColor}`,
      };

    default:
      return baseStyle;
  }
};

export const SubtitleStyleEditor = ({ style, onChange, sampleText, onSampleTextChange }: SubtitleStyleEditorProps) => {
  const updateStyle = (updates: Partial<SubtitleStyle>) => {
    onChange({ ...style, ...updates });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Untertitel-Styling</CardTitle>
        <CardDescription>Passe Aussehen und Animation der Untertitel an</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Position */}
        <div className="space-y-2">
          <Label>Position</Label>
          <Select value={style.position} onValueChange={(value) => updateStyle({ position: value as SubtitleStyle['position'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top">Oben</SelectItem>
              <SelectItem value="center">Mitte</SelectItem>
              <SelectItem value="bottom">Unten</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Font Selection */}
        <div className="space-y-2">
          <Label>Schriftart</Label>
          <Select value={style.font} onValueChange={(value) => updateStyle({ font: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Arial">Arial</SelectItem>
              <SelectItem value="Helvetica">Helvetica</SelectItem>
              <SelectItem value="Inter">Inter</SelectItem>
              <SelectItem value="Roboto">Roboto</SelectItem>
              <SelectItem value="Montserrat">Montserrat (Bold)</SelectItem>
              <SelectItem value="Poppins">Poppins (Modern)</SelectItem>
              <SelectItem value="Oswald">Oswald (Impact)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Font Size */}
        <div className="space-y-2">
          <Label>Schriftgröße</Label>
          <Slider
            value={[style.fontSize]}
            onValueChange={([value]) => updateStyle({ fontSize: value })}
            min={12}
            max={48}
            step={2}
            className="w-full"
          />
          <div className="text-sm text-muted-foreground text-right">{style.fontSize}px</div>
        </div>

        {/* Text Color */}
        <div className="space-y-2">
          <Label>Textfarbe</Label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={style.color}
              onChange={(e) => updateStyle({ color: e.target.value })}
              className="w-16 h-10 cursor-pointer"
            />
            <Input
              type="text"
              value={style.color}
              onChange={(e) => updateStyle({ color: e.target.value })}
              className="flex-1"
              placeholder="#FFFFFF"
            />
          </div>
        </div>

        {/* Outline Style */}
        <div className="space-y-2">
          <Label>Umrandungs-Stil</Label>
          <Select 
            value={style.outlineStyle} 
            onValueChange={(value) => updateStyle({ outlineStyle: value as SubtitleStyle['outlineStyle'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-4 rounded border flex items-center justify-center text-xs">A</div>
                  Keine Umrandung
                </div>
              </SelectItem>
              <SelectItem value="stroke">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-4 rounded border flex items-center justify-center text-xs font-bold" 
                       style={{ textShadow: '1px 1px 0 black, -1px -1px 0 black' }}>A</div>
                  Text-Umrandung
                </div>
              </SelectItem>
              <SelectItem value="box">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-4 rounded bg-black/80 flex items-center justify-center text-xs text-white">A</div>
                  Hintergrund-Box
                </div>
              </SelectItem>
              <SelectItem value="box-stroke">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-4 rounded bg-black/80 flex items-center justify-center text-xs text-white font-bold" 
                       style={{ textShadow: '1px 1px 0 black, -1px -1px 0 black' }}>A</div>
                  Box + Umrandung
                </div>
              </SelectItem>
              <SelectItem value="glow">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-4 rounded flex items-center justify-center text-xs" 
                       style={{ textShadow: '0 0 10px rgba(255,255,255,0.8)' }}>A</div>
                  Glow-Effekt
                </div>
              </SelectItem>
              <SelectItem value="shadow">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-4 rounded flex items-center justify-center text-xs" 
                       style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>A</div>
                  Drop-Shadow
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Outline Width - Only for stroke and box-stroke */}
        {(style.outlineStyle === 'stroke' || style.outlineStyle === 'box-stroke') && (
          <div className="space-y-2">
            <Label>Umrandungs-Dicke</Label>
            <Slider
              value={[style.outlineWidth]}
              onValueChange={([value]) => updateStyle({ outlineWidth: value })}
              min={1}
              max={5}
              step={0.5}
              className="w-full"
            />
            <div className="text-sm text-muted-foreground text-right">{style.outlineWidth}px</div>
          </div>
        )}

        {/* Outline Color - Only for styles that need it */}
        {style.outlineStyle !== 'none' && style.outlineStyle !== 'box' && (
          <div className="space-y-2">
            <Label>Umrandungsfarbe</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={style.outlineColor}
                onChange={(e) => updateStyle({ outlineColor: e.target.value })}
                className="w-16 h-10 cursor-pointer"
              />
              <Input
                type="text"
                value={style.outlineColor}
                onChange={(e) => updateStyle({ outlineColor: e.target.value })}
                className="flex-1"
                placeholder="#000000"
              />
            </div>
          </div>
        )}

        {/* Background settings - Only for box and box-stroke */}
        {(style.outlineStyle === 'box' || style.outlineStyle === 'box-stroke') && (
          <>
            {/* Background Color */}
            <div className="space-y-2">
              <Label>Hintergrundfarbe</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={style.backgroundColor}
                  onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
                  className="w-16 h-10 cursor-pointer"
                />
                <Input
                  type="text"
                  value={style.backgroundColor}
                  onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
                  className="flex-1"
                  placeholder="#000000"
                />
              </div>
            </div>

            {/* Background Opacity */}
            <div className="space-y-2">
              <Label>Hintergrund-Transparenz</Label>
              <Slider
                value={[style.backgroundOpacity]}
                onValueChange={([value]) => updateStyle({ backgroundOpacity: value })}
                min={0}
                max={1}
                step={0.1}
                className="w-full"
              />
              <div className="text-sm text-muted-foreground text-right">
                {Math.round(style.backgroundOpacity * 100)}%
              </div>
            </div>
          </>
        )}

        {/* Animation */}
        <div className="space-y-2">
          <Label>Animation</Label>
          <Select value={style.animation} onValueChange={(value) => updateStyle({ animation: value as SubtitleStyle['animation'] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Keine Animation</SelectItem>
              <SelectItem value="fade">Fade In/Out</SelectItem>
              <SelectItem value="slide">Slide In/Out</SelectItem>
              <SelectItem value="bounce">Bounce</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Subtitle Text Input */}
        <div className="space-y-2">
          <Label htmlFor="subtitle-sample">Untertitel-Text (Vorschau)</Label>
          <Input
            id="subtitle-sample"
            value={sampleText}
            onChange={(e) => onSampleTextChange(e.target.value)}
            placeholder="Beispiel-Untertitel eingeben..."
            className="w-full"
          />
        </div>

        {/* Preview */}
        <div className="pt-4 border-t">
          <Label className="mb-3 block">Vorschau</Label>
          <div className="relative bg-muted rounded-lg h-32 overflow-hidden flex items-center justify-center">
            <div
              className={
                (style.outlineStyle === 'box' || style.outlineStyle === 'box-stroke') 
                  ? 'px-6 py-3 rounded-lg' 
                  : ''
              }
              style={getPreviewStyles(style)}
            >
              {sampleText || 'Beispiel-Untertitel'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
