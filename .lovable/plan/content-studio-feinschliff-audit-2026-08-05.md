# Content Studio — Feinschliff-Audit

Der Umbau steht und funktioniert (Route, Redirects, Hub-Karte, Typecheck grün, Smoke-Test grün). Bei einer ehrlichen Durchsicht finde ich aber sieben Stellen, die noch nicht "Apple-sauber" sind. Alles davon ist Politur, kein Neubau.

## Was noch nicht rund ist

**1. Der Kampagnen-Einstieg landet stumm.**
`/campaigns` leitet auf `?step=deliver&mode=series` um, aber der Ausspielen-Schritt liest `mode=series` nicht — der Serien-Schalter steht trotzdem auf "aus". Wer aus dem alten Kampagnen-Assistenten kommt, sieht erst mal nur den Einzelpost.

**2. Zwei Download-Buttons nebeneinander.**
Im Ausspielen-Schritt steht ein eigener "Herunterladen"-Button direkt neben der `ExportActionBar`, die bereits Download | Jetzt veröffentlichen | Einplanen enthält. Doppelt und verwirrend.

**3. Ein Reload löscht alles.**
Briefing, Copy, Motiv und Layout leben nur im Speicher. Tab neu laden, Browser-Zurück auf eine andere Seite und zurück — alles weg. Bei einem Ablauf über fünf Schritte ist das die schmerzhafteste Lücke.

**4. Tiefe Links können ins Leere führen.**
`?step=layout` oder `?step=deliver` direkt aufgerufen (aus Hub-Vorschau oder Lesezeichen) zeigt einen leeren Editor ohne Erklärung, statt sanft zum Briefing zu führen.

**5. Mobil fehlt die Vorschau.**
Die Live-Vorschau ist nur ab Desktop-Breite sichtbar; auf dem Handy sieht man während Copy und Motiv gar nicht, was entsteht.

**6. Alte Wege zeigen noch auf Altrouten.**
Mediathek, Startseiten-Schnellaktion und Hintergrund-Export navigieren weiter nach `/ai-post-generator`; Dashboard-Tipps verlinken `/coach` und `/campaigns`. Es funktioniert (per Weiterleitung), erzeugt aber einen sichtbaren Zwischensprung.

**7. Karteileichen im Code.**
`hubConfig.ts` importiert noch Icons und ein Cover-Bild für gelöschte Kacheln.

## Was ich ändern will

- Serien-Modus aus der URL übernehmen (`mode=series`) und beim Umschalten in die URL zurückschreiben, damit der Zustand teilbar bleibt.
- Den doppelten Download entfernen; die `ExportActionBar` bleibt die einzige Ausspiel-Leiste.
- Entwurf automatisch sichern: Briefing, Copy, Caption, Motiv, Layout und Schritt landen entprellt in `localStorage` (nutzerbezogener Schlüssel) und werden beim Öffnen wiederhergestellt. "Neu" löscht den Entwurf sauber; ein dezenter Hinweis "Entwurf wiederhergestellt" mit Verwerfen-Option.
- Schritt-Wächter: Wer ohne Copy auf `layout`/`deliver` springt, wird auf den letzten sinnvollen Schritt gesetzt — mit kurzer Erklärung statt leerem Bildschirm.
- Live-Vorschau mobil als einklappbares Feld über dem Formular.
- Alle verbliebenen Verweise direkt auf `/content-studio?step=…` umstellen (Mediathek, Startseite, Hintergrund-Export, Dashboard-Tipps in allen drei Sprachen).
- Ungenutzte Importe in `hubConfig.ts` entfernen.

## Technische Details

- `src/contexts/ContentStudioContext.tsx`: Persistenz-Layer (`useEffect` + Entprellung, Schlüssel `content-studio:draft:<userId>`), Serialisierung nur der Rohdaten (Design als JSON, kein Blob), `reset()` löscht den Eintrag; abgeleiteter `canEnter(step)`-Wächter.
- `src/pages/ContentStudio.tsx`: Wächter beim Mount/Parameterwechsel anwenden (`replace: true`, kein History-Müll), `mode`-Parameter durchreichen, mobile Vorschau einhängen.
- `src/components/content-studio/steps/DeliverStep.tsx`: Serien-Schalter aus URL initialisieren, eigenen Download-Button entfernen.
- `src/components/content-studio/LivePreview.tsx`: `compact`-Variante für Mobil.
- Verweis-Updates in `MediaLibrary.tsx`, `Home.tsx`, `background/ExportControls.tsx`, `universal-creator/steps/PreviewExportStep.tsx`, `directors-cut/steps/ExportRenderStep.tsx`, `lib/translations.ts` (DE/EN/ES).
- Redirects bleiben als Sicherheitsnetz bestehen.

Abschließend Typecheck plus Browser-Durchlauf: Briefing → Copy → Motiv → Layout → Ausspielen, Reload mittendrin, `/campaigns` und `/post-designer` als Einstieg.
