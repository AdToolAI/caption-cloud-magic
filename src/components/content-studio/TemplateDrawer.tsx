import { tx } from "@/lib/i18nText";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useContentStudio } from "@/contexts/ContentStudioContext";
import type { PostDesign } from "@/lib/post-design/schema";

interface SavedDesign {
  id: string;
  title: string;
  design: PostDesign;
}

/** Vorlagen-Schublade: gesicherte Designs laden oder entfernen. */
export function TemplateDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const s = useContentStudio();
  const [items, setItems] = useState<SavedDesign[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    supabase
      .from("post_designs")
      .select("id,title,design")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data, error }) => {
        if (error) toast.error(tx({ de: "Vorlagen konnten nicht geladen werden", en: "Could not load templates", es: "No se pudieron cargar las plantillas" }));
        setItems((data ?? []) as unknown as SavedDesign[]);
        setLoading(false);
      });
  }, [open, user]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("post_designs").delete().eq("id", id);
    if (error) {
      toast.error(tx({ de: "Löschen fehlgeschlagen", en: "Delete failed", es: "Error al eliminar" }));
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display">{tx({ de: "Vorlagen", en: "Templates", es: "Plantillas" })}</SheetTitle>
          <SheetDescription>Gesicherte Designs wiederverwenden — direkt im Layout-Schritt.</SheetDescription>
        </SheetHeader>

        <ScrollArea className="mt-4 h-[calc(100vh-9rem)] pr-3">
          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
            </div>
          )}
          {!loading && !items.length && (
            <p className="py-6 text-sm text-muted-foreground">
              {tx({ de: "Noch keine Vorlage. Im Schritt „Ausspielen“ lässt sich jedes Design sichern.", en: "No template yet. Any design can be saved in the 'Deploy' step.", es: "Aún no hay plantilla. Cualquier diseño se puede guardar en el paso 'Desplegar'." })}
            </p>
          )}
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/50 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    s.openDesign(item.design);
                    s.goTo("layout");
                    onOpenChange(false);
                  }}
                >
                  Verwenden
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(item.id)} aria-label={tx({ de: "Vorlage löschen", en: "Delete template", es: "Eliminar plantilla" })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default TemplateDrawer;
