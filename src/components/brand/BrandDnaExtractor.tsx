import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Globe, Image as ImageIcon, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useBrandDnaExtractor, type BrandDnaResult } from "@/hooks/useBrandDnaExtractor";

interface Props {
  onApply: (dna: BrandDnaResult) => void;
}

export function BrandDnaExtractor({ onApply }: Props) {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<BrandDnaResult | null>(null);
  const { mutate, isPending } = useBrandDnaExtractor();
  const { toast } = useToast();

  const handleExtract = () => {
    if (!url.trim()) {
      toast({ title: "URL fehlt", description: "Bitte gib eine Website-URL ein.", variant: "destructive" });
      return;
    }
    let safeUrl = url.trim();
    if (!/^https?:\/\//i.test(safeUrl)) safeUrl = `https://${safeUrl}`;

    mutate(
      { websiteUrl: safeUrl, language: "de" },
      {
        onSuccess: (d) => {
          setResult(d);
          toast({
            title: "Brand DNA extrahiert",
            description: `Konfidenz: ${Math.round((d.confidence ?? 0) * 100)}%`,
          });
        },
        onError: (e) => {
          toast({
            title: "Extraktion fehlgeschlagen",
            description: e.message ?? "Bitte versuche es erneut.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Card className="relative overflow-hidden border-white/10 bg-gradient-to-br from-card/80 via-card/60 to-card/40 backdrop-blur-xl">
      {/* Glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative z-10 p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-2.5">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Brand DNA Extractor</h3>
            <p className="text-sm text-muted-foreground">
              Gib deine Website-URL ein — die KI extrahiert Farben, Fonts, Tone & Keywords automatisch.
            </p>
          </div>
          <Badge variant="outline" className="ml-auto border-primary/30 text-primary">
            NEU
          </Badge>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://deine-marke.com"
              className="pl-9 bg-background/50"
              onKeyDown={(e) => e.key === "Enter" && handleExtract()}
            />
          </div>
          <Button
            onClick={handleExtract}
            disabled={isPending}
            className="bg-gradient-to-r from-primary to-accent text-primary-foreground"
          >
            {isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analysiere…</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> DNA extrahieren</>
            )}
          </Button>
        </div>

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4 rounded-xl border border-white/10 bg-background/40 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {result.source} · Konfidenz {Math.round((result.confidence ?? 0) * 100)}%
                  </div>
                  <div className="text-base font-semibold">
                    {result.brand_name ?? "Unbenannte Marke"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => onApply(result)}
                  className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
                >
                  <Check className="mr-1.5 h-4 w-4" /> Übernehmen
                </Button>
              </div>

              {result.brand_description && (
                <p className="text-sm text-muted-foreground">{result.brand_description}</p>
              )}

              {/* Palette */}
              {result.palette && result.palette.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">Palette</div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.palette.map((c) => (
                      <div key={c} className="flex items-center gap-1.5 rounded-md border border-white/10 bg-background/60 px-2 py-1">
                        <span className="inline-block h-4 w-4 rounded" style={{ background: c }} />
                        <span className="font-mono text-xs">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fonts + Tone */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                {result.fonts?.headline && (
                  <div>
                    <div className="text-xs text-muted-foreground">Headline</div>
                    <div className="font-medium">{result.fonts.headline}</div>
                  </div>
                )}
                {result.fonts?.body && (
                  <div>
                    <div className="text-xs text-muted-foreground">Body</div>
                    <div className="font-medium">{result.fonts.body}</div>
                  </div>
                )}
                {result.tone && (
                  <div>
                    <div className="text-xs text-muted-foreground">Tone</div>
                    <div className="font-medium capitalize">{result.tone}</div>
                  </div>
                )}
              </div>

              {/* Keywords */}
              {result.keywords && result.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.keywords.map((k) => (
                    <Badge key={k} variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                      {k}
                    </Badge>
                  ))}
                </div>
              )}

              {result.ai_comment && (
                <p className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-3">
                  {result.ai_comment}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" />
          Tipp: Bald auch per Screenshot- oder Logo-Upload.
        </div>
      </div>
    </Card>
  );
}
