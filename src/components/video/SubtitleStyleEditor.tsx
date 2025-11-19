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
  animation: 'none' | 'fade' | 'slide' | 'bounce';
  outline: boolean;
  outlineColor: string;
}

interface SubtitleStyleEditorProps {
  style: SubtitleStyle;
  onChange: (style: SubtitleStyle) => void;
  sampleText: string;
  onSampleTextChange: (value: string) => void;
}

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

        {/* Outline */}
        <div className="space-y-2">
          <Label>Umrandung</Label>
          <Select value={style.outline ? 'yes' : 'no'} onValueChange={(value) => updateStyle({ outline: value === 'yes' })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no">Keine Umrandung</SelectItem>
              <SelectItem value="yes">Mit Umrandung</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {style.outline && (
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
              style={{
                fontFamily: style.font,
                fontSize: `${style.fontSize}px`,
                color: style.color,
                backgroundColor: style.backgroundColor,
                opacity: style.backgroundOpacity,
                textShadow: style.outline ? `2px 2px 0 ${style.outlineColor}, -2px -2px 0 ${style.outlineColor}, 2px -2px 0 ${style.outlineColor}, -2px 2px 0 ${style.outlineColor}` : 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                animation: style.animation !== 'none' ? `${style.animation} 2s infinite` : 'none',
              }}
            >
              {sampleText || 'Beispiel-Untertitel'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
