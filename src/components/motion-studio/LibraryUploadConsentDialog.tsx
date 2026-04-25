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
      toast.error('Einwilligung konnte nicht gespeichert werden. Bitte erneut versuchen.');
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
            Rechtliche Bestätigung erforderlich
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left space-y-2">
            <span className="block">
              Bevor du eigene Bilder in die Library hochladen kannst, müssen wir aus rechtlichen
              Gründen (DSGVO, Persönlichkeitsrechte, Urheberrecht) folgende Punkte mit dir klären.
              Diese Einwilligung wird einmalig dokumentiert und gilt für künftige Uploads.
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
              <p className="text-sm font-medium">Ich besitze die Bildrechte.</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Ich bin Urheber des Bildes oder besitze eine gültige Lizenz, die die Nutzung in
                AI-generierten Videos erlaubt.
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
                  Abgebildete Personen haben eingewilligt.
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Falls eine reale Person erkennbar ist, liegt mir deren ausdrückliche Einwilligung
                  zur Nutzung als KI-Video-Referenz vor (Art. 6 DSGVO, § 22 KUG).
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
                Keine Marken oder prominenten Personen.
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Das Bild zeigt keine geschützten Marken, Logos oder Prominente, und die generierten
                Videos werden nicht zur Täuschung oder Rufschädigung verwendet.
              </p>
            </div>
          </label>

          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Bei Verstößen liegt die volle rechtliche Verantwortung beim hochladenden Nutzer. Wir
              dokumentieren diese Bestätigung mit Zeitstempel (Version {version}).
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleAccept}
            disabled={!allChecked || submitting}
            className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {submitting ? 'Wird gespeichert…' : 'Bestätigen und fortfahren'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
