import { tx } from '@/lib/i18nText';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

/**
 * CreditUsageDashboard — Beta 2026 Placeholder.
 *
 * Das generische Credit-Nutzungs-Dashboard ist mit Abschaffung des alten
 * Credit-Systems entfallen. Chat, Edge Functions, Automation und Publishing
 * sind im Beta-Basic-Abo (14,99 €) enthalten. Media-Credit-Verbrauch
 * (AI-Video, Music, Bild) wird direkt im jeweiligen Studio angezeigt.
 */
export const CreditUsageDashboard = () => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <Sparkles className="h-5 w-5 text-primary" />
        <CardTitle className="text-base">{tx({ de: 'Alles im Beta-Abo enthalten', en: 'Everything included in the beta plan', es: 'Todo incluido en el plan beta' })}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">
        <p>
          {tx({ de: "Mit dem Beta-Basic-Abo (14,99 €/Monat) sind Chat, Automatisierung,", en: "With the Beta Basic subscription (€14.99/month), chat, automation,", es: "Con la suscripción Beta Basic (14,99 €/mes), el chat, la automatización," })}
          {tx({ de: "Publishing und alle Plattform-Features unbegrenzt nutzbar.", en: "Publishing and all platform features are unlimited.", es: "Publicación y todas las funciones de la plataforma son ilimitadas." })}
        </p>
        <p>
        </p>
      </CardContent>
    </Card>
  );
};
