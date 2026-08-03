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

**2. Taktung: fünf mögliche Kontaktpunkte, im Regelfall deutlich weniger**
Professionell ist nicht „wenig Mails", sondern „keine überflüssige Mail". Der Rahmen wird auf fünf Stufen in 14 Tagen gesetzt — aber jede Stufe hat eine Bedingung, sodass ein aktiver Nutzer real nur ein bis zwei davon sieht. Sechs Mails wären möglich, kosten aber genau an dem Punkt Vertrauen, an dem der Nutzer ohnehin schon produziert; die zwei stärksten Momente (Tag 0 und Trial-Ende) tragen den Großteil der Wirkung.

```text
verifiziert
   |
   +-- Tag 0    "Dein Studio ist offen"        -> immer (Pflicht-Mail)
   |
   +-- Tag 2    nur ohne fertigen Clip: eine konkrete Vorlage
   |            fuer die eigene Nische
   |
   +-- Tag 5    nur ohne fertigen Clip: ein zweiter Weg rein
   |            (Autopilot uebernimmt das Skript)
   |            MIT Clip: einmalig "so wird daraus eine Serie"
   |
   +-- Tag 9    nur bei Inaktivitaet >72h: ruhige Erinnerung,
   |            Hilfeangebot statt Verkauf
   |
   +-- Tag 13   Trial endet morgen: Ergebnisstand + 14,99 EUR
                -> immer (transaktionsnah, sachlich)
```

Harte Regeln gegen Zuspammen:
- Höchstens **fünf** Mails in den ersten 14 Tagen, mindestens **48 h** Abstand.
- Wer in den letzten 72 h aktiv war, überspringt die Aktivierungsstufen (Tag 2/5/9) — nur Tag 0 und Tag 13 bleiben.
- Wer bereits produziert, bekommt maximal **eine** Serien-Mail (Tag 5), danach nichts mehr aus dieser Strecke.
- Ein Abmeldelink in jeder nicht-transaktionalen Mail, ein Klick genügt. Abmeldung stoppt auch Winback.

Realistisches Ergebnis: aktiver Nutzer **2 Mails** in 14 Tagen, abgesprungener Nutzer **4–5**.

**Bewusst gestrichen** gegenüber heute: die komplette Drip-Strecke, damit nie zwei Erzählungen parallel laufen.


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
