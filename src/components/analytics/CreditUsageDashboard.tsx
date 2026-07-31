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
        <CardTitle className="text-base">Alles im Beta-Abo enthalten</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">
        <p>
          Mit dem Beta-Basic-Abo (14,99 €/Monat) sind Chat, Automatisierung,
          Publishing und alle Plattform-Features unbegrenzt nutzbar.
        </p>
        <p>
          Nur AI-Video, Music- und Bildgenerierung laufen über separate
          Media-Credits. Deinen aktuellen Media-Credit-Stand siehst du direkt
          im AI Video Studio bzw. bei jeder Generierung im Kosten-Vorschau-Dialog.
        </p>
      </CardContent>
    </Card>
  );
};
