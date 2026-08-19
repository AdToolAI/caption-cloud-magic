import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Upload, Sparkles, Library, Images } from "lucide-react";
import { tx } from "@/lib/i18nText";

interface ImageSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (url: string) => void;
}

export function ImageSourceDialog({ open, onOpenChange, onPick }: ImageSourceDialogProps) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [libraryItems, setLibraryItems] = useState<{ url: string; name: string }[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [stockQuery, setStockQuery] = useState("");
  const [stockResults, setStockResults] = useState<{ url: string; preview: string; credit: string }[]>([]);
  const [stockState, setStockState] = useState<"idle" | "loading" | "unavailable">("idle");

  useEffect(() => {
    if (!open || !user) return;
    setLoadingLibrary(true);
    supabase
      .from("media_library")
      .select("file_name, file_url, file_type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data }) => {
        const items = (data ?? [])
          .filter((row) => (row.file_type ?? "").startsWith("image") || /\.(png|jpe?g|webp)$/i.test(row.file_url ?? ""))
          .map((row) => ({ url: row.file_url as string, name: (row.file_name as string) ?? tx({ de: "Bild", en: "Image", es: "Imagen" }) }));
        setLibraryItems(items);
        setLoadingLibrary(false);
      });
  }, [open, user]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error(tx({ de: "Bitte eine Bilddatei wählen", en: "Please select an image file", es: "Selecciona un archivo de imagen" }));
      return;
    }
    setUploading(true);
    try {
      const path = `${user.id}/post-designer/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const { error } = await supabase.storage.from("media-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("media-assets").getPublicUrl(path);
      onPick(data.publicUrl);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tx({ de: "Upload fehlgeschlagen", en: "Upload failed", es: "Error al subir" }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error(tx({ de: "Bitte kurz beschreiben, was zu sehen sein soll", en: "Please briefly describe what should be shown", es: "Describe brevemente lo que debe mostrarse" }));
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-studio-image", {
        body: { prompt: prompt.trim(), style: "realistic", aspectRatio: "1:1", quality: "fast" },
      });
      if (error) throw error;
      if (data?.ok === false || data?.error) throw new Error(data.error || tx({ de: "Generierung fehlgeschlagen", en: "Generation failed", es: "Error en la generación" }));
      const url = data?.image?.url ?? data?.image;
      if (!url) throw new Error(tx({ de: "Kein Bild erhalten", en: "No image received", es: "No se recibió ninguna imagen" }));
      onPick(url);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tx({ de: "Generierung fehlgeschlagen", en: "Generation failed", es: "Error en la generación" }));
    } finally {
      setGenerating(false);
    }
  };

  const handleStockSearch = async () => {
    if (!stockQuery.trim()) return;
    setStockState("loading");
    try {
      const { data, error } = await supabase.functions.invoke("stock-image-search", {
        body: { query: stockQuery.trim() },
      });
      if (error) throw error;
      if (data?.code === "MISSING_KEY") {
        setStockState("unavailable");
        return;
      }
      setStockResults(data?.results ?? []);
      setStockState("idle");
    } catch {
      setStockState("unavailable");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tx({ de: "Bildquelle wählen", en: "Choose image source", es: "Elegir fuente de imagen" })}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="upload">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload"><Upload className="mr-1.5 h-3.5 w-3.5" />Upload</TabsTrigger>
            <TabsTrigger value="ai"><Sparkles className="mr-1.5 h-3.5 w-3.5" />{tx({ de: "KI-Bild", en: "AI image", es: "Imagen IA" })}</TabsTrigger>
            <TabsTrigger value="library"><Library className="mr-1.5 h-3.5 w-3.5" />{tx({ de: "Mediathek", en: "Media library", es: "Biblioteca" })}</TabsTrigger>
            <TabsTrigger value="stock"><Images className="mr-1.5 h-3.5 w-3.5" />Stock</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="pt-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-52 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-primary/40 transition-colors hover:bg-primary/5"
            >
              {uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6 text-primary" />}
              <span className="text-sm">{tx({ de: "Bild hierher klicken und auswählen", en: "Click here to select an image", es: "Haz clic aquí para seleccionar una imagen" })}</span>
              <span className="text-xs text-muted-foreground">{tx({ de: "JPG, PNG oder WEBP bis 10 MB", en: "JPG, PNG, or WEBP up to 10 MB", es: "JPG, PNG o WEBP hasta 10 MB" })}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </TabsContent>

          <TabsContent value="ai" className="space-y-3 pt-4">
            <Textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={tx({ de: "z. B. Espressotasse auf dunklem Marmor, warmes Seitenlicht, minimalistisch", en: "e.g. espresso cup on dark marble, warm side light, minimalist", es: "p. ej. taza de espresso sobre mármol oscuro, luz lateral cálida, minimalista" })}
            />
            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {tx({ de: "Bild generieren", en: "Generate image", es: "Generar imagen" })}
            </Button>
          </TabsContent>

          <TabsContent value="library" className="pt-4">
            {loadingLibrary ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : libraryItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{tx({ de: "Noch keine Bilder in der Mediathek.", en: "No images in the media library yet.", es: "Aún no hay imágenes en la biblioteca de medios." })}</p>
            ) : (
              <div className="grid max-h-[380px] grid-cols-4 gap-2 overflow-y-auto">
                {libraryItems.map((item) => (
                  <button
                    key={item.url}
                    type="button"
                    onClick={() => {
                      onPick(item.url);
                      onOpenChange(false);
                    }}
                    className="aspect-square overflow-hidden rounded-lg border border-border/60 transition-all hover:border-primary"
                  >
                    <img src={item.url} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="stock" className="space-y-3 pt-4">
            <div className="flex gap-2">
              <Input
                value={stockQuery}
                onChange={(e) => setStockQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStockSearch()}
                placeholder=tx({ de: "Suchbegriff, z. B. Kaffee, Büro, Sommer", en: "Search term, e.g. coffee, office, summer", es: "Término de búsqueda, ej. café, oficina, verano" })
              />
              <Button onClick={handleStockSearch} disabled={stockState === "loading"}>
                {stockState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : tx({ de: "Suchen", en: "Search", es: "Buscar" })}
              </Button>
            </div>
            {stockState === "unavailable" ? (
              <p className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              <div className="grid max-h-[340px] grid-cols-4 gap-2 overflow-y-auto">
                {stockResults.map((item) => (
                  <button
                    key={item.url}
                    type="button"
                    onClick={() => {
                      onPick(item.url);
                      onOpenChange(false);
                    }}
                    className="aspect-square overflow-hidden rounded-lg border border-border/60 transition-all hover:border-primary"
                    title={item.credit}
                  >
                    <img src={item.preview} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
