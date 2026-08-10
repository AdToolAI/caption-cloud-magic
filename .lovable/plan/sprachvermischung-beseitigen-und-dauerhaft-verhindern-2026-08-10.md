# Sprachvermischung beseitigen und dauerhaft verhindern

## Befund (gemessen)

Die Ursache ist eingegrenzt und liegt **nicht** in den `tx({ de, en, es })`-Blöcken der Komponenten — die sind sauber (0 Treffer bei der Prüfung aller Dateien in `src`).

Das Problem steckt ausschließlich in `src/lib/translations.ts`, und zwar im hinteren Teil der Datei. Dort werden nach dem Hauptwörterbuch elf Namensräume per `Object.assign` nachgeladen:

`aiVid`, `soraLf`, `vidTrans`, `picStudio`, `newsHub`, `community`, `metaDiff`, `metaProbe`, `socialIntegrations`, `sora2Gate`, `wl`

In genau diesen Blöcken hat ein früherer automatisierter Übersetzungslauf spanische Texte in die **deutschen und englischen** Sprachblöcke geschrieben. Konkret gezählt:

- **156 deutsche Einträge enthalten spanischen Text** (z. B. `de.aiVid.pageTitle` = „Estudio de vídeo con IA", `de.aiVid.upgradeMessage`, `de.vidTrans.title` = „Traducir vídeo automáticamente")
- **26 englische Einträge enthalten spanischen Text** (z. B. `en.vidTrans.badge` = „Traductor de vídeo", `en.soraLf.*`)

Genau das erzeugt den Screenshot: Im AI Video Toolkit stehen „Nota sobre la generación de vídeo" und „Vídeo descargado" mitten in der deutschen Oberfläche. Das Hauptwörterbuch (Zeilen 12–17400) ist dagegen sauber, ebenso `translationsFill.ts`.

## Umsetzung

### Schritt 1 — Betroffene Einträge korrigieren
Alle elf nachgeladenen Namensräume werden Schlüssel für Schlüssel geprüft. Jeder deutsche Eintrag mit spanischem Inhalt wird durch die korrekte deutsche Formulierung ersetzt, jeder englische Eintrag entsprechend durch Englisch. Grundlage ist der jeweils vorhandene korrekte Text aus einer der drei Sprachen — es wird nichts neu erfunden, nur in die richtige Sprache gebracht. Fachbegriffe und Produktnamen (Sora 2, Credits, Prompt) bleiben unverändert.

Da die maschinelle Erkennung ein paar Grenzfälle liefert (z. B. „Workout des Tages. Los geht's!" ist korrektes Deutsch), wird jeder Treffer einzeln bewertet statt pauschal ersetzt.

### Schritt 2 — Vollständige Gegenprüfung
Nach der Korrektur läuft die Prüfung erneut über alle drei Sprachblöcke inklusive der nachgeladenen Namensräume. Ziel: null Treffer. Zusätzlich ein Durchgang durch die betroffenen Seiten (AI Video Toolkit, Video-Übersetzer, Picture Studio, News Hub, Community) mit `DE` und `EN` als Nachweis.

### Schritt 3 — Damit es nicht wiederkommt
Das bestehende Skript `scripts/check-i18n-consistency.mjs` prüft heute nur Platzhalter und Intl-Optionen innerhalb von `tx()`-Blöcken — die jetzige Fehlerklasse fällt komplett durch dieses Raster. Es wird um drei Prüfungen erweitert:

1. **Sprach-Kontamination**: Für jeden Eintrag in `translations.ts` (Hauptblöcke *und* alle `Object.assign`-Nachträge) wird geprüft, ob der Text zur deklarierten Sprache passt. Erkennungsmerkmale sind sprachspezifische Marker (spanisch: `vídeo`, `está`, `función`, `¿`, `¡`; deutsch: Umlaute, `der/die/das`, `nicht`; englisch: `the/is/and`). Ein spanischer Text im `de`-Block bricht den Lauf ab.
2. **Schlüssel-Parität**: Jeder Schlüssel muss in allen drei Sprachen existieren — inklusive der nachgeladenen Namensräume, die bisher gar nicht geprüft wurden.
3. **Identische Werte über Sprachen hinweg**: Wenn `de` und `es` exakt denselben Text haben, ist das fast immer ein Kopierfehler und wird als Warnung ausgegeben (Ausnahmeliste für Produktnamen und Kurzlabels wie „Prompt", „Credits").

Das Skript wird als Test eingebunden, sodass es bei jedem Durchlauf mitläuft und ein künftiger Massen-Übersetzungslauf sofort auffällt statt erst per Zufallsfund in der Oberfläche.

## Technische Details

- Änderungen nur in `src/lib/translations.ts` (Textwerte) und `scripts/check-i18n-consistency.mjs` (Prüflogik) plus Einbindung in die Testkonfiguration.
- Keine Änderung an Logik, Datenflüssen, Edge Functions oder KI-Prompts.
- Die elf Nachtrags-Namensräume bleiben als `Object.assign`-Blöcke bestehen; die Prüfung wird so gebaut, dass sie diese Struktur mit abdeckt, statt sie umzubauen.
- Der Fallback in `useTranslation` (Sprache → Fill → EN → DE → Schlüsselname) bleibt unverändert; er war nicht die Ursache.
