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

**2. Zurückhaltende Taktung — maximal drei Mails, oft weniger**
Statt vier Stufen bleiben drei. Jede Mail muss sich rechtfertigen: sie wird nur versendet, wenn der Nutzer sie in diesem Moment wirklich braucht. Wer aktiv ist oder schon produziert, bekommt weniger — nicht mehr.

```text
verifiziert
   |
   +-- Tag 0   "Dein Studio ist offen"   -> immer (die einzige Pflicht-Mail)
   |
   +-- Tag 2   nur wenn NOCH KEIN Clip: eine konkrete Vorlage fuer die
   |           eigene Nische. Wer schon produziert hat: keine Mail.
   |
   +-- Tag 6   nur wenn Trial laeuft und Nutzer inaktiv ODER Trial endet:
               eine ruhige Erinnerung. Sonst: keine Mail.
```

Harte Regeln gegen Zuspammen:
- Höchstens **drei** Mails in den ersten 14 Tagen, mindestens **48 h** Abstand.
- Wer in den letzten 72 h aktiv war, bekommt gar keine Aktivierungsmail — das Produkt spricht dann schon für sich (bisher waren es 24 h).
- Wer bereits einen fertigen Clip hat, verlässt die Strecke komplett. Kein „zweiter Clip"-Nachfassen, keine Autopilot-Werbemail.
- Ein Abmeldelink in jeder nicht-transaktionalen Mail, und ein einziger Klick genügt.

Ergebnis für einen typischen aktiven Nutzer: **eine einzige Mail** (Tag 0). Für einen abgesprungenen Nutzer: höchstens drei.

**Bewusst gestrichen** gegenüber heute: die Tag-1- und Tag-7-Stufe der Aktivierungsstrecke sowie die komplette Drip-Strecke.


**3. Studio-Sprache in allen Stufen, DE/EN/ES**
Alle Betreffzeilen und Texte werden auf das Studio-Motiv umgeschrieben: ein Ergebnis pro Mail, ein Button, der in dieselbe erste Produktion führt wie das Onboarding. Keine Feature-Listen.

**4. Ein Ziel-Link**
Jeder CTA führt auf denselben Einstieg wie der Onboarding-Abschluss (First Production), nicht auf das Dashboard. Damit misst sich die gesamte Strecke an einer Zahl: Zeit bis zum ersten fertigen Clip.

## Technische Details

- `supabase/functions/process-activation-emails/index.ts`: Stufen auf `day_0`, `day_2`, `day_6` reduzieren; pro Nutzer prüfen, ob ein fertiger Clip existiert (Abfrage auf die bestehenden Produktions-/Video-Tabellen) — bei `true` wird die Strecke beendet. Aktivitätsfenster von 24 h auf 72 h anheben, Mindestabstand 48 h und Deckel von drei Mails pro Nutzer über `email_send_log` prüfen.
- `supabase/functions/process-activation-emails/templates.ts`: Templates für `day_1`/`day_7` entfallen, `day_2`/`day_6` in DE/EN/ES neu getextet, jeweils ein Ergebnis und ein Button.
- Drip-Cron via `supabase--insert` abbestellen (`cron.unschedule`), Funktion selbst nicht löschen.
- Kein Schema-Umbau nötig: `email_send_log` und die Frequenzsperre bleiben wie sie sind.
- Danach Deploy von `process-activation-emails`.

## Nicht Teil dieses Schritts

Landing-Page-Beweisführung (12-s-Vorher/Nachher-Clip) und die Trial-Ende-Bezahlstrecke im Produkt selbst — das ist Phase 5 und folgt danach.
