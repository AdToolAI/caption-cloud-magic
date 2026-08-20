import { tx } from "@/lib/i18nText";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Crown } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

type Lang = "de" | "en" | "es";

const copy: Record<Lang, {
  title: string;
  desc: string;
  reasonsLabel: string;
  reasons: { key: string; label: string }[];
  warnTitle: string;
  warnBody: string;
  stay: string;
  proceed: string;
}> = {
  de: {
    title: "Bevor du kündigst",
    desc: "Sag uns kurz, woran es liegt — ein Klick genügt. Das hilft uns, das Studio besser zu machen.",
    reasonsLabel: "Grund",
    reasons: [
      { key: "too_expensive", label: "Zu teuer" },
      { key: "not_using", label: "Ich nutze es zu selten" },
      { key: "quality", label: "Ergebnisse überzeugen mich nicht" },
      { key: "missing_feature", label: "Eine Funktion fehlt mir" },
      { key: "temporary", label: "Nur eine Pause" },
      { key: "other", label: "Anderer Grund" },
    ],
    warnTitle: "Dein Gründer-Vorteil verfällt",
    warnBody:
      "Mit der Kündigung verlierst du deinen dauerhaften Gründer-Rabatt von 20 %. Bei einer späteren Rückkehr gilt der reguläre Preis.",
    stay: "Doch bleiben",
    proceed: "Weiter zur Kündigung",
  },
  en: {
    title: "Before you cancel",
    desc: "Tell us briefly what's behind it — one click is enough. It helps us improve the studio.",
    reasonsLabel: "Reason",
    reasons: [
      { key: "too_expensive", label: "Too expensive" },
      { key: "not_using", label: "I use it too rarely" },
      { key: "quality", label: "Results don't convince me" },
      { key: "missing_feature", label: "A feature is missing" },
      { key: "temporary", label: "Just a break" },
      { key: "other", label: "Other reason" },
    ],
    warnTitle: "Your founder benefit expires",
    warnBody:
      "Cancelling forfeits your permanent 20% founder discount. If you return later, the regular price applies.",
    stay: "Stay after all",
    proceed: "Continue to cancellation",
  },
  es: {
    title: "Antes de cancelar",
    desc: "Cuéntanos brevemente el motivo — un clic basta. Nos ayuda a mejorar el estudio.",
    reasonsLabel: "Motivo",
    reasons: [
      { key: "too_expensive", label: "Demasiado caro" },
      { key: "not_using", label: "Lo uso muy poco" },
      { key: "quality", label: "Los resultados no me convencen" },
      { key: "missing_feature", label: "Me falta una función" },
      { key: "temporary", label: "Solo una pausa" },
      { key: "other", label: "Otro motivo" },
    ],
    warnTitle: "Tu ventaja de fundador caduca",
    warnBody:
      "Al cancelar pierdes tu descuento permanente de fundador del 20 %. Si vuelves más tarde, se aplica el precio normal.",
    stay: "Mejor me quedo",
    proceed: "Continuar con la cancelación",
  },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: string;
  plan: string;
  onProceed: () => void;
}

export const CancelIntentDialog = ({ open, onOpenChange, language, plan, onProceed }: Props) => {
  const t = copy[(language as Lang)] ?? copy.en;
  const [reason, setReason] = useState<string | null>(null);

  const handleProceed = () => {
    trackEvent("cancellation_intent", { reason: reason || "unspecified", plan });
    onOpenChange(false);
    onProceed();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.desc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t.reasonsLabel}
            </p>
            <div className="flex flex-wrap gap-2">
              {t.reasons.map((r) => (
                <Button
                  key={r.key}
                  type="button"
                  size="sm"
                  variant={reason === r.key ? "default" : "outline"}
                  onClick={() => setReason(r.key)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm flex items-center gap-1.5">
                <Crown className="h-4 w-4 text-warning" />
                {t.warnTitle}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{t.warnBody}</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.stay}
          </Button>
          <Button variant="destructive" onClick={handleProceed}>
            {t.proceed}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
