# Nächster sinnvoller Schritt: Phase 4 — Eine E-Mail-Strecke statt drei

Der Studio-Einzug (ein Onboarding, direkte Übergabe in die erste Produktion, einheitlicher CTA) steht. Der größte verbleibende Bruch im Funnel ist die E-Mail-Seite: dort laufen aktuell zwei Strecken parallel gegen dieselben neuen Nutzer.

## Warum genau das jetzt

- `process-activation-emails` versendet vier Stufen (day_0 / day_1 / day_3 / day_7), verankert an `email_verified_at`.
- `process-drip-emails` versendet drei Stufen (Tag 1 / 3 / 7), verankert an `auth.users.created_at`.
- Beide Strecken treffen also denselben Nutzer in denselben Zeitfenstern mit zwei unterschiedlichen Erzählungen. Die 3-Tage-Frequenzsperre verhindert Doppelversand nur zufällig — welche Mail gewinnt, hängt von der Cron-Reihenfolge ab. Der Nutzer bekommt dadurch keine erkennbare Geschichte, sondern Rauschen.
- Zusätzlich sprechen die Aktivierungs-Texte noch die alte Caption-/Content-Sprache, nicht „Ein Creator. Ein ganzes Studio."

## Was gebaut wird

**1. Eine Strecke: Aktivierung gewinnt**
`process-activation-emails` wird die einzige Onboarding-Strecke. Anker bleibt `email_verified_at` — nur wer verifiziert hat, ist ein echter Nutzer. `process-drip-emails` wird stillgelegt (Cron abbestellt, Funktion bleibt als Code stehen, damit nichts unwiederbringlich verloren geht). Winback bleibt unangetastet, das ist eine andere Lebensphase.

**2. Verhaltensbasierte Verzweigung statt starrer Tage**
Jede Stufe prüft vor Versand den einzig relevanten Zustand: **Hat dieser Nutzer schon einen fertigen Clip?**

```text
verifiziert
   |
   +-- Tag 0  "Dein Studio ist offen"        -> immer
   |
   +-- Tag 1  kein Clip? "Erste Produktion in 12 Minuten"
   |          Clip da?   "Dein zweiter Clip - anderes Format"
   |
   +-- Tag 3  kein Clip? konkrete Vorlage fuer die eigene Nische
   |          Clip da?   Autopilot-Einladung (Wochenplan)
   |
   +-- Tag 7  kein Clip? letzte Aktivierung + Hilfeangebot
              Clip da?   Trial-Ende + 14,99 EUR Angebot
```

Aktive Nutzer (letzte 24 h aktiv) werden wie bisher übersprungen.

**3. Studio-Sprache in allen Stufen, DE/EN/ES**
Alle Betreffzeilen und Texte werden auf das Studio-Motiv umgeschrieben: ein Ergebnis pro Mail, ein Button, der in dieselbe erste Produktion führt wie das Onboarding. Keine Feature-Listen.

**4. Ein Ziel-Link**
Jeder CTA führt auf denselben Einstieg wie der Onboarding-Abschluss (First Production), nicht auf das Dashboard. Damit misst sich die gesamte Strecke an einer Zahl: Zeit bis zum ersten fertigen Clip.

## Technische Details

- `supabase/functions/process-activation-emails/index.ts`: pro Nutzer einmalig prüfen, ob ein fertiger Clip existiert (Abfrage auf die bestehenden Produktions-/Video-Tabellen), Ergebnis als `hasClip` an das Template durchreichen.
- `supabase/functions/process-activation-emails/templates.ts`: `renderActivationEmail` erhält `hasClip`; je Stufe zwei Varianten pro Sprache. Bestehende Signatur bleibt abwärtskompatibel (`hasClip` optional, Default = Variante „kein Clip").
- Drip-Cron via `supabase--insert` abbestellen (`cron.unschedule`), Funktion selbst nicht löschen.
- Kein Schema-Umbau nötig: `email_send_log` und die Frequenzsperre bleiben wie sie sind.
- Danach Deploy von `process-activation-emails`.

## Nicht Teil dieses Schritts

Landing-Page-Beweisführung (12-s-Vorher/Nachher-Clip) und die Trial-Ende-Bezahlstrecke im Produkt selbst — das ist Phase 5 und folgt danach.
