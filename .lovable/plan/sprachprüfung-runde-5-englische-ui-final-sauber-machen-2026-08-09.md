# Sprachprüfung Runde 5: englische UI final sauber machen

Ich habe die Plattform erneut durchgemessen. Die englische UI ist zu ~95 % sauber, aber es gibt drei klar messbare Restklassen von Fehlern. Der Plan behebt genau diese.

## Befund (gemessen, nicht geschätzt)

| Klasse | Umfang | Beispiel |
|---|---|---|
| A: Deutsche Texte noch fest im Code (ohne Übersetzung) | ca. 180 Stellen in ~150 Dateien (ohne Wörterbuch) | `SoundLibrary.tsx`: „Sound gelöscht"; `AIVideoDisclaimer.tsx`; `AutopilotStudio.tsx` |
| B: Maschinen-Artefakte in englischen Texten | 133 Stellen in 87 Dateien | „e.g. B." (aus „z. B."), „Seconds in a row" |
| C: Spanisches Wörterbuch enthält deutsche/gesiezte Texte | 373 Einträge in `src/lib/translations.ts` (ES-Block) | „Post erstellen", „So wird Ihr Post aussehen" |

Der englische Wörterbuch-Block (`en:`) ist sauber — dort wurden 0 deutsche Einträge gefunden.

## Was gemacht wird

1. **Klasse A — Restliche deutsche Literale lokalisieren**
   Jede verbleibende Fundstelle wird in `tx({ de, en, es })` bzw. `t('...')` überführt. Betroffen sind vor allem: Autopilot Studio, Video Composer (Szenen-Panels), Directors Cut Steps, Audio-/Music-Studio, AI Companion, Account-Tabs, Admin-Seiten. Reine Konfigurationswerte, Modell-IDs, Prompt-Bausteine für KI-Modelle und Marken-/Dateinamen bleiben unverändert (Prompts müssen laut Projektregel englisch/technisch bleiben).

2. **Klasse B — Übersetzungsartefakte korrigieren**
   Automatisierte Ersetzung der typischen Muster („e.g. B." → „e.g.", „Seconds in a row" → „seconds straight" usw.) plus manuelle Durchsicht der Treffer, bei denen der englische Satz dadurch sinnentstellt war.

3. **Klasse C — Spanisches Wörterbuch nachziehen**
   Die 373 deutschen Einträge im `es:`-Block werden ins Spanische übersetzt, im gleichen Duz-/Ton-Stil wie die restliche Plattform.

4. **Regressionsschutz**
   Ein Test (`src/test/i18n-language-purity.test.ts`) prüft künftig automatisch: keine deutschen Wörter im `en:`- und `es:`-Block, keine „e.g. B."-Artefakte, und keine neu hinzugefügten deutschen Klartext-Literale in `src/` außerhalb der `de:`-Slots. Damit fällt so ein Rückschritt beim nächsten Feature sofort auf.

5. **Sichtprüfung**
   Abschließend gehe ich mit englischer Spracheinstellung per Browser-Automatisierung die Hauptrouten durch (Dashboard, AI Video Studio, Video Composer, Directors Cut, Audio/Music Studio, Kalender, Content Studio, Einstellungen/Verbindungen, Account/Billing) und mache Screenshots, um sichtbare Reste und kaputte `tx({ de: …`-Ausgaben auszuschließen.

## Technische Details

- Umsetzung in parallelen Paketen über Sub-Agenten, gruppiert nach Ordner, mit demselben Werkzeug wie in Welle 4 (`tx()` aus `src/lib/i18nText.ts`, `t()` aus `src/lib/translations.ts`).
- Nach jedem Paket: `tsgo --noEmit` und `bun run build:dev`, damit keine kaputten Template-Literale oder JSX-Attribute zurückbleiben (das war die Fehlerquelle der letzten Runde).
- Keine Änderungen an Business-Logik, Datenbank oder Edge Functions — reine Text-/Präsentationsebene.

## Nicht Teil des Plans

- Backend-Mails und Edge-Function-Texte (bereits in Welle 3 lokalisiert).
- Demo-/Seed-Daten und interne Dokumente (`docs/`, `SECURITY.md`).
