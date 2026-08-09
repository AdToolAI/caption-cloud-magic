import { tx } from "@/lib/i18nText";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GeneratedContent {
  hook: string;
  caption: string;
  hashtags: string[];
  cta: string;
}

interface PostGeneratorInlineProps {
  isOpen: boolean;
  onClose: () => void;
  post: {
    title: string;
    caption_outline: string;
    hashtags: string[];
    cta: string;
    post_type: string;
  };
  postId: string;
  mediaPreview?: string;
  mediaType?: 'image' | 'video';
  platforms: string[];
  onApplyContent: (postId: string, content: GeneratedContent) => void;
}

export const PostGeneratorInline = ({
  isOpen,
  onClose,
  post,
  postId,
  mediaPreview,
  mediaType,
  platforms,
  onApplyContent,
}: PostGeneratorInlineProps) => {
  const [brief, setBrief] = useState(post.caption_outline);
  const [tone, setTone] = useState("friendly");
  const [contentLength, setContentLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [hashtagCount, setHashtagCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [copied, setCopied] = useState(false);

  const lengthMap = { short: 120, medium: 250, long: 400 };

  const handleGenerate = async () => {
    if (!brief.trim()) {
      toast.error(tx({ de: "Bitte gib eine Kurzbeschreibung ein", en: "Please enter a short description", es: "Por favor, introduce una descripción corta" }));
      return;
    }

    setIsGenerating(true);
    try {
      // Map tone to Edge Function expected values
      const toneMap: Record<string, string> = {
        friendly: "friendly",
        professional: "professional",
        casual: "casual",
        inspirational: "inspirational",
        humorous: "humorous",
      };
      
      // Take first platform as string (Edge Function expects single platform)
      const primaryPlatform = platforms[0]?.toLowerCase() || "instagram";
      
      const { data, error } = await supabase.functions.invoke("generate-caption", {
        body: {
          topic: brief.trim(),
          platform: primaryPlatform,
          tone: toneMap[tone] || "friendly",
          language: "de",
          maxLength: lengthMap[contentLength],
          hashtagCount: hashtagCount,
        },
      });

      if (error) throw error;

      // Map response - Edge Function returns caption + hashtags only
      const content: GeneratedContent = {
        hook: "",                        // Edge Function doesn't return hook
        caption: data.caption || "",
        hashtags: data.hashtags || [],
        cta: post.cta || "Link in Bio!", // Use existing CTA or fallback
      };

      setGeneratedContent(content);
      toast.success(tx({ de: "✨ Post-Content generiert!", en: "✨ Post content generated!", es: "✨ ¡Contenido generado!" }));
    } catch (error: any) {
      console.error("Error generating content:", error);
      if (error.message?.includes("429")) {
        toast.error(tx({ de: "Rate-Limit erreicht. Bitte warte einen Moment.", en: "Rate limit reached. Please wait a moment.", es: "Límite de tasa alcanzado. Por favor, espera un momento." }));
      } else if (error.message?.includes("402")) {
        toast.error(tx({ de: "AI Credits aufgebraucht. Bitte Credits aufladen.", en: "AI credits used up. Please top up credits.", es: "Los créditos de IA se agotaron. Por favor recarga créditos." }));
      } else {
        toast.error(tx({ de: "Fehler beim Generieren. Bitte erneut versuchen.", en: "Error generating. Please try again.", es: "Error al generar. Por favor, inténtalo de nuevo." }));
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (generatedContent) {
      onApplyContent(postId, generatedContent);
      toast.success(tx({ de: "✅ Content auf Post angewendet!", en: "✅ Content applied to post!", es: "✅ ¡Contenido aplicado a la publicación!" }));
      onClose();
    }
  };

  const handleCopy = async () => {
    if (!generatedContent) return;
    
    const text = `${generatedContent.hook}\n\n${generatedContent.caption}\n\n${generatedContent.hashtags.join(" ")}\n\n${generatedContent.cta}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(tx({ de: "In Zwischenablage kopiert", en: "Copied to clipboard", es: "Copiado al portapapeles" }));
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {tx({ de: "KI-Post Generator", en: "AI Post Generator", es: "Generador de publicaciones IA" })}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {tx({ de: `Generiere Hook, Caption & Hashtags für "${post.title}"`, en: `Generate hook, caption & hashtags for "${post.title}"`, es: `Genera hook, caption y hashtags para "${post.title}"` })}
          </p>
        </SheetHeader>

        <div className="space-y-6">
          {/* Media Preview */}
          {mediaPreview && (
            <div className="rounded-xl overflow-hidden border border-white/10">
              {mediaType === 'video' ? (
                <video 
                  src={mediaPreview} 
                  controls 
                  className="w-full max-h-48 object-cover"
                />
              ) : (
                <img 
                  src={mediaPreview} 
                  alt="Media" 
                  className="w-full max-h-48 object-cover"
                />
              )}
            </div>
          )}

          {/* Platform Badges */}
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => (
              <Badge key={p} variant="secondary" className="capitalize">
                {p}
              </Badge>
            ))}
            <Badge variant="outline">{post.post_type}</Badge>
          </div>

          {/* Brief Input */}
          <div>
            <Label>{tx({ de: "Kurzbeschreibung / Briefing", en: "Short description / brief", es: "Descripción breve / brief" })}</Label>
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={tx({ de: "Worum geht es in diesem Post? 2-3 Stichpunkte...", en: "What is this post about? 2-3 bullet points...", es: "¿De qué trata esta publicación? 2-3 puntos clave..." })}
              rows={4}
              className="mt-2"
            />
          </div>

          {/* Tone Select */}
          <div>
            <Label>{tx({ de: "Tonfall", en: "Tone", es: "Tono" })}</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">{tx({ de: "Freundlich", en: "Friendly", es: "Amistoso" })}</SelectItem>
                <SelectItem value="professional">{tx({ de: "Professionell", en: "Professional", es: "Profesional" })}</SelectItem>
                <SelectItem value="casual">{tx({ de: "Locker", en: "Casual", es: "Informal" })}</SelectItem>
                <SelectItem value="inspirational">{tx({ de: "Inspirierend", en: "Inspirational", es: "Inspirador" })}</SelectItem>
                <SelectItem value="humorous">{tx({ de: "Humorvoll", en: "Humorous", es: "Humorístico" })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Content Length */}
          <div>
            <Label>{tx({ de: "Content-Länge", en: "Content length", es: "Longitud del contenido" })}</Label>
            <Select value={contentLength} onValueChange={(v) => setContentLength(v as 'short' | 'medium' | 'long')}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">{tx({ de: "Kurz (~120 Zeichen)", en: "Short (~120 characters)", es: "Corto (~120 caracteres)" })}</SelectItem>
                <SelectItem value="medium">{tx({ de: "Mittel (~250 Zeichen)", en: "Medium (~250 characters)", es: "Medio (~250 caracteres)" })}</SelectItem>
                <SelectItem value="long">{tx({ de: "Lang (~400 Zeichen)", en: "Long (~400 characters)", es: "Largo (~400 caracteres)" })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Hashtag Count */}
          <div>
            <Label>{tx({ de: "Anzahl Hashtags", en: "Number of hashtags", es: "Número de hashtags" })}: {hashtagCount}</Label>
            <Slider
              value={[hashtagCount]}
              onValueChange={(v) => setHashtagCount(v[0])}
              min={3}
              max={10}
              step={1}
              className="mt-3"
            />
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !brief.trim()}
            className="w-full gap-2"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {tx({ de: "Generiere...", en: "Generating...", es: "Generando..." })}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {tx({ de: "Content generieren", en: "Generate content", es: "Generar contenido" })}
              </>
            )}
          </Button>

          {/* Generated Content Preview */}
          <AnimatePresence>
            {generatedContent && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4 p-4 rounded-xl bg-muted/30 border border-white/10"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">{tx({ de: "Generierter Content", en: "Generated content", es: "Contenido generado" })}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="gap-1"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copied ? tx({ de: "Kopiert", en: "Copied", es: "Copiado" }) : tx({ de: "Kopieren", en: "Copy", es: "Copiar" })}
                  </Button>
                </div>

                {/* Hook */}
                {generatedContent.hook && (
                  <div>
                    <Label className="text-xs text-muted-foreground">{tx({ de: "Hook", en: "Hook", es: "Gancho" })}</Label>
                    <p className="text-sm font-medium mt-1 p-2 rounded bg-primary/10 border border-primary/20">
                      {generatedContent.hook}
                    </p>
                  </div>
                )}

                {/* Caption */}
                <div>
                  <Label className="text-xs text-muted-foreground">{tx({ de: "Caption", en: "Caption", es: "Título" })}</Label>
                  <p className="text-sm mt-1 whitespace-pre-wrap">
                    {generatedContent.caption}
                  </p>
                </div>

                {/* Hashtags */}
                {generatedContent.hashtags.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">{tx({ de: "Hashtags", en: "Hashtags", es: "Hashtags" })}</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {generatedContent.hashtags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* CTA */}
                {generatedContent.cta && (
                  <div>
                    <Label className="text-xs text-muted-foreground">{tx({ de: "Call-to-Action", en: "Call to action", es: "Llamada a la acción" })}</Label>
                    <p className="text-sm font-medium mt-1 text-primary">
                      🎯 {generatedContent.cta}
                    </p>
                  </div>
                )}

                {/* Apply Button */}
                <Button onClick={handleApply} className="w-full gap-2">
                  <Check className="h-4 w-4" />
                  {tx({ de: "Auf Post anwenden", en: "Apply to post", es: "Aplicar a la publicación" })}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  );
};
