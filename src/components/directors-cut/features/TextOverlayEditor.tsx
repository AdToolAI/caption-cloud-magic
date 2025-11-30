import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Type, Plus, Trash2, Copy, Move, Sparkles,
  AlignCenter, AlignLeft, AlignRight, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TextOverlay, TEXT_OVERLAY_TEMPLATES } from '@/types/directors-cut';

interface TextOverlayEditorProps {
  overlays: TextOverlay[];
  onOverlaysChange: (overlays: TextOverlay[]) => void;
  videoDuration: number;
  currentTime?: number;
}

const ANIMATIONS = [
  { id: 'fadeIn', name: 'Fade In', icon: '✨' },
  { id: 'scaleUp', name: 'Scale Up', icon: '🔍' },
  { id: 'bounce', name: 'Bounce', icon: '⬆️' },
  { id: 'typewriter', name: 'Typewriter', icon: '⌨️' },
  { id: 'highlight', name: 'Highlight', icon: '🖌️' },
  { id: 'glitch', name: 'Glitch', icon: '⚡' },
] as const;

const POSITIONS = [
  { id: 'topLeft', name: '↖ O.L.', icon: AlignLeft },
  { id: 'top', name: '⬆ Oben', icon: AlignCenter },
  { id: 'topRight', name: '↗ O.R.', icon: AlignRight },
  { id: 'centerLeft', name: '⬅ M.L.', icon: AlignLeft },
  { id: 'center', name: '⏺ Mitte', icon: AlignCenter },
  { id: 'centerRight', name: '➡ M.R.', icon: AlignRight },
  { id: 'bottomLeft', name: '↙ U.L.', icon: AlignLeft },
  { id: 'bottom', name: '⬇ Unten', icon: AlignCenter },
  { id: 'bottomRight', name: '↘ U.R.', icon: AlignRight },
] as const;

const FONT_SIZES = [
  { id: 'sm', name: 'Klein', px: '16px' },
  { id: 'md', name: 'Mittel', px: '24px' },
  { id: 'lg', name: 'Groß', px: '36px' },
  { id: 'xl', name: 'Riesig', px: '48px' },
] as const;

const FONT_FAMILIES = [
  { id: 'sans-serif', name: 'Sans Serif' },
  { id: 'serif', name: 'Serif' },
  { id: 'monospace', name: 'Monospace' },
] as const;

const PRESET_COLORS = [
  '#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff',
  '#ffff00', '#ff00ff', '#00ffff', '#ff6600', '#9933ff',
];

export function TextOverlayEditor({
  overlays,
  onOverlaysChange,
  videoDuration,
  currentTime = 0,
}: TextOverlayEditorProps) {
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overlays' | 'templates'>('overlays');

  const selectedOverlay = overlays.find(o => o.id === selectedOverlayId);

  const addOverlay = (template?: typeof TEXT_OVERLAY_TEMPLATES[number]) => {
    const newOverlay: TextOverlay = {
      id: `overlay-${Date.now()}`,
      text: template?.text || 'Neuer Text',
      animation: template?.animation || 'fadeIn',
      position: template?.position || 'center',
      startTime: currentTime,
      endTime: null,
      style: template?.style || {
        fontSize: 'md',
        color: '#ffffff',
        backgroundColor: 'transparent',
        shadow: true,
        fontFamily: 'sans-serif',
      },
    };
    onOverlaysChange([...overlays, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
    setActiveTab('overlays');
  };

  const updateOverlay = (id: string, updates: Partial<TextOverlay>) => {
    onOverlaysChange(overlays.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const updateOverlayStyle = (id: string, styleUpdates: Partial<TextOverlay['style']>) => {
    const overlay = overlays.find(o => o.id === id);
    if (overlay) {
      updateOverlay(id, { style: { ...overlay.style, ...styleUpdates } });
    }
  };

  const deleteOverlay = (id: string) => {
    onOverlaysChange(overlays.filter(o => o.id !== id));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  };

  const duplicateOverlay = (id: string) => {
    const overlay = overlays.find(o => o.id === id);
    if (overlay) {
      const newOverlay = { ...overlay, id: `overlay-${Date.now()}` };
      onOverlaysChange([...overlays, newOverlay]);
      setSelectedOverlayId(newOverlay.id);
    }
  };

  return (
    <Card className="backdrop-blur-xl bg-white/5 border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Type className="h-5 w-5 text-primary" />
          Text & Overlays
          {overlays.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {overlays.length} aktiv
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="overlays">Overlays</TabsTrigger>
            <TabsTrigger value="templates">Vorlagen</TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">
              Schnell-Vorlagen mit einem Klick hinzufügen
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TEXT_OVERLAY_TEMPLATES.map((template) => (
                <motion.button
                  key={template.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => addOverlay(template)}
                  className="p-3 rounded-lg bg-white/5 border border-white/10 hover:border-primary/50 hover:bg-white/10 transition-all text-left"
                >
                  <div className="font-medium text-sm">{template.name}</div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    "{template.text}"
                  </div>
                </motion.button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="overlays" className="space-y-3 mt-3">
            {/* Add New Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => addOverlay()}
              className="w-full border-dashed"
            >
              <Plus className="h-4 w-4 mr-2" />
              Neues Overlay hinzufügen
            </Button>

            {/* Overlay List */}
            {overlays.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Type className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Keine Overlays vorhanden</p>
                <p className="text-sm">Füge Text, CTAs oder Watermarks hinzu</p>
              </div>
            ) : (
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  <AnimatePresence>
                    {overlays.map((overlay) => (
                      <motion.div
                        key={overlay.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`p-3 rounded-lg border transition-all cursor-pointer ${
                          selectedOverlayId === overlay.id
                            ? 'bg-primary/10 border-primary'
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                        onClick={() => setSelectedOverlayId(overlay.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {overlay.text}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {ANIMATIONS.find(a => a.id === overlay.animation)?.icon}{' '}
                                {ANIMATIONS.find(a => a.id === overlay.animation)?.name}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {overlay.startTime.toFixed(1)}s
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => { e.stopPropagation(); duplicateOverlay(overlay.id); }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); deleteOverlay(overlay.id); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            )}

            {/* Selected Overlay Editor */}
            {selectedOverlay && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4 pt-4 border-t border-white/10"
              >
                {/* Text Input */}
                <div className="space-y-2">
                  <Label className="text-sm">Text</Label>
                  <Input
                    value={selectedOverlay.text}
                    onChange={(e) => updateOverlay(selectedOverlay.id, { text: e.target.value })}
                    placeholder="Text eingeben..."
                    className="bg-white/5"
                  />
                </div>

                {/* Animation Selection */}
                <div className="space-y-2">
                  <Label className="text-sm">Animation</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {ANIMATIONS.map((anim) => (
                      <Button
                        key={anim.id}
                        variant={selectedOverlay.animation === anim.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateOverlay(selectedOverlay.id, { animation: anim.id as TextOverlay['animation'] })}
                        className="text-xs"
                      >
                        {anim.icon} {anim.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Position Selection */}
                <div className="space-y-2">
                  <Label className="text-sm">Position</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {POSITIONS.map((pos) => (
                      <Button
                        key={pos.id}
                        variant={selectedOverlay.position === pos.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateOverlay(selectedOverlay.id, { position: pos.id as TextOverlay['position'] })}
                        className="text-xs"
                      >
                        {pos.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Timing */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Start
                    </Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[selectedOverlay.startTime]}
                        min={0}
                        max={videoDuration}
                        step={0.1}
                        onValueChange={([v]) => updateOverlay(selectedOverlay.id, { startTime: v })}
                        className="flex-1"
                      />
                      <span className="text-xs w-10 text-right">{selectedOverlay.startTime.toFixed(1)}s</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Ende
                    </Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[selectedOverlay.endTime ?? videoDuration]}
                        min={selectedOverlay.startTime}
                        max={videoDuration}
                        step={0.1}
                        onValueChange={([v]) => updateOverlay(selectedOverlay.id, { endTime: v >= videoDuration ? null : v })}
                        className="flex-1"
                      />
                      <span className="text-xs w-10 text-right">
                        {selectedOverlay.endTime ? `${selectedOverlay.endTime.toFixed(1)}s` : 'Ende'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Font Size */}
                <div className="space-y-2">
                  <Label className="text-sm">Schriftgröße</Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {FONT_SIZES.map((size) => (
                      <Button
                        key={size.id}
                        variant={selectedOverlay.style.fontSize === size.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateOverlayStyle(selectedOverlay.id, { fontSize: size.id as TextOverlay['style']['fontSize'] })}
                        className="text-xs"
                      >
                        {size.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Font Family */}
                <div className="space-y-2">
                  <Label className="text-sm">Schriftart</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {FONT_FAMILIES.map((font) => (
                      <Button
                        key={font.id}
                        variant={selectedOverlay.style.fontFamily === font.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateOverlayStyle(selectedOverlay.id, { fontFamily: font.id })}
                        className="text-xs"
                        style={{ fontFamily: font.id }}
                      >
                        {font.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Colors */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">Textfarbe</Label>
                    <div className="flex flex-wrap gap-1">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => updateOverlayStyle(selectedOverlay.id, { color })}
                          className={`w-6 h-6 rounded border-2 transition-all ${
                            selectedOverlay.style.color === color ? 'border-primary scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Hintergrund</Label>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => updateOverlayStyle(selectedOverlay.id, { backgroundColor: 'transparent' })}
                        className={`w-6 h-6 rounded border-2 transition-all bg-[repeating-conic-gradient(#808080_0_90deg,transparent_0_180deg)_0_0/8px_8px] ${
                          selectedOverlay.style.backgroundColor === 'transparent' ? 'border-primary scale-110' : 'border-white/20'
                        }`}
                      />
                      {['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.8)', 'rgba(255,255,255,0.3)', 'rgba(220,38,38,0.9)', 'rgba(59,130,246,0.9)'].map((color) => (
                        <button
                          key={color}
                          onClick={() => updateOverlayStyle(selectedOverlay.id, { backgroundColor: color })}
                          className={`w-6 h-6 rounded border-2 transition-all ${
                            selectedOverlay.style.backgroundColor === color ? 'border-primary scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Shadow Toggle */}
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Textschatten</Label>
                  <Button
                    variant={selectedOverlay.style.shadow ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateOverlayStyle(selectedOverlay.id, { shadow: !selectedOverlay.style.shadow })}
                  >
                    {selectedOverlay.style.shadow ? 'An' : 'Aus'}
                  </Button>
                </div>
              </motion.div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
