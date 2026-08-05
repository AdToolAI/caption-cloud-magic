# Bewertung Content Command Center + "Publish bei jedem Export"

## Teil 1: Ehrliche Bewertung des Command Centers

Visuell: sauber. Cinematic Header, Gold-Tokens statt Hardcodes, Tabs mit Icons, konsistent zum Bond-2028-System.

Logisch: gut, aber noch nicht "so professionell wie nur möglich". Diese Punkte sind im Code verifiziert und offen:

1. **Alt-Routen im eigenen Code**: Die Mediathek navigiert weiterhin auf `/composer` und `/calendar?prefill=true` (4 Stellen in `MediaLibrary.tsx`). Das funktioniert nur über die Redirect-Brücke — ein unnötiger Doppelsprung in der History.
2. **Toter Link**: `/calendar/templates` wird in `CampaignTemplateDialog.tsx` und `CalendarToolbar.tsx` verlinkt, existiert als Route aber nicht mehr.
3. **Composer-Ebene schließt zu streng**: Die Overlay-Ebene schließt nur, wenn *alle* Kanäle erfolgreich waren. Bei Teilerfolg bleibt der Nutzer im Vollbild ohne klaren nächsten Schritt.
4. **KeepAlive**: Die "besuchte Ansichten"-Menge liegt in einem Ref, das während des Renderns beschrieben wird. Funktioniert, ist aber kein sauberes React-Pattern und sollte in State wandern.
5. **Ausgeblendete Ansichten laufen weiter**: Ausgeblendete Tabs behalten Polling/Intervalle. Sie sollten pausieren, solange sie nicht sichtbar sind.

## Teil 2: Publish-Button bei jedem Export — ja, sehr gute Idee

Der Gedanke ist richtig und passt exakt zur Positionierung: Der Export ist heute eine Sackgasse (Datei runterladen, fertig). Genau dort ist der Moment mit der höchsten Motivation, zu veröffentlichen.

Wichtig: **nicht** neben jeden Download einen eigenen Publish-Flow bauen. Sonst entstehen 30 Varianten. Stattdessen ein einziger, wiederverwendbarer Baustein.

Aufgefallen: Es gibt bereits einen `PublishDialog` (`components/publishing/PublishDialog.tsx`), der nirgendwo eingebunden ist — toter Code, der ersetzt wird.

### Konzept: eine "Fertig"-Aktionsleiste

Überall dort, wo heute ein Download angeboten wird, erscheint dieselbe Leiste mit drei gleichwertigen Aktionen:

```text
[ Herunterladen ]   [ Jetzt veröffentlichen ]   [ Einplanen ]
```

- **Jetzt veröffentlichen** öffnet das Command Center im Composer-Overlay, mit Medium, Caption-Vorschlag und Format bereits vorbefüllt.
- **Einplanen** springt in den Kalender mit Terminvorschlag aus den "Besten Zeiten" für die gewählten Kanäle.
- Ist noch kein Kanal verbunden, führt die Leiste zuerst zur Kanalverbindung statt in eine Fehlermeldung.

### Reihenfolge der Einbindung

1. Director's Cut Export (Video, höchster Wert)
2. Universal Content Creator Export
3. Post Designer / Picture Studio (Bild)
4. Mediathek-Aktionen (ersetzt die heutigen Einzel-Buttons)
5. Music Studio (nur "Einplanen", kein direkter Audio-Post)

## Technische Umsetzung

**Neu:**
- `src/lib/publishHandoff.ts` — ein Typ `PublishHandoff { mediaUrl, mediaType, thumbnailUrl?, caption?, hashtags?, aspectRatio?, source }`, plus Schreiben/Lesen über `sessionStorage` (analog zum bestehenden `calendar_prefill`).
- `src/hooks/useQuickPublish.ts` — kapselt Handoff-Schreiben und Navigation nach `/command-center?compose=1` bzw. `?view=calendar&prefill=true`; prüft vorher verbundene Kanäle.
- `src/components/publishing/ExportActionBar.tsx` — die gemeinsame Leiste (Download-Callback als Prop, Publish/Schedule intern).

**Angepasst:**
- `Composer.tsx` liest den Handoff beim Mount und befüllt Medium/Text vor; schließt das Overlay auch bei Teilerfolg (mit Hinweis auf die fehlgeschlagenen Kanäle).
- `ExportRenderStep.tsx`, `UniversalExportStep.tsx`, `PreviewExportStep.tsx`, Post-Designer- und Picture-Studio-Export sowie `MediaLibrary.tsx` binden `ExportActionBar` ein.
- `MediaLibrary.tsx` navigiert direkt auf `/command-center`, nicht mehr auf Alt-Routen.
- `CampaignTemplateDialog.tsx` und `CalendarToolbar.tsx`: toten `/calendar/templates`-Link auf die Kampagnen-Ansicht umbiegen.
- `CommandCenter.tsx`: besuchte Ansichten in State, unsichtbare Ansichten pausieren.
- `PublishDialog.tsx` wird entfernt.

Alle Texte in `cc.*` bzw. neuem `publishBar.*`-Namespace in EN/DE/ES.
