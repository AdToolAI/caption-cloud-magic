import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { useLegalConsent } from '@/hooks/useLegalConsent';
import { toast } from 'sonner';

interface LibraryUploadConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the user has confirmed all rights and consent has been persisted. */
  onAccepted: () => void;
  context: 'character' | 'location';
}

/**
 * Block E (Legal) — Hard-gate consent dialog for library uploads.
 *
 * Three independent confirmations are required (image rights, depicted-person
 * consent, no celebrity/trademark misuse). On accept, a row is written to
 * `user_legal_consents` so we never re-prompt for the same legal version.
 */
export default function LibraryUploadConsentDialog({
  open,
  onOpenChange,
  onAccepted,
  context,
}: LibraryUploadConsentDialogProps) {
  const { recordConsent, version } = useLegalConsent('motion_studio_library_upload');
  const [rights, setRights] = useState(false);
  const [personConsent, setPersonConsent] = useState(false);
  const [noBrand, setNoBrand] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const allChecked =
    rights && (context === 'location' ? true : personConsent) && noBrand;

  const handleAccept = async () => {
    if (!allChecked) return;
    setSubmitting(true);
    const ok = await recordConsent({
      context,
      rights,
      person_consent: personConsent,
      no_brand: noBrand,
    });
    setSubmitting(false);
    if (!ok) {
      toast.error(tx({ de: 'Einwilligung konnte nicht gespeichert werden. Bitte erneut versuchen.', en: 'Could not save consent. Please try again.', es: 'No se pudo guardar el consentimiento. Por favor, inténtalo de nuevo.' }));
      return;
    }
    // reset for next session
    setRights(false);
    setPersonConsent(false);
    setNoBrand(false);
    onOpenChange(false);
    onAccepted();
  };

  const handleCancel = () => {
    setRights(false);
    setPersonConsent(false);
    setNoBrand(false);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {tx({ de: "Rechtliche Bestätigung erforderlich", en: "Legal confirmation required", es: "Confirmación legal requerida" })}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left space-y-2">
            <span className="block">
              {tx({ de: "Bevor du eigene Bilder in die Library hochladen kannst, müssen wir aus rechtlichen Gründen (DSGVO, Persönlichkeitsrechte, Urheberrecht) folgende Punkte mit dir klären. Diese Einwilligung wird einmalig dokumentiert und gilt für künftige Uploads.", en: "Before you can upload your own images to the library, we need to clarify the following points with you for legal reasons (GDPR, personal rights, copyright). This consent is documented once and applies to future uploads.", es: "Antes de que puedas subir tus propias imágenes a la biblioteca, debemos aclarar contigo los siguientes puntos por motivos legales (RGPD, derechos de la personalidad, derechos de autor). Este consentimiento se documenta una sola vez y se aplica a futuras subidas." })}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          {/* 1. Image rights */}
          <label className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 cursor-pointer hover:bg-muted/30 transition">
            <Checkbox
              checked={rights}
              onCheckedChange={(v) => setRights(!!v)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{tx({ de: "Ich besitze die Bildrechte.", en: "I own the image rights.", es: "Soy propietario de los derechos de la imagen." })}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {tx({ de: "Ich bin Urheber des Bildes oder besitze eine gültige Lizenz, die die Nutzung in AI-generierten Videos erlaubt.", en: "I am the creator of the image or hold a valid license that permits its use in AI-generated videos.", es: "Soy el creador de la imagen o poseo una licencia válida que permite su uso en videos generados por IA." })}
              </p>
            </div>
          </label>

          {/* 2. Person consent — characters only */}
          {context === 'character' && (
            <label className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 cursor-pointer hover:bg-muted/30 transition">
              <Checkbox
                checked={personConsent}
                onCheckedChange={(v) => setPersonConsent(!!v)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {tx({ de: "Abgebildete Personen haben eingewilligt.", en: "Depicted persons have given their consent.", es: "Las personas representadas han dado su consentimiento." })}
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {tx({ de: "Falls eine reale Person erkennbar ist, liegt mir deren ausdrückliche Einwilligung zur Nutzung als KI-Video-Referenz vor (Art. 6 DSGVO, § 22 KUG).", en: "If a real person is recognizable, I have their express consent to use it as an AI video reference (Art. 6 GDPR, § 22 KUG).", es: "Si una persona real es reconocible, cuento con su consentimiento expreso para usarla como referencia de video de IA (Art. 6 RGPD, § 22 KUG)." })}
                </p>
              </div>
            </label>
          )}

          {/* 3. No brand / celebrity */}
          <label className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 cursor-pointer hover:bg-muted/30 transition">
            <Checkbox
              checked={noBrand}
              onCheckedChange={(v) => setNoBrand(!!v)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {tx({ de: "Keine Marken oder prominenten Personen.", en: "No brands or public figures.", es: "Sin marcas ni personas públicas." })}
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {tx({ de: "Das Bild zeigt keine geschützten Marken, Logos oder Prominente, und die generierten Videos werden nicht zur Täuschung oder Rufschädigung verwendet.", en: "The image does not show any protected brands, logos, or public figures, and the generated videos will not be used for deception or defamation.", es: "La imagen no muestra marcas protegidas, logotipos ni personas públicas, y los videos generados no se utilizarán para engaño o difamación." })}
              </p>
            </div>
          </label>

          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-snug">
              {tx({ de: "Bei Verstößen liegt die volle rechtliche Verantwortung beim hochladenden Nutzer. Wir dokumentieren diese Bestätigung mit Zeitstempel", en: "In case of violations, full legal responsibility lies with the uploading user. We document this confirmation with a timestamp", es: "En caso de infracciones, la responsabilidad legal total recae en el usuario que realiza la carga. Documentamos esta confirmación con marca de tiempo" })} (Version {version}).
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>{tx({ de: 'Abbrechen', en: 'Cancel', es: 'Cancelar' })}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleAccept}
            disabled={!allChecked || submitting}
            className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {submitting ? tx({ de: tx({ de: "Wird gespeichert…", en: "Saving…", es: "Guardando…" }), en: 'Saved...', es: 'Guardado...' }) : tx({ de: 'Bestätigen und fortfahren', en: 'Confirm and continue', es: 'Confirmar y continuar' })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
