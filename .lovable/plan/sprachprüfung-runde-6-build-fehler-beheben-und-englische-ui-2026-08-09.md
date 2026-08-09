# Sprachprüfung Runde 6: Build-Fehler beheben und englische UI final verifizieren

Der letzte automatisierte Übersetzungslauf hat an einigen Stellen Code statt Text übersetzt. Der TypeScript-Build meldet dadurch aktuell 23 Fehler. Diese werden zuerst behoben, danach wird die englische Oberfläche systematisch gegengeprüft.

## Teil 1: Die 23 Build-Fehler beheben

**A. Kaputt verschachtelte Übersetzungsaufrufe (7 Fehler)**
In `ProductionPlanSheet.tsx` (Zeilen 917/918) und `useMotionStudioLibrary.ts` (Zeilen 104, 166, 475, 625) sind Anführungszeichen im Text dazu geführt, dass der Übersetzungsblock mitten im Satz erneut geöffnet wurde. Diese Stellen werden von Hand zu je einem sauberen Dreiklang (DE/EN/ES) zusammengeführt.

**B. Übersetzte Code-Werte (4 Fehler)**
- `AutopilotWeeklyReviewPanel.tsx` Zeile 51: Datumsoptionen wurden übersetzt (`'largo'`, `'2 dígitos'`) — zurück auf `'long'` / `'2-digit'`; das Gebietsschema wird zusätzlich an die aktive Sprache gekoppelt statt fest `de-DE`.
- `InstagramPublishing.tsx` Zeile 1100: Der Vergleichswert `"page"` wurde im spanischen Text zu `"página"` übersetzt — Vergleich bleibt `"page"`, nur die Anzeige wird übersetzt.

**C. Fehlende Importe (5 Fehler)**
`WatchdogTab.tsx` und `CampaignMediaUploader.tsx` verwenden `tx()` ohne passenden Import — Import ergänzen.

## Teil 2: Vollständige Prüfung der englischen UI

1. **Automatischer Schutz vor genau dieser Fehlerklasse**: Ein Prüf-Skript vergleicht in jedem Übersetzungsblock die Code-Platzhalter von DE, EN und ES. Weichen Bezeichner oder API-Werte voneinander ab, gilt das als Fehler. Ergänzend werden übersetzte technische Werte (Datumsoptionen, Locale-Strings, Vergleichs-Literale) gesucht.
2. **Restbestand deutscher Texte**: Repository-weiter Audit aller sichtbaren Strings auf verbliebene deutsche Klartexte; jeder Treffer wird lokalisiert.
3. **Qualitätsprüfung Englisch**: Suche nach typischen Maschinen-Artefakten (wörtlich übersetzte Redewendungen, „e.g. B.", deutsche Satzstellung, deutsche Anführungszeichen, unübersetzte Fachbegriffe) inklusive Backend-Meldungen und E-Mail-Texten.
4. **Sichtprüfung**: Durchklicken der Hauptbereiche (Dashboard, Content Studio, AI Video Studio, Video Composer, Director's Cut, Kalender, Verbindungen, Konto, Admin) in englischer Sprache mit Screenshots, um Layoutbrüche und übrig gebliebene deutsche Labels zu sehen.
5. **Abschluss**: Build und Typecheck müssen grün sein, der Marken-Konsistenztest läuft mit.

## Technische Details

- Reparaturen erfolgen manuell bzw. mit eng begrenzten Skripten; der bisherige Massen-Rewriter wird nicht erneut über bestehende `tx()`-Blöcke laufen gelassen.
- Der Platzhalter-Vergleich wird als wiederverwendbares Skript unter `scripts/` abgelegt, damit dieselbe Fehlerklasse künftig sofort auffällt.
- Prüfumfang: `src/**` und `supabase/functions/**`; Verifikation mit `bun run build:dev` und `tsgo --noEmit`.
