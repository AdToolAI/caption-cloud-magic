# Instagram-Verbindung: Vorab-Checkliste im Verbindungsbereich

## Was tatsächlich passiert

Der Meta-Dialog sagt „Du hast keine professionellen Instagram-Konten, die mit einer Seite verknüpft sind". Das ist keine Fehlfunktion der App, sondern Metas korrekte Antwort: Meta zeigt in diesem Dialog nur Instagram-Konten an, die **beide** Bedingungen erfüllen:

1. Kontotyp ist **Business oder Creator** (kein privates Konto)
2. Das Konto ist mit einer **Facebook-Seite** verknüpft (nicht nur mit dem privaten Facebook-Profil)

Ist eine der beiden Bedingungen offen, ist die Liste leer — genau wie im Screenshot.

## Was ich in der App ergänze

Im Verbindungsbereich bekommt die Instagram-Kachel einen aufklappbaren Hinweis, der **vor** dem Klick auf „Verbinden" sichtbar ist:

- Kurzer Satz: „Instagram lässt sich nur verbinden, wenn dein Konto ein Profi-Konto ist und mit einer Facebook-Seite verknüpft ist."
- Checkliste mit zwei Punkten und jeweils einer Ein-Satz-Anleitung:
  1. **Profi-Konto aktivieren** — Instagram-App → Einstellungen → Kontotyp und Tools → Zu Profi-Konto wechseln
  2. **Mit Facebook-Seite verknüpfen** — Instagram-App → Einstellungen → Verknüpfte Konten → Facebook-Seite auswählen (alternativ Meta Business Suite → Einstellungen → Instagram-Konten)
- Zwei Außenlinks: Meta Business Suite und Metas Hilfeartikel zum Verknüpfen.
- Der Hinweis ist standardmäßig eingeklappt, damit die Kachel schlank bleibt, und verschwindet, sobald Instagram verbunden ist.

Der Verbinden-Button bleibt unverändert klickbar — es ist ein Hinweis, keine Sperre.

## Technische Details

- Neue Komponente `src/components/performance/InstagramSetupChecklist.tsx` (Collapsible mit Checkliste und Links), styling über die vorhandenen Card-/Muted-Tokens.
- Eingebunden in `src/components/performance/ConnectionsTab.tsx` im „nicht verbunden"-Zweig (Zeile ~1156-1162), nur für `provider.id === 'instagram'`.
- Texte DE/EN/ES in `src/lib/translations.ts` unter `socialIntegrations.instagramSetup.*`.
- Keine Änderung an der OAuth-Logik, den Edge Functions oder Datenbank.

## Was du parallel bei Meta erledigst

- `@adtoolai` auf Profi-Konto (Business oder Creator) umstellen.
- Facebook-Seite „AdTool AI" anlegen bzw. verwenden und das Instagram-Profi-Konto damit verknüpfen.
- Danach den Verbinden-Dialog erneut öffnen — das Konto sollte dann zur Auswahl stehen.
