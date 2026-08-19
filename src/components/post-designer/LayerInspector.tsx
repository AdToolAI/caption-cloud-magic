import { tx } from "@/lib/i18nText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Copy, Lock, Unlock, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import type { BadgeLayer, ImageLayer, Layer, LogoLayer, PostDesign, ShapeLayer, TextLayer } from "@/lib/post-design/schema";
import { cn } from "@/lib/utils";

interface LayerInspectorProps {
  design: PostDesign;
  layer: Layer | null;
  onChange: (patch: Partial<Layer>) => void;
  onCommit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onReplaceImage: () => void;
}

function ColorRow({
  label,
  value,
  palette,
  onPick,
}: {
  label: string;
  value: string;
  palette: PostDesign["palette"];
  onPick: (color: string) => void;
}) {
  const swatches = [palette.text, palette.accent, palette.background, palette.surface, "#FFFFFF", "#000000"];
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            className={cn(
              "h-7 w-7 rounded-full border transition-transform hover:scale-110",
              value.toLowerCase() === c.toLowerCase() ? "border-primary ring-2 ring-primary/40" : "border-border",
            )}
            style={{ background: c }}
            aria-label={c}
          />
        ))}
      </div>
    </div>
  );
}

export function LayerInspector({
  design,
  layer,
  onChange,
  onCommit,
  onDelete,
  onDuplicate,
  onReplaceImage,
}: LayerInspectorProps) {
  if (!layer) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium">Nichts ausgewählt</p>
        <p className="text-xs text-muted-foreground">
          Klicke ein Element auf der Bühne an, um Text, Farbe und Position zu ändern.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{layer.type}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange({ locked: !layer.locked } as Partial<Layer>)}>
            {layer.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDuplicate}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {layer.type === "text" && (
          <>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Text</Label>
              <Textarea
                value={(layer as TextLayer).text}
                rows={3}
                onChange={(e) => onChange({ text: e.target.value } as Partial<Layer>)}
                onBlur={onCommit}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Schriftgrad</Label>
              <Slider
                value={[Math.round((layer as TextLayer).size * 1000)]}
                min={16}
                max={240}
                step={2}
                onValueChange={([v]) => onChange({ size: v / 1000 } as Partial<Layer>)}
                onValueCommit={onCommit}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Schrift</Label>
                <Select
                  value={(layer as TextLayer).font}
                  onValueChange={(v) => {
                    onChange({ font: v as TextLayer["font"] } as Partial<Layer>);
                    onCommit();
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="display">Display</SelectItem>
                    <SelectItem value="body">Fließtext</SelectItem>
                    <SelectItem value="mono">Mono</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Gewicht</Label>
                <Select
                  value={String((layer as TextLayer).weight)}
                  onValueChange={(v) => {
                    onChange({ weight: Number(v) } as Partial<Layer>);
                    onCommit();
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[300, 400, 500, 600, 700, 800].map((w) => (
                      <SelectItem key={w} value={String(w)}>{w}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Ausrichtung</Label>
              <div className="flex gap-1">
                {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
                  <Button
                    key={a}
                    type="button"
                    variant={(layer as TextLayer).align === a ? "default" : "outline"}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => {
                      onChange({ align: a } as Partial<Layer>);
                      onCommit();
                    }}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            </div>
            <ColorRow
              label="Farbe"
              value={(layer as TextLayer).color}
              palette={design.palette}
              onPick={(c) => {
                onChange({ color: c } as Partial<Layer>);
                onCommit();
              }}
            />
          </>
        )}

        {layer.type === "badge" && (
          <>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Beschriftung</Label>
              <Input
                value={(layer as BadgeLayer).text}
                onChange={(e) => onChange({ text: e.target.value } as Partial<Layer>)}
                onBlur={onCommit}
              />
            </div>
            <ColorRow
              label="Hintergrund"
              value={(layer as BadgeLayer).bg}
              palette={design.palette}
              onPick={(c) => {
                onChange({ bg: c } as Partial<Layer>);
                onCommit();
              }}
            />
            <ColorRow
              label="Textfarbe"
              value={(layer as BadgeLayer).color}
              palette={design.palette}
              onPick={(c) => {
                onChange({ color: c } as Partial<Layer>);
                onCommit();
              }}
            />
          </>
        )}

        {layer.type === "image" && (
          <>
            <Button variant="outline" className="w-full" onClick={onReplaceImage}>
              Bild ersetzen
            </Button>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Zoom</Label>
              <Slider
                value={[Math.round(((layer as ImageLayer).zoom ?? 1) * 100)]}
                min={100}
                max={250}
                step={5}
                onValueChange={([v]) => onChange({ zoom: v / 100 } as Partial<Layer>)}
                onValueCommit={onCommit}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Abdunkeln (Lesbarkeit)</Label>
              <Slider
                value={[Math.round(((layer as ImageLayer).scrim ?? 0) * 100)]}
                min={0}
                max={90}
                step={5}
                onValueChange={([v]) => onChange({ scrim: v / 100 } as Partial<Layer>)}
                onValueCommit={onCommit}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Verlaufsrichtung</Label>
              <Select
                value={(layer as ImageLayer).scrimDirection ?? "bottom"}
                onValueChange={(v) => {
                  onChange({ scrimDirection: v as ImageLayer["scrimDirection"] } as Partial<Layer>);
                  onCommit();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom">Unten</SelectItem>
                  <SelectItem value="top">Oben</SelectItem>
                  <SelectItem value="left">Links</SelectItem>
                  <SelectItem value="full">Ganzflächig</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Ecken</Label>
              <Slider
                value={[(layer as ImageLayer).radius ?? 0]}
                min={0}
                max={200}
                step={4}
                onValueChange={([v]) => onChange({ radius: v } as Partial<Layer>)}
                onValueCommit={onCommit}
              />
            </div>
          </>
        )}

        {layer.type === "shape" && (
          <>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Form</Label>
              <Select
                value={(layer as ShapeLayer).shape}
                onValueChange={(v) => {
                  onChange({ shape: v as ShapeLayer["shape"] } as Partial<Layer>);
                  onCommit();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rect">Rechteck</SelectItem>
                  <SelectItem value="pill">Pille</SelectItem>
                  <SelectItem value="circle">Kreis</SelectItem>
                  <SelectItem value="line">Linie</SelectItem>
                  <SelectItem value="gradient">Verlauf</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ColorRow
              label="Farbe"
              value={(layer as ShapeLayer).color}
              palette={design.palette}
              onPick={(c) => {
                onChange({ color: c } as Partial<Layer>);
                onCommit();
              }}
            />
          </>
        )}

        {layer.type === "logo" && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{tx({ de: "Ersatztext (ohne Logo-Datei)", en: "Replacement text (without logo file)", es: "Texto de reemplazo (sin archivo de logo)" })}</Label>
            <Input
              value={(layer as LogoLayer).fallbackText ?? ""}
              onChange={(e) => onChange({ fallbackText: e.target.value } as Partial<Layer>)}
              onBlur={onCommit}
            />
          </div>
        )}

        <div className="space-y-2 border-t border-border/60 pt-4">
          <Label className="text-xs text-muted-foreground">Deckkraft</Label>
          <Slider
            value={[Math.round((layer.opacity ?? 1) * 100)]}
            min={10}
            max={100}
            step={5}
            onValueChange={([v]) => onChange({ opacity: v / 100 } as Partial<Layer>)}
            onValueCommit={onCommit}
          />
        </div>
      </div>
    </div>
  );
}
