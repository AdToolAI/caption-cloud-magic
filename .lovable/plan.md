# Director's Cut — Textoverlays: Prüfung und Ausbau

Zwei Teile: erst alle bestehenden Overlays sauber prüfen und die gefundenen Schwächen beheben, danach die Bibliothek deutlich erweitern.

## Teil A — Prüfung und Reparatur der bestehenden Overlays

Geprüft werden alle 11 Bausteinarten (Text, Lower Third, Banner, Störer/Badge, Schild/Card, CTA, Ticker, Logo, Callout, Zitat, Fortschritt) in Bibliothek, Editor, Vorschau und Export.

Bekannte Schwachpunkte, die behoben werden:

1. **Overlays laufen aus dem Bild** (Hochformat). Vorschau und Overlay-Editor legen die Overlay-Ebene über den gesamten schwarzen Player, nicht über das tatsächlich sichtbare Videobild. Ergebnis: Text steht in den Balken. Behebung: eine gemeinsame Bühnen-Berechnung (Videoformat statt Containerformat), die Vorschau, Overlay-Editor und Untertitel-Ebene identisch nutzen.
2. **Alte Text-Overlays skalieren nicht mit.** Reine Text-Overlays ohne Box benutzen in der Vorschau feste Pixelgrößen (24/36/48/72), im Export dagegen die Canvas-Breite. Behebung: einheitlich relativ zur Bühnenbreite rechnen — damit stimmt Vorschau = Export.
3. **Ausgang-Animation falsch vorbelegt.** Die Presets setzen als Exit "fadeIn"; sinngemäß muss der Ausgang ausblenden bzw. spiegelbildlich zum Eingang laufen. Behebung: Exit-Vorgabe korrigieren und Ausgang sauber am Overlay-Ende auslösen (auch bei "bis Ende").
4. **Bausteine ohne Text-Felder.** Der Inspector bietet Titel/Untertitel nur bei vier Arten; Badge, CTA, Callout, Ticker und Fortschritt haben Felder, die nicht bedienbar sind (z. B. Badge-Zeile, Fortschrittswert). Behebung: Feldsatz pro Bausteinart vollständig.
5. **Logo/Bild nur per URL.** Behebung: Datei-Upload aus dem Brand Kit bzw. der Mediathek direkt im Inspector.
6. **Bibliotheks-Kacheln immer 16:9.** Behebung: Vorschaukachel übernimmt das Projektformat, damit die Wirkung im Hochformat stimmt.
7. **Lesbarkeit und Sicherheitsrand.** Automatischer Sicherheitsrand (Titelsicherheit) und optionaler weicher Abdunkler hinter Text auf unruhigem Bild; Warnhinweis, wenn eine Box außerhalb des Sicherheitsrands liegt.
8. **Abnahme:** jede Bausteinart wird mit Ein-/Ausgang in Hoch- und Querformat in Vorschau und Testexport gegengeprüft; Ergebnisse als kurze Checkliste dokumentiert.

## Teil B — Mehr Overlay-Möglichkeiten

Neue Bausteinarten inklusive Presets, Inspector-Feldern und identischem Renderpfad für Vorschau und Export:

- **Sprechblase** (mit Zeiger, links/rechts/oben/unten)
- **Aufzählung / Bullet-Liste** (Zeilen erscheinen nacheinander)
- **Kennzahl-Zähler** (Zahl zählt hoch, mit Einheit und Beschriftung)
- **Countdown / Timer** (Sekunden oder mm:ss)
- **Kapitel- bzw. Titelkarte** (Vollbild-Zwischentitel mit Nummer)
- **Social-Handle-Leiste** (Plattform-Symbol + @Name, Follow-Hinweis)
- **Preisschild / Streichpreis** (alter Preis durchgestrichen, neuer Preis hervorgehoben)
- **Vorher/Nachher-Label** (Paar-Label mit Trennlinie)
- **Hinweis-Pfeil / Marker** (Kreis oder Pfeil zum Anzeigen im Bild)
- **Tag-Chips** (mehrere kleine Schlagworte in einer Reihe)
- **QR-/Link-Box** (Kurzlink mit Rahmen, optional QR-Bild)
- **Untertitel-Balken** (fester Sprechertext-Balken, getrennt von den Auto-Untertiteln)
- **Sticker / Emoji-Stempel** (Bild oder Emoji mit Wackel-Animation)

Zusätzlich für alle Bausteine:

- **Neue Animationen**: Zoom-Punch, Zeilen-Wipe, Zittern/Shake, Neon-Puls, Slide+Fade kombiniert.
- **Stilvorlagen** je Marke: ein Klick färbt alle Overlays einer Szene auf das aktive Brand Kit um.
- **Duplizieren, Reihenfolge (Ebene nach vorn/hinten), Sperren** direkt in der Overlay-Liste.
- **Zeitliche Feinsteuerung**: Overlay an einen Schnitt/Szene binden, statt nur an absolute Sekunden.

## Technische Umsetzung

- Neue Datei `src/lib/directors-cut/videoStageRect.ts`: berechnet die sichtbare Videofläche (letterbox-korrekt) und wird von `DirectorsCutPreviewPlayer`, `OverlayCanvasEditor` und der Untertitel-Ebene genutzt.
- `OverlayKind` in `src/types/directors-cut.ts` um die neuen Arten erweitern; `DEFAULT_OVERLAY_BOX` in `overlayModel.ts` je Art ergänzen; Migration bestehender Overlays bleibt verlustfrei (`upgradeOverlay`).
- `src/remotion/components/OverlayGraphic.tsx` bleibt der einzige Renderer für Vorschau und Export — jede neue Art bekommt dort genau einen Zweig, damit WYSIWYG-Parität erhalten bleibt.
- `overlayAnim.ts` um die neuen Ein-/Ausgänge erweitern, Exit-Zeitfenster am Overlay-Ende korrekt spiegeln.
- `overlayPresets.ts` um die neuen Kategorien und Presets erweitern; `OverlayInspector.tsx` bekommt eine feldschema-getriebene Darstellung pro Bausteinart statt fester if-Ketten.
- Renderpfad und Export-Payload (snake_case) bleiben unverändert; keine Änderungen an Edge Functions oder Render-Schema.
