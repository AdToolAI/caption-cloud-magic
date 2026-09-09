import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Globe, RefreshCw, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useBrandDnaExtractor, type BrandDnaResult } from "@/hooks/useBrandDnaExtractor";
import { tx } from "@/lib/i18nText";

interface Props {
  kit: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Choice = "current" | "new";

interface Row {
  key: string;
  label: string;
  /** DB column(s) written when the user picks "Use new". */
  column: string;
  current: string;
  next: string;
  /** Value written to the column. */
  value: unknown;
  changed: boolean;
}

const fmtList = (v: unknown) =>
  Array.isArray(v) ? v.filter(Boolean).join(", ") : typeof v === "string" ? v : "";

export function BrandDnaRefreshDialog({ kit, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const extractor = useBrandDnaExtractor();

  const [url, setUrl] = useState("");
  const [dna, setDna] = useState<BrandDnaResult | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl(kit?.website_url || "");
      setDna(null);
      setChoices({});
    }
  }, [open, kit?.website_url]);

  const rows: Row[] = useMemo(() => {
    if (!kit || !dna) return [];
    const currentFonts = (kit.font_pairing || {}) as Record<string, string>;
    const currentPalette = ((kit.color_palette || {}) as any).extracted;

    const defs: Array<Omit<Row, "changed"> | null> = [
      dna.brand_name
        ? { key: "brand_name", label: tx({ de: "Markenname", en: "Brand name", es: "Nombre de marca" }), column: "brand_name", current: kit.brand_name || "—", next: dna.brand_name, value: dna.brand_name }
        : null,
      dna.primary_color
        ? { key: "primary_color", label: tx({ de: "Primärfarbe", en: "Primary color", es: "Color primario" }), column: "primary_color", current: kit.primary_color || "—", next: dna.primary_color, value: dna.primary_color }
        : null,
      dna.secondary_color
        ? { key: "secondary_color", label: tx({ de: "Sekundärfarbe", en: "Secondary color", es: "Color secundario" }), column: "secondary_color", current: kit.secondary_color || "—", next: dna.secondary_color, value: dna.secondary_color }
        : null,
      dna.accent_color
        ? { key: "accent_color", label: tx({ de: "Akzentfarbe", en: "Accent color", es: "Color de acento" }), column: "accent_color", current: kit.accent_color || "—", next: dna.accent_color, value: dna.accent_color }
        : null,
      dna.palette?.length
        ? { key: "palette", label: tx({ de: "Farbpalette", en: "Color palette", es: "Paleta de colores" }), column: "color_palette", current: fmtList(currentPalette) || "—", next: fmtList(dna.palette), value: dna.palette }
        : null,
      dna.fonts?.headline || dna.fonts?.body
        ? {
            key: "fonts",
            label: tx({ de: "Schriften", en: "Fonts", es: "Fuentes" }),
            column: "font_pairing",
            current: `${currentFonts.headline || "—"} / ${currentFonts.body || "—"}`,
            next: `${dna.fonts?.headline || "—"} / ${dna.fonts?.body || "—"}`,
            value: { headline: dna.fonts?.headline || currentFonts.headline, body: dna.fonts?.body || currentFonts.body, source: "website" },
          }
        : null,
      dna.tone
        ? { key: "brand_tone", label: tx({ de: "Tonalität", en: "Tone", es: "Tono" }), column: "brand_tone", current: kit.brand_tone || "—", next: dna.tone, value: dna.tone }
        : null,
      dna.mood
        ? { key: "mood", label: tx({ de: "Stimmung", en: "Mood", es: "Ambiente" }), column: "mood", current: kit.mood || "—", next: dna.mood, value: dna.mood }
        : null,
      dna.keywords?.length
        ? { key: "keywords", label: tx({ de: "Keywords", en: "Keywords", es: "Palabras clave" }), column: "keywords", current: fmtList(kit.keywords) || "—", next: fmtList(dna.keywords), value: dna.keywords }
        : null,
      dna.values?.length
        ? { key: "brand_values", label: tx({ de: "Markenwerte", en: "Brand values", es: "Valores de marca" }), column: "brand_values", current: fmtList(kit.brand_values) || "—", next: fmtList(dna.values), value: dna.values }
        : null,
    ];

    return defs
      .filter(Boolean)
      .map((d) => ({ ...(d as Omit<Row, "changed">), changed: (d as Row).current.trim().toLowerCase() !== (d as Row).next.trim().toLowerCase() }));
  }, [kit, dna]);

  const changedCount = rows.filter((r) => r.changed).length;
  const selectedCount = rows.filter((r) => choices[r.key] === "new").length;

  const runExtraction = async () => {
    if (!url.trim()) return;
    setDna(null);
    setChoices({});
    try {
      const result = await extractor.mutateAsync({ websiteUrl: url.trim() });
      setDna(result);
    } catch (err: any) {
      // Extraction failed: the existing brand kit stays completely untouched.
      toast({
        title: tx({ de: "Analyse fehlgeschlagen", en: "Analysis failed", es: "El análisis falló" }),
        description: err?.message || tx({ de: "Die Website konnte nicht analysiert werden.", en: "The website could not be analyzed.", es: "No se pudo analizar el sitio web." }),
        variant: "destructive",
        duration: 8000,
      });
    }
  };

  const applySelected = async () => {
    if (!kit) return;
    const picked = rows.filter((r) => choices[r.key] === "new");
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // One atomic UPDATE on the same row — id, created_at, user_id,
      // workspace, active state, share token and all brand_kit_id
      // references stay exactly as they are.
      const updates: Record<string, unknown> = { website_url: url.trim() || null };

      for (const row of picked) {
        if (row.key === "palette") {
          updates.color_palette = { ...((kit.color_palette || {}) as object), extracted: row.value };
        } else {
          updates[row.column] = row.value;
        }
      }

      const { error } = await supabase
        .from("brand_kits")
        .update(updates)
        .eq("id", kit.id)
        .eq("user_id", user.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["brand-kits"] });
      queryClient.invalidateQueries({ queryKey: ["active-brand-kit"] });
      toast({
        title: tx({ de: "Marken-Set aktualisiert", en: "Brand kit updated", es: "Kit de marca actualizado" }),
        description: picked.length
          ? tx({ de: `${picked.length} Feld(er) übernommen.`, en: `${picked.length} field(s) applied.`, es: `${picked.length} campo(s) aplicados.` })
          : tx({ de: "Nichts geändert — nur die Website-Adresse gemerkt.", en: "Nothing changed — only the website address was saved.", es: "Nada cambió — solo se guardó la dirección web." }),
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: tx({ de: "Fehler", en: "Error", es: "Error" }),
        description: err?.message || tx({ de: "Aktualisierung fehlgeschlagen", en: "Update failed", es: "La actualización falló" }),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            {tx({ de: "Website neu analysieren", en: "Re-analyze website", es: "Volver a analizar el sitio web" })}
          </DialogTitle>
          <DialogDescription>
            {tx({
              de: "Nichts wird automatisch überschrieben. Du entscheidest Feld für Feld, was übernommen wird.",
              en: "Nothing is overwritten automatically. You decide field by field what to adopt.",
              es: "Nada se sobrescribe automáticamente. Tú decides campo por campo qué adoptar.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="refresh-url">{tx({ de: "Website-Adresse", en: "Website address", es: "Dirección web" })}</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="refresh-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="pl-9"
              />
            </div>
            <Button onClick={runExtraction} disabled={extractor.isPending || !url.trim()}>
              {extractor.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : tx({ de: "Analysieren", en: "Analyze", es: "Analizar" })}
            </Button>
          </div>
        </div>

        {dna && (
          <>
            <div className="text-xs text-muted-foreground">
              {changedCount > 0
                ? tx({ de: `${changedCount} Abweichung(en) gefunden.`, en: `${changedCount} difference(s) found.`, es: `${changedCount} diferencia(s) encontradas.` })
                : tx({ de: "Keine Abweichungen — alles ist bereits aktuell.", en: "No differences — everything is already current.", es: "Sin diferencias — todo ya está actualizado." })}
            </div>
            <ScrollArea className="flex-1 max-h-[45vh] pr-2">
              <div className="space-y-2">
                {rows.map((row) => {
                  const choice = choices[row.key] ?? "current";
                  return (
                    <div
                      key={row.key}
                      className={`rounded-lg border p-3 ${row.changed ? "border-primary/40 bg-primary/5" : "border-border/40 bg-muted/20 opacity-70"}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-medium">{row.label}</span>
                        {row.changed ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {tx({ de: "geändert", en: "changed", es: "cambiado" })}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            <Check className="h-3 w-3 mr-1" />
                            {tx({ de: "identisch", en: "identical", es: "idéntico" })}
                          </Badge>
                        )}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setChoices((p) => ({ ...p, [row.key]: "current" }))}
                          className={`text-left rounded-md border p-2 text-xs transition ${choice === "current" ? "border-primary" : "border-border/40 hover:border-border"}`}
                        >
                          <div className="text-muted-foreground mb-1">{tx({ de: "Aktuell behalten", en: "Keep current", es: "Mantener actual" })}</div>
                          <div className="break-words">{row.current}</div>
                        </button>
                        <button
                          type="button"
                          disabled={!row.changed}
                          onClick={() => setChoices((p) => ({ ...p, [row.key]: "new" }))}
                          className={`text-left rounded-md border p-2 text-xs transition disabled:opacity-50 ${choice === "new" ? "border-primary" : "border-border/40 hover:border-border"}`}
                        >
                          <div className="text-muted-foreground mb-1">{tx({ de: "Neu erkannt übernehmen", en: "Use newly detected", es: "Usar lo detectado" })}</div>
                          <div className="break-words">{row.next}</div>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}
          </Button>
          <Button onClick={applySelected} disabled={!dna || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {selectedCount > 0
              ? tx({ de: `${selectedCount} Änderung(en) speichern`, en: `Save ${selectedCount} change(s)`, es: `Guardar ${selectedCount} cambio(s)` })
              : tx({ de: "Ohne Änderungen speichern", en: "Save without changes", es: "Guardar sin cambios" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
