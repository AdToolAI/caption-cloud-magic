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
import { tx } from "@/lib/i18nText";

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
        title: tx({ de: "Fehler", en: "Error", es: "Error" }),
        description: isInstagram
          ? tx({ de: tx({ de: "Instagram-fähige Facebook-Seiten konnten nicht geladen werden.", en: "Instagram-enabled Facebook pages could not be loaded.", es: "No se pudieron cargar las páginas de Facebook con Instagram." }), en: "Instagram-enabled Facebook pages could not be loaded.", es: "No se pudieron cargar las páginas de Facebook habilitadas para Instagram." })
          : tx({ de: "Facebook-Seiten konnten nicht geladen werden.", en: "Facebook pages could not be loaded.", es: "No se pudieron cargar las páginas de Facebook." }),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPage = async (page: FacebookPage) => {
    if (isInstagram && !page.has_instagram) {
      toast({
        title: tx({ de: "Kein Instagram verknüpft", en: "No Instagram linked", es: "Instagram no vinculado" }),
        description: tx({ de: `"${page.name}" hat kein verknüpftes Instagram Business-Konto.`, en: `"${page.name}" has no linked Instagram business account.`, es: `"${page.name}" no tiene una cuenta empresarial de Instagram vinculada.` }),
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
        title: isInstagram ? tx({ de: "Instagram verbunden", en: "Instagram connected", es: "Instagram conectado" }) : tx({ de: "Seite ausgewählt", en: "Page selected", es: "Página seleccionada" }),
        description: isInstagram
          ? tx({ de: `Instagram-Konto von "${page.name}" wurde verbunden.`, en: `Instagram account of "${page.name}" was connected.`, es: `Se conectó la cuenta de Instagram de "${page.name}".` })
          : tx({ de: `"${page.name}" wurde als Facebook-Seite verbunden.`, en: `"${page.name}" was connected as Facebook page.`, es: `"${page.name}" se conectó como página de Facebook.` }),
      });

      onOpenChange(false);
      onPageSelected();
    } catch (error: any) {
      console.error("Failed to select page:", error);
      toast({
        title: tx({ de: "Fehler", en: "Error", es: "Error" }),
        description: error?.message || tx({ de: tx({ de: "Auswahl konnte nicht gespeichert werden.", en: "Selection could not be saved.", es: "No se pudo guardar la selección." }), en: "Selection could not be saved.", es: "No se pudo guardar la selección." }),
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
      title = tx({ de: 'Keine Seitenfreigabe erhalten', en: 'No page access granted', es: 'No se concedió acceso a páginas' });
      body =
        tx({ de: 'Meta hat keine Facebook-Seiten freigegeben. Verbinde erneut und aktiviere im Meta-Dialog ALLE Toggles (insbesondere „Zugriff auf Seiten" und „Instagram").', en: 'Meta did not grant access to any Facebook pages. Reconnect and enable ALL toggles in the Meta dialog (especially "Page access" and "Instagram").', es: 'Meta no concedió acceso a ninguna página de Facebook. Vuelve a conectar y activa TODAS las opciones en el diálogo de Meta (especialmente "Acceso a páginas" e "Instagram").' }) +
        (missingScopes.length ? ` ${tx({ de: 'Fehlende Berechtigungen', en: 'Missing permissions', es: 'Permisos faltantes' })}: ${missingScopes.join(', ')}.` : '');
    } else if (pagesHidden) {
      title = tx({ de: 'Meta hat keine Seiten an die App übergeben', en: 'Meta did not pass any pages to the app', es: 'Meta no transfirió ninguna página a la app' });
      body =
        tx({ de: 'Deine Berechtigungen sind erteilt, aber Meta hat deinem Token keine Seiten-Assets zugeordnet (leere Ziel-IDs). Klicke auf „Erneut verbinden" — wir fordern jetzt zusätzlich die Portfolio-Berechtigung an und erzwingen den Asset-Dialog. Prüfe dabei:', en: 'Your permissions are granted, but Meta did not assign any page assets to your token (empty target IDs). Click "Reconnect" — we now also request the portfolio permission and force the asset dialog. Please check:', es: 'Tus permisos están concedidos, pero Meta no asignó ningún activo de página a tu token (IDs de destino vacíos). Haz clic en "Reconectar" — ahora también solicitamos el permiso de portafolio y forzamos el diálogo de activos. Comprueba lo siguiente:' });
      checklist = [
        tx({ de: 'Im Meta-Dialog auf „Alle bearbeiten" gehen und die Seite „AdTool AI" sowie das Instagram-Konto ausdrücklich anhaken.', en: 'In the Meta dialog, go to "Edit all" and explicitly check the "AdTool AI" page and the Instagram account.', es: 'En el diálogo de Meta, ve a "Editar todo" y marca explícitamente la página "AdTool AI" y la cuenta de Instagram.' }),
        tx({ de: 'Dein Instagram-Konto ist ein Business- oder Creator-Konto (nicht „Privat").', en: 'Your Instagram account is a business or creator account (not "Private").', es: 'Tu cuenta de Instagram es una cuenta empresarial o de creador (no "Privada").' }),
        tx({ de: 'Das Instagram-Konto ist mit der Facebook-Seite verknüpft (Seite → Einstellungen → Verknüpfte Konten).', en: 'The Instagram account is linked to the Facebook page (Page → Settings → Linked accounts).', es: 'La cuenta de Instagram está vinculada a la página de Facebook (Página → Configuración → Cuentas vinculadas).' }),
        tx({ de: 'Liegt die Seite in einem Business-Portfolio, muss dein Account dort Vollzugriff auf die Seite haben (Business Suite → Einstellungen → Seiten → Personen).', en: 'If the page is in a business portfolio, your account must have full access to the page there (Business Suite → Settings → Pages → People).', es: 'Si la página está en un portafolio empresarial, tu cuenta debe tener acceso total a la página allí (Business Suite → Configuración → Páginas → Personas).' }),
      ];

    } else if (resultStatus === 'pages_found_but_verification_failed') {
      title = tx({ de: 'Seiten gefunden, aber Verifikation fehlgeschlagen', en: 'Pages found, but verification failed', es: 'Páginas encontradas, pero la verificación falló' });
      body =
        tx({ de: 'Meta hat deine Seiten zwar geliefert, aber die einzelnen Detail-Prüfungen (Page Node) wurden abgelehnt. Bitte verbinde Instagram erneut, damit ein frisches Token ausgestellt wird.', en: 'Meta returned your pages, but the individual detail checks (page node) were rejected. Please reconnect Instagram so a fresh token is issued.', es: 'Meta devolvió tus páginas, pero las comprobaciones de detalle individuales (nodo de página) fueron rechazadas. Vuelve a conectar Instagram para que se emita un token nuevo.' });
    } else if (resultStatus === 'pages_found_but_no_instagram_link') {
      title = tx({ de: 'Kein verknüpftes Instagram-Profil bestätigt', en: 'No linked Instagram profile confirmed', es: 'No se confirmó ningún perfil de Instagram vinculado' });
      body =
        tx({ de: 'Wir haben deine Facebook-Seiten gefunden und einzeln bei Meta geprüft, aber für keine Seite ein verknüpftes Instagram Business-Konto bestätigt bekommen. Öffne deine Facebook-Seite → Einstellungen → Verknüpfte Konten und verbinde dort dein Instagram (Professional-Account). Danach „Instagram erneut verbinden".', en: 'We found your Facebook pages and checked them individually with Meta, but no page had a confirmed linked Instagram business account. Open your Facebook page → Settings → Linked accounts and connect your Instagram (professional account) there. Then click "Reconnect Instagram".', es: 'Encontramos tus páginas de Facebook y las verificamos individualmente con Meta, pero ninguna página tenía una cuenta empresarial de Instagram vinculada confirmada. Abre tu página de Facebook → Configuración → Cuentas vinculadas y conecta ahí tu Instagram (cuenta profesional). Luego haz clic en "Reconectar Instagram".' });
    } else {
      title = isInstagram ? tx({ de: tx({ de: "Keine Instagram-fähige Seite gefunden", en: "No Instagram-enabled page found", es: "No se encontró ninguna página con Instagram" }), en: 'No Instagram-enabled page found', es: 'No se encontró ninguna página habilitada para Instagram' }) : tx({ de: 'Keine Facebook-Seiten gefunden', en: 'No Facebook pages found', es: 'No se encontraron páginas de Facebook' });
      body = isInstagram
        ? tx({ de: tx({ de: "Verknüpfe zuerst dein Instagram Business-Konto mit einer Facebook-Seite und versuche es erneut.", en: "First link your Instagram business account to a Facebook page, then try again.", es: "Vincula primero tu cuenta de empresa de Instagram con una página de Facebook y vuelve a intentarlo." }), en: 'First link your Instagram business account to a Facebook page and try again.', es: 'Primero vincula tu cuenta empresarial de Instagram con una página de Facebook e inténtalo de nuevo.' })
        : tx({ de: 'Stelle sicher, dass dein Facebook-Konto mindestens eine Seite verwaltet.', en: 'Make sure your Facebook account manages at least one page.', es: 'Asegúrate de que tu cuenta de Facebook administre al menos una página.' });
    }

    const diagSummary = diagnostics
      ? `${diagnostics.pages_found_count ?? 0} ${tx({ de: tx({ de: "Seiten von Meta", en: "pages from Meta", es: "páginas de Meta" }), en: 'pages from Meta', es: 'páginas de Meta' })} · ${diagnostics.verified_instagram_count ?? 0} ${tx({ de: tx({ de: "mit IG verifiziert", en: "verified with IG", es: "verificado con IG" }), en: 'verified with IG', es: 'verificadas con IG' })} · ${(diagnostics.page_verify_failures?.length ?? 0)} ${tx({ de: 'Verifikationsfehler', en: 'verification errors', es: 'errores de verificación' })}`
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
              {isInstagram ? tx({ de: tx({ de: "Instagram erneut verbinden (mit Business-Berechtigung)", en: "Reconnect Instagram (with business permission)", es: "Reconectar Instagram (con permiso de empresa)" }), en: 'Reconnect Instagram (with business permission)', es: 'Reconectar Instagram (con permiso empresarial)' }) : tx({ de: 'Facebook erneut verbinden', en: 'Reconnect Facebook', es: 'Reconectar Facebook' })}
            </Button>
            {isInstagram && pagesHidden && (
              <a
                href="https://www.facebook.com/business/help/898752960195806"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {tx({ de: 'Meta-Hilfe: Instagram mit Facebook-Seite verbinden', en: 'Meta help: Connect Instagram with Facebook page', es: 'Ayuda de Meta: Conectar Instagram con página de Facebook' })}
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
            {isInstagram ? tx({ de: tx({ de: "Instagram-Konto auswählen", en: "Select Instagram account", es: "Seleccionar cuenta de Instagram" }), en: "Select Instagram account", es: "Seleccionar cuenta de Instagram" }) : tx({ de: "Facebook-Seite auswählen", en: "Select Facebook page", es: "Seleccionar página de Facebook" })}
          </DialogTitle>
          <DialogDescription>
            {isInstagram
              ? tx({ de: tx({ de: "Wähle die Facebook-Seite, deren verknüpftes Instagram Business-Konto verbunden werden soll.", en: "Choose the Facebook page whose linked Instagram business account should be connected.", es: "Elige la página de Facebook cuya cuenta de empresa de Instagram vinculada quieres conectar." }), en: "Select the Facebook page whose linked Instagram business account should be connected.", es: "Selecciona la página de Facebook cuya cuenta empresarial de Instagram vinculada se conectará." })
              : tx({ de: "Wähle die Facebook-Seite, die du mit AdTool AI verbinden möchtest.", en: "Select the Facebook page you want to connect with AdTool AI.", es: "Selecciona la página de Facebook que deseas conectar con AdTool AI." })}
          </DialogDescription>
          {isInstagram && (
            <div className="text-[11px] text-muted-foreground/80 mt-2 leading-relaxed space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-2.5">
              <p className="font-semibold text-foreground/90">
                {tx({ de: "Hinweis für Meta App Review (Screencast):", en: "Note for Meta App Review (screencast):", es: "Nota para la revisión de la app de Meta (grabación de pantalla):" })}
              </p>
              <ol className="list-decimal list-outside ml-4 space-y-1">
                <li>{tx({ de: "Aufnahme auf der veröffentlichten App-URL starten (nicht im Preview).", en: "Start the recording on the published app URL (not in preview).", es: "Inicia la grabación en la URL publicada de la app (no en la vista previa)." })}</li>
                <li>{tx({ de: "Vorher bei Facebook/Meta vollständig ausloggen.", en: "Fully log out of Facebook/Meta beforehand.", es: "Cierra sesión por completo en Facebook/Meta de antemano." })}</li>
                <li>{tx({ de: "Flow im Inkognito-/Privatfenster starten.", en: "Start the flow in an incognito/private window.", es: "Inicia el flujo en una ventana de incógnito/privada." })}</li>
                <li>{tx({ de: "Connect → Berechtigungen → Page-Auswahl → erfolgreiche Verbindung → echte Instagram-Nutzung im selben Take aufnehmen.", en: "Connect → Permissions → Page selection → successful connection → record real Instagram usage in the same take.", es: "Conectar → Permisos → Selección de página → conexión exitosa → grabar el uso real de Instagram en la misma toma." })}</li>
              </ol>
              <p className="text-muted-foreground/70">
                {tx({ de: "Wenn Meta nur die Kurzversion zeigt, liegt das an einer bestehenden Meta-Sitzung — nicht an der App. Eine frische Session erzwingt den vollständigen Dialog zuverlässig.", en: "If Meta only shows the short version, this is due to an existing Meta session — not the app. A fresh session reliably forces the full dialog.", es: "Si Meta solo muestra la versión corta, se debe a una sesión de Meta existente, no a la app. Una sesión nueva fuerza de forma fiable el diálogo completo." })}
              </p>
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {isInstagram
                ? tx({ de: tx({ de: "Verknüpfte Instagram-Konten werden bei Meta geprüft…", en: "Checking linked Instagram accounts with Meta…", es: "Comprobando las cuentas de Instagram vinculadas en Meta…" }), en: 'Checking linked Instagram accounts with Meta…', es: 'Comprobando cuentas de Instagram vinculadas con Meta…' })
                : tx({ de: 'Seiten werden geladen…', en: 'Loading pages…', es: 'Cargando páginas…' })}
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
                            {tx({ de: "IG verknüpft", en: "IG linked", es: "IG vinculado" })}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                            {tx({ de: "kein IG", en: "no IG", es: "sin IG" })}
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
            {tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
