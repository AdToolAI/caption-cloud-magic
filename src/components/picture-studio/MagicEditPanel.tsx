import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Brush, Eraser, Undo2, Upload, Wand2, Loader2, Image as ImageIcon, Maximize2, Sparkles } from "lucide-react";
import { useMagicEdit } from "@/hooks/useMagicEdit";
import { useAIVideoWallet } from "@/hooks/useAIVideoWallet";
import { toast } from "sonner";

type Direction = 'left' | 'right' | 'top' | 'bottom' | 'all';

const COSTS = { inpaint: 0.08, outpaint: 0.10 };

export function MagicEditPanel() {
  const { wallet } = useAIVideoWallet();
  const { edit, isEditing } = useMagicEdit();

  // Source image
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number } | null>(null);

  // Mode
  const [mode, setMode] = useState<'inpaint' | 'outpaint'>('inpaint');

  // Inpaint state
  const [prompt, setPrompt] = useState('');
  const [brushSize, setBrushSize] = useState(40);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isDrawingRef = useRef(false);
  const historyRef = useRef<ImageData[]>([]);

  // Outpaint state
  const [direction, setDirection] = useState<Direction>('all');

  // Result
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sym = wallet?.currency === 'USD' ? '$' : '€';
  const cost = COSTS[mode];

  // ── File upload ──
  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Bitte ein Bild auswählen');
      return;
    }
    setSourceFile(file);
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setResultUrl(null);
  };

  // ── Init canvas when image loads ──
  useEffect(() => {
    if (!sourceUrl || !imgRef.current || !canvasRef.current) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const onLoad = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setSourceDims({ w, h });
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, w, h);
      historyRef.current = [ctx.getImageData(0, 0, w, h)];
    };
    if (img.complete) onLoad();
    else img.addEventListener('load', onLoad);
    return () => img.removeEventListener('load', onLoad);
  }, [sourceUrl]);

  // ── Drawing ──
  const getCanvasPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    isDrawingRef.current = true;
    const ctx = canvasRef.current.getContext('2d')!;
    // save snapshot for undo
    historyRef.current.push(ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height));
    if (historyRef.current.length > 20) historyRef.current.shift();
    drawAt(e);
  };

  const drawAt = (e: React.PointerEvent) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const { x, y } = getCanvasPoint(e);
    const scale = canvasRef.current.width / (canvasRef.current.getBoundingClientRect().width || 1);
    const radius = (brushSize * scale) / 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = tool === 'brush' ? 'white' : 'black';
    ctx.fill();
  };

  const endDraw = () => {
    isDrawingRef.current = false;
  };

  const undo = () => {
    if (!canvasRef.current || historyRef.current.length <= 1) return;
    historyRef.current.pop(); // current
    const prev = historyRef.current[historyRef.current.length - 1];
    canvasRef.current.getContext('2d')!.putImageData(prev, 0, 0);
  };

  const clearMask = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    historyRef.current = [ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)];
  };

  const hasMaskPainted = useCallback((): boolean => {
    if (!canvasRef.current) return false;
    const ctx = canvasRef.current.getContext('2d')!;
    const data = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height).data;
    // Sample every 200th pixel for speed
    for (let i = 0; i < data.length; i += 800) {
      if (data[i] > 50) return true;
    }
    return false;
  }, []);

  // ── Submit ──
  const handleSubmit = async () => {
    if (!sourceFile && !sourceUrl) {
      toast.error('Bitte Bild hochladen');
      return;
    }
    if (!prompt.trim()) {
      toast.error('Bitte Prompt eingeben');
      return;
    }
    if (mode === 'inpaint' && !hasMaskPainted()) {
      toast.error('Bitte den zu bearbeitenden Bereich mit dem Pinsel markieren');
      return;
    }

    // Upload original to public bucket so Replicate can access it
    let publicImageUrl = sourceUrl!;
    if (sourceFile) {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Bitte einloggen');
        return;
      }
      const ext = sourceFile.name.split('.').pop() || 'png';
      const path = `${user.id}/picture-studio/sources/src-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('background-projects')
        .upload(path, sourceFile, { contentType: sourceFile.type, upsert: false });
      if (upErr) {
        toast.error(`Upload fehlgeschlagen: ${upErr.message}`);
        return;
      }
      const { data: pub } = supabase.storage.from('background-projects').getPublicUrl(path);
      publicImageUrl = pub.publicUrl;
    }

    // Convert mask canvas to blob if inpaint
    let maskBlob: Blob | undefined;
    if (mode === 'inpaint' && canvasRef.current) {
      maskBlob = await new Promise<Blob>((resolve) => {
        canvasRef.current!.toBlob((b) => resolve(b!), 'image/png');
      });
    }

    const result = await edit({
      imageUrl: publicImageUrl,
      mode,
      prompt: prompt.trim(),
      maskBlob,
      outpaintDirection: mode === 'outpaint' ? direction : undefined,
    });

    if (result) {
      setResultUrl(result.url);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="p-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="text-xl font-bold">Magic Edit</h3>
                <Badge variant="outline" className="border-primary/40 text-primary">FLUX Fill Pro</Badge>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Inpainting: Markiere einen Bereich und beschreibe was dort entstehen soll.
                Outpainting: Erweitere das Bild über den ursprünglichen Rahmen hinaus.
              </p>
            </div>
            {wallet && (
              <Badge variant="secondary" className="text-sm">
                Guthaben: {sym}{wallet.balance_euros.toFixed(2)}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mode Tabs */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="inpaint" className="gap-2">
            <Brush className="h-4 w-4" /> Inpaint
          </TabsTrigger>
          <TabsTrigger value="outpaint" className="gap-2">
            <Maximize2 className="h-4 w-4" /> Outpaint
          </TabsTrigger>
        </TabsList>

        {/* Upload area shared */}
        <div className="mt-4">
          {!sourceUrl ? (
            <Card
              className="border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
            >
              <CardContent className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <Upload className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="font-semibold mb-1">Bild hochladen</p>
                <p className="text-sm text-muted-foreground">JPG, PNG oder WebP. Drag & Drop unterstützt.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Editor / source */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">
                      {mode === 'inpaint' ? '1. Bereich markieren' : '1. Vorschau'}
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSourceUrl(null);
                        setSourceFile(null);
                        setResultUrl(null);
                      }}
                    >
                      Anderes Bild
                    </Button>
                  </div>

                  <div className="relative w-full bg-muted rounded-lg overflow-hidden" style={{ aspectRatio: sourceDims ? `${sourceDims.w}/${sourceDims.h}` : '1' }}>
                    <img
                      ref={imgRef}
                      src={sourceUrl}
                      alt="source"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      crossOrigin="anonymous"
                    />
                    {mode === 'inpaint' && (
                      <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full opacity-50 mix-blend-screen cursor-crosshair touch-none"
                        style={{ background: 'transparent' }}
                        onPointerDown={startDraw}
                        onPointerMove={drawAt}
                        onPointerUp={endDraw}
                        onPointerLeave={endDraw}
                      />
                    )}
                    {mode === 'outpaint' && (
                      <div className="absolute inset-0 pointer-events-none">
                        {direction === 'all' && <div className="absolute inset-[-10%] border-2 border-dashed border-primary/60 rounded" />}
                        {direction === 'left' && <div className="absolute inset-y-0 -left-[20%] w-[20%] border-2 border-dashed border-primary/60" />}
                        {direction === 'right' && <div className="absolute inset-y-0 -right-[20%] w-[20%] border-2 border-dashed border-primary/60" />}
                        {direction === 'top' && <div className="absolute inset-x-0 -top-[20%] h-[20%] border-2 border-dashed border-primary/60" />}
                        {direction === 'bottom' && <div className="absolute inset-x-0 -bottom-[20%] h-[20%] border-2 border-dashed border-primary/60" />}
                      </div>
                    )}
                  </div>

                  {/* Brush controls (inpaint only) */}
                  {mode === 'inpaint' && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant={tool === 'brush' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTool('brush')}
                          className="gap-2"
                        >
                          <Brush className="h-4 w-4" /> Pinsel
                        </Button>
                        <Button
                          variant={tool === 'eraser' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTool('eraser')}
                          className="gap-2"
                        >
                          <Eraser className="h-4 w-4" /> Radierer
                        </Button>
                        <Button variant="outline" size="sm" onClick={undo} className="gap-2">
                          <Undo2 className="h-4 w-4" /> Undo
                        </Button>
                        <Button variant="ghost" size="sm" onClick={clearMask}>
                          Reset
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Pinselgröße</span>
                          <span className="font-mono">{brushSize}px</span>
                        </div>
                        <Slider
                          value={[brushSize]}
                          onValueChange={([v]) => setBrushSize(v)}
                          min={10}
                          max={200}
                          step={5}
                        />
                      </div>
                    </div>
                  )}

                  {/* Outpaint direction */}
                  {mode === 'outpaint' && (
                    <div className="space-y-2 pt-2">
                      <Label className="text-xs text-muted-foreground">Erweiterungsrichtung</Label>
                      <div className="grid grid-cols-5 gap-2">
                        {(['all', 'left', 'right', 'top', 'bottom'] as Direction[]).map((d) => (
                          <Button
                            key={d}
                            variant={direction === d ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setDirection(d)}
                          >
                            {d === 'all' ? 'Alle' : d === 'left' ? '←' : d === 'right' ? '→' : d === 'top' ? '↑' : '↓'}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Prompt + Result */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div>
                    <Label className="text-sm font-semibold">2. Beschreibung</Label>
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={
                        mode === 'inpaint'
                          ? 'z.B. "ein roter Sportwagen, fotorealistisch, dramatisches Licht"'
                          : 'z.B. "weiter Sandstrand mit Palmen, goldene Stunde"'
                      }
                      rows={4}
                      className="mt-2 resize-none"
                    />
                  </div>

                  <Button
                    onClick={handleSubmit}
                    disabled={isEditing}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {isEditing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Generiere...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        {mode === 'inpaint' ? 'Magic Edit anwenden' : 'Bild erweitern'}
                        <Badge variant="secondary" className="ml-1">{sym}{cost.toFixed(2)}</Badge>
                      </>
                    )}
                  </Button>

                  {/* Result */}
                  {resultUrl ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2"
                    >
                      <Label className="text-sm font-semibold">Ergebnis</Label>
                      <div className="relative w-full bg-muted rounded-lg overflow-hidden">
                        <img src={resultUrl} alt="result" className="w-full h-auto" />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild className="flex-1">
                          <a href={resultUrl} target="_blank" rel="noopener noreferrer" download>
                            Download
                          </a>
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={async () => {
                            // Use result as new source
                            const res = await fetch(resultUrl);
                            const blob = await res.blob();
                            const file = new File([blob], 'result.jpg', { type: 'image/jpeg' });
                            handleFile(file);
                          }}
                        >
                          Weiter bearbeiten
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex items-center justify-center py-8 border-2 border-dashed border-border rounded-lg">
                      <div className="text-center text-muted-foreground">
                        <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Ergebnis erscheint hier</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <TabsContent value="inpaint" />
        <TabsContent value="outpaint" />
      </Tabs>
    </div>
  );
}
