import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { Facebook, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FacebookPage {
  id: string;
  name: string;
  category: string;
  picture_url: string | null;
  access_token: string;
}

interface FacebookPageSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPageSelected: () => void;
}

export const FacebookPageSelectDialog = ({
  open,
  onOpenChange,
  onPageSelected,
}: FacebookPageSelectDialogProps) => {
  const { toast } = useToast();
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchPages();
    }
  }, [open]);

  const fetchPages = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("facebook-list-pages", {
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (error) throw error;

      if (data?.pages) {
        setPages(data.pages);
      }
    } catch (error: any) {
      console.error("Failed to fetch Facebook pages:", error);
      toast({
        title: "Fehler",
        description: "Facebook-Seiten konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPage = async (page: FacebookPage) => {
    setSelecting(page.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: session } = await supabase.auth.getSession();

      // Call edge function to save page selection with encrypted page access token
      const { data, error } = await supabase.functions.invoke("facebook-select-page", {
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: {
          page_id: page.id,
          page_name: page.name,
          page_category: page.category,
          page_picture_url: page.picture_url,
          page_access_token: page.access_token,
        },
      });

      if (error) throw error;

      toast({
        title: "Seite ausgewählt",
        description: `"${page.name}" wurde als Facebook-Seite verbunden.`,
      });

      onOpenChange(false);
      onPageSelected();
    } catch (error: any) {
      console.error("Failed to select page:", error);
      toast({
        title: "Fehler",
        description: "Seite konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setSelecting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-600">
              <Facebook className="h-4 w-4 text-white" />
            </div>
            Facebook-Seite auswählen
          </DialogTitle>
          <DialogDescription>
            Wähle die Facebook-Seite, die du mit CaptionGenie verbinden möchtest.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Seiten werden geladen…</p>
          </div>
        ) : pages.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Keine Facebook-Seiten gefunden. Stelle sicher, dass dein Facebook-Konto mindestens eine Seite verwaltet.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {pages.map((page) => (
              <button
                key={page.id}
                onClick={() => handleSelectPage(page)}
                disabled={selecting !== null}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all duration-200 text-left disabled:opacity-50"
              >
                <Avatar className="h-10 w-10">
                  {page.picture_url ? (
                    <AvatarImage src={page.picture_url} alt={page.name} />
                  ) : null}
                  <AvatarFallback className="bg-blue-100 text-blue-700 text-sm font-semibold">
                    {page.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{page.name}</p>
                  <p className="text-xs text-muted-foreground">{page.category}</p>
                </div>
                {selecting === page.id ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-muted-foreground/30" />
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
