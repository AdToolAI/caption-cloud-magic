import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, X, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!brief.trim()) {
      toast.error("Bitte gib eine Kurzbeschreibung ein");
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
          topic: brief.trim(),           // Edge Function expects "topic"
          platform: primaryPlatform,     // Edge Function expects single "platform" string
          tone: toneMap[tone] || "friendly",
          language: "de",
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
      toast.success("✨ Post-Content generiert!");
    } catch (error: any) {
      console.error("Error generating content:", error);
      if (error.message?.includes("429")) {
        toast.error("Rate-Limit erreicht. Bitte warte einen Moment.");
      } else if (error.message?.includes("402")) {
        toast.error("AI Credits aufgebraucht. Bitte Credits aufladen.");
      } else {
        toast.error("Fehler beim Generieren. Bitte erneut versuchen.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (generatedContent) {
      onApplyContent(postId, generatedContent);
      toast.success("✅ Content auf Post angewendet!");
      onClose();
    }
  };

  const handleCopy = async () => {
    if (!generatedContent) return;
    
    const text = `${generatedContent.hook}\n\n${generatedContent.caption}\n\n${generatedContent.hashtags.join(" ")}\n\n${generatedContent.cta}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("In Zwischenablage kopiert");
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            KI-Post Generator
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Generiere Hook, Caption & Hashtags für "{post.title}"
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
            <Label>Kurzbeschreibung / Briefing</Label>
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Worum geht es in diesem Post? 2-3 Stichpunkte..."
              rows={4}
              className="mt-2"
            />
          </div>

          {/* Tone Select */}
          <div>
            <Label>Tonfall</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Freundlich</SelectItem>
                <SelectItem value="professional">Professionell</SelectItem>
                <SelectItem value="casual">Locker</SelectItem>
                <SelectItem value="inspirational">Inspirierend</SelectItem>
                <SelectItem value="humorous">Humorvoll</SelectItem>
              </SelectContent>
            </Select>
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
                Generiere...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Content generieren
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
                  <h4 className="font-semibold text-sm">Generierter Content</h4>
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
                    {copied ? "Kopiert" : "Kopieren"}
                  </Button>
                </div>

                {/* Hook */}
                {generatedContent.hook && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Hook</Label>
                    <p className="text-sm font-medium mt-1 p-2 rounded bg-primary/10 border border-primary/20">
                      {generatedContent.hook}
                    </p>
                  </div>
                )}

                {/* Caption */}
                <div>
                  <Label className="text-xs text-muted-foreground">Caption</Label>
                  <p className="text-sm mt-1 whitespace-pre-wrap">
                    {generatedContent.caption}
                  </p>
                </div>

                {/* Hashtags */}
                {generatedContent.hashtags.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Hashtags</Label>
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
                    <Label className="text-xs text-muted-foreground">Call-to-Action</Label>
                    <p className="text-sm font-medium mt-1 text-primary">
                      🎯 {generatedContent.cta}
                    </p>
                  </div>
                )}

                {/* Apply Button */}
                <Button onClick={handleApply} className="w-full gap-2">
                  <Check className="h-4 w-4" />
                  Auf Post anwenden
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  );
};
