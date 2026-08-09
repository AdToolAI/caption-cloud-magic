# Picture Studio zeigt Übersetzungs-Code statt Text

## Was passiert ist

Beim automatisierten Lokalisierungs-Durchlauf wurden in `src/lib/translations.ts` mehrere Einträge zu **einer einzigen Zeile zusammengeklebt**. Statt sieben getrennter Texte steht dort nur noch ein Text, in dem die restlichen Schlüssel als sichtbarer Inhalt hängen:

```text
pageTitle: "KI Picture Studio', breadcrumbCategory: 'Erstellen', tabGenerate: 'Generieren', ..."
```

Die App liest also brav den ersten Schlüssel aus — und zeigt den ganzen Textklumpen an. Genau das sieht man in beiden Screenshots (Titel, Breadcrumb, Stil-Auswahl, Aspect Ratio). Die restlichen Schlüssel existieren gar nicht mehr, deshalb erscheinen an anderer Stelle Rohwerte wie `category.Create`.

Umfang, gemessen: **192 solcher zusammengeklebter Zeilen** in `src/lib/translations.ts` (Schwerpunkt spanischer Block, einzelne auch in Englisch und Deutsch) plus **eine** Fundstelle in `src/pages/Legal.tsx`. Es ist kein Syntaxfehler — die Datei kompiliert, deshalb ist es beim Typecheck nicht aufgefallen.

## Vorgehen

1. **Alle betroffenen Zeilen wieder aufsplitten**: Jede zusammengeklebte Zeile wird in ihre ursprünglichen Einzel-Einträge zerlegt (ein Schlüssel = eine Zeile), inklusive korrekter Anführungszeichen und Kommas.
2. **Sprachreinheit prüfen**: Beim Aufsplitten sind im spanischen Block deutsche Werte gelandet (z. B. `styleRealistic: 'Realistisch'`, `qualityFast: 'Schnell'`). Diese Werte werden auf korrektes Spanisch gesetzt; gleiches Vorgehen für vereinzelte deutsche Reste im englischen Block.
3. **Vollständigkeit sicherstellen**: Nach dem Aufsplitten wird geprüft, dass alle drei Sprachblöcke (en/de/es) denselben Schlüsselsatz haben — fehlende Schlüssel werden ergänzt, damit nirgends mehr ein Roh-Schlüssel wie `category.Create` in der UI auftaucht.
4. **Legal-Seite**: die eine betroffene Stelle in `src/pages/Legal.tsx` analog reparieren.
5. **Schutz gegen Wiederholung**: Der vorhandene i18n-Konsistenz-Check (`scripts/check-i18n-consistency.mjs`) wird um eine Regel erweitert, die Werte mit eingebettetem `', xyz: '`-Muster als Fehler meldet. So schlägt genau dieser Fehler künftig sofort auf.

## Technische Details

- Betroffene Datei: `src/lib/translations.ts` (Blöcke `en` ab Zeile 12, `de` ab 5038, `es` ab 9938).
- Erkennungsmuster der Beschädigung: Werte, die `', <key>: '` enthalten.
- Reparatur erfolgt skriptgestützt (Zeile parsen → Schlüssel/Wert-Paare extrahieren → als eigene Zeilen schreiben), danach manuelle Sichtprüfung der Blöcke mit vielen Treffern (Picture Studio, Background Replacer, Timeline/Snap).
- Keine Änderungen an Komponentenlogik, Preisen oder Backend.

## Prüfung danach

- `/picture-studio` in DE, EN und ES: Titel, Tabs, Stil- und Aspect-Ratio-Auswahl zeigen echte Texte.
- Keine Treffer mehr für das Beschädigungsmuster im gesamten `src`.
- i18n-Konsistenz-Skript läuft ohne Fehler durch.
