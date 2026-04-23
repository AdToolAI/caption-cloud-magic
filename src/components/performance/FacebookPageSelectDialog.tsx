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
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Facebook, Instagram, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FacebookPage {
  id: string;
  name: string;
  category: string;
  picture_url: string | null;
  access_token: string;
  has_instagram?: boolean;
  instagram_business_account_id?: string | null;
}

type DialogMode = "facebook" | "instagram";

interface FacebookPageSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPageSelected: () => void;
  mode?: DialogMode;
  /**
   * Optional handler used by the "Erneut verbinden" CTA shown when Meta did
   * not return any usable Page (missing scopes or no IG link). It should
   * trigger the same OAuth flow the user just came from, ideally with
   * forced re-consent.
   */
  onReconnect?: () => void;
}

export const FacebookPageSelectDialog = ({
  open,
  onOpenChange,
  onPageSelected,
  mode = "facebook",
  onReconnect,
}: FacebookPageSelectDialogProps) => {
  const { toast } = useToast();
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [resultStatus, setResultStatus] = useState<string | null>(null);
  const [missingScopes, setMissingScopes] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<any>(null);

  const isInstagram = mode === "instagram";

  useEffect(() => {
    if (open) {
      fetchPages();
    }
  }, [open, mode]);

  const fetchPages = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("facebook-list-pages", {
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: { provider: mode },
      });

      if (error) throw error;

      if (data?.pages) {
        setPages(data.pages);
      }
      setResultStatus(data?.status ?? null);
      setMissingScopes(Array.isArray(data?.missing_scopes) ? data.missing_scopes : []);
      setDiagnostics(data?.diagnostics ?? null);
    } catch (error: any) {
      console.error(`Failed to fetch ${mode} pages:`, error);
      toast({
        title: "Fehler",
        description: isInstagram
          ? "Instagram-fähige Facebook-Seiten konnten nicht geladen werden."
          : "Facebook-Seiten konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPage = async (page: FacebookPage) => {
    if (isInstagram && !page.has_instagram) {
      toast({
        title: "Kein Instagram verknüpft",
        description: `"${page.name}" hat kein verknüpftes Instagram Business-Konto.`,
        variant: "destructive",
      });
      return;
    }

    setSelecting(page.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: session } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke("facebook-select-page", {
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: {
          provider: mode,
          page_id: page.id,
          page_name: page.name,
          page_category: page.category,
          page_picture_url: page.picture_url,
          page_access_token: page.access_token,
        },
      });

      if (error) throw error;

      toast({
        title: isInstagram ? "Instagram verbunden" : "Seite ausgewählt",
        description: isInstagram
          ? `Instagram-Konto von "${page.name}" wurde verbunden.`
          : `"${page.name}" wurde als Facebook-Seite verbunden.`,
      });

      onOpenChange(false);
      onPageSelected();
    } catch (error: any) {
      console.error("Failed to select page:", error);
      toast({
        title: "Fehler",
        description: error?.message || "Auswahl konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setSelecting(null);
    }
  };

  const Icon = isInstagram ? Instagram : Facebook;
  const iconBg = isInstagram ? "bg-pink-600" : "bg-blue-600";

  // Decide which empty-state message to show based on the classified status
  // returned by facebook-list-pages (which now does real per-page IG
  // verification, not just the inline /me/accounts hint).
  const renderEmptyState = () => {
    const showReconnect = !!onReconnect;

    let title: string;
    let body: string;
    // Concrete Meta-side checklist shown only for the "0 pages from Meta"
    // case — these are the four conditions Meta requires before /me/accounts
    // will return any usable page for an Instagram connect flow.
    let checklist: string[] | null = null;

    const pagesHidden =
      resultStatus === 'meta_pages_hidden_or_unavailable' ||
      (resultStatus === null && diagnostics?.pages_found_count === 0);

    if (resultStatus === 'no_pages_access' || (missingScopes.length > 0 && pages.length === 0)) {
      title = 'Keine Seitenfreigabe erhalten';
      body =
        'Meta hat keine Facebook-Seiten freigegeben. Verbinde erneut und aktiviere im Meta-Dialog ALLE Toggles (insbesondere „Zugriff auf Seiten" und „Instagram").' +
        (missingScopes.length ? ` Fehlende Berechtigungen: ${missingScopes.join(', ')}.` : '');
    } else if (pagesHidden) {
      title = 'Meta hat keine Seiten an die App übergeben';
      body =
        'Deine Berechtigungen sind ok, aber Meta hat für diesen Account keine Seiten an die App ausgeliefert. Das passiert fast immer aus einem dieser vier Gründe:';
      checklist = [
        'Dein Instagram-Konto ist ein Business- oder Creator-Konto (nicht „Privat"). Prüfe das in der Instagram-App unter Einstellungen → Konto.',
        'Dein Instagram-Konto ist in den Einstellungen deiner Facebook-Seite mit dieser Seite verknüpft (Facebook-Seite → Einstellungen → Verknüpfte Konten → Instagram).',
        'Die Facebook-Seite wird von genau dem Facebook-Account verwaltet, mit dem du dich gerade angemeldet hast.',
        'Im Meta-Berechtigungsdialog musst du beim Re-Connect mindestens eine Page-Checkbox aktivieren — nicht nur das Instagram-Konto.',
      ];
    } else if (resultStatus === 'pages_found_but_verification_failed') {
      title = 'Seiten gefunden, aber Verifikation fehlgeschlagen';
      body =
        'Meta hat deine Seiten zwar geliefert, aber die einzelnen Detail-Prüfungen (Page Node) wurden abgelehnt. Bitte verbinde Instagram erneut, damit ein frisches Token ausgestellt wird.';
    } else if (resultStatus === 'pages_found_but_no_instagram_link') {
      title = 'Kein verknüpftes Instagram-Profil bestätigt';
      body =
        'Wir haben deine Facebook-Seiten gefunden und einzeln bei Meta geprüft, aber für keine Seite ein verknüpftes Instagram Business-Konto bestätigt bekommen. Öffne deine Facebook-Seite → Einstellungen → Verknüpfte Konten und verbinde dort dein Instagram (Professional-Account). Danach „Instagram erneut verbinden".';
    } else {
      title = isInstagram ? 'Keine Instagram-fähige Seite gefunden' : 'Keine Facebook-Seiten gefunden';
      body = isInstagram
        ? 'Verknüpfe zuerst dein Instagram Business-Konto mit einer Facebook-Seite und versuche es erneut.'
        : 'Stelle sicher, dass dein Facebook-Konto mindestens eine Seite verwaltet.';
    }

    const diagSummary = diagnostics
      ? `${diagnostics.pages_found_count ?? 0} Seiten von Meta · ${diagnostics.verified_instagram_count ?? 0} mit IG verifiziert · ${(diagnostics.page_verify_failures?.length ?? 0)} Verifikationsfehler`
      : null;

    return (
      <div className="py-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground px-2">{body}</p>
        {checklist && (
          <ol className="text-left text-xs text-muted-foreground space-y-2 px-4 list-decimal list-outside ml-2">
            {checklist.map((item, i) => (
              <li key={i} className="leading-relaxed">{item}</li>
            ))}
          </ol>
        )}
        {diagSummary && (
          <p className="text-[10px] text-muted-foreground/70 font-mono px-2">{diagSummary}</p>
        )}
        {showReconnect && (
          <div className="flex flex-col items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                onOpenChange(false);
                onReconnect?.();
              }}
            >
              {isInstagram ? 'Instagram erneut verbinden (mit Business-Berechtigung)' : 'Facebook erneut verbinden'}
            </Button>
            {isInstagram && pagesHidden && (
              <a
                href="https://www.facebook.com/business/help/898752960195806"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Meta-Hilfe: Instagram mit Facebook-Seite verbinden
              </a>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${iconBg}`}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            {isInstagram ? "Instagram-Konto auswählen" : "Facebook-Seite auswählen"}
          </DialogTitle>
          <DialogDescription>
            {isInstagram
              ? "Wähle die Facebook-Seite, deren verknüpftes Instagram Business-Konto verbunden werden soll."
              : "Wähle die Facebook-Seite, die du mit CaptionGenie verbinden möchtest."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {isInstagram
                ? 'Verknüpfte Instagram-Konten werden bei Meta geprüft…'
                : 'Seiten werden geladen…'}
            </p>
          </div>
        ) : pages.length === 0 ? (
          renderEmptyState()
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {pages.map((page) => {
              const disabled = selecting !== null || (isInstagram && !page.has_instagram);
              return (
                <button
                  key={page.id}
                  onClick={() => handleSelectPage(page)}
                  disabled={disabled}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">{page.category}</p>
                      {isInstagram && (
                        page.has_instagram ? (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                            <Instagram className="h-2.5 w-2.5" />
                            IG verknüpft
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                            kein IG
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                  {selecting === page.id ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <CheckCircle2 className={`h-5 w-5 ${isInstagram && !page.has_instagram ? "text-muted-foreground/20" : "text-muted-foreground/30"}`} />
                  )}
                </button>
              );
            })}
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
