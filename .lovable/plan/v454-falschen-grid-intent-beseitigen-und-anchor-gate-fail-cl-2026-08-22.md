# V454 — Falschen Grid-Intent beseitigen und Anchor-Gate fail-closed machen

## Belegter Befund

Der aktuelle Lauf von Szene `be60d106…` wurde nicht trotz des Prompts, sondern wegen einer internen Fehlinterpretation als Raster erzeugt:

- `compose-scene-anchor` protokollierte bei jedem Anchor-Versuch `grid intent detected (style=2x2)`.
- `detectGridIntent` durchsucht den gesamten Prompt nur nach Wörtern wie `grid`, `2x2` und `split-screen`. Er unterscheidet nicht zwischen „erstelle ein Grid“ und den vorhandenen Verboten „no grid / no split-screen / no 2x2 grid“.
- Sobald dieser False Positive greift, schaltet der Anchor-Composer bewusst auf positive Raster-Anweisungen um: „clean 2x2 grid“, „one person per grid panel“ und „thin divider“.
- Der Min-Face-Size-Retry verschärft denselben Fehler: Für vier Personen erzeugt er `tight_grid` und fordert ausdrücklich „TIGHT 2×2 grid“, „own quadrant/cell“.
- Der normale Vierer-Lip-Sync-Prompt ist ebenfalls widersprüchlich zur gewünschten Szene: „single horizontal line“, „evenly spaced“, „clear vertical gaps“, „no overlap and no depth stacking“ begünstigt isolierte Portraitfelder und widerspricht Matthew im Hintergrund sowie natürlicher räumlicher Staffelung.
- Der V453-Geometrie-Detektor erkannte den ersten Panel-Anker und löste den Retry aus. Der Retry-Anker wurde jedoch als `panel=0` freigegeben, obwohl das sichtbare Ergebnis erneut ein 2×2-Raster ist. Ein ausschließlich gesichtsgeometrischer Detektor reicht daher als finale Autorität nicht aus.

## Umsetzung

1. **Grid-Intent semantisch absichern**
   - Negative Formulierungen wie `no grid`, `not a grid`, `without panels`, `kein Raster`, `keine Collage` dürfen niemals Grid-Intent aktivieren.
   - Ein Grid wird nur bei einer eindeutig positiven Benutzeranweisung aktiviert, nicht durch interne Negative-Prompt-Blöcke.
   - Für den Cinematic-Sync-Anchor-Pfad wird die beabsichtigte Layout-Entscheidung explizit übergeben, statt sie aus dem bereits angereicherten Gesamtprompt erneut zu erraten.

2. **Vierer-Framing ohne Panel-Sprache**
   - Den N=4-Standard von horizontaler Reihe, gleichmäßigen Lücken und fehlender Tiefenstaffelung auf ein natürliches Ensemble in einem gemeinsamen physischen Raum umstellen.
   - Räumliche Anweisungen aus `SceneAction`/Cast-Actions (links, rechts, dahinter, Three-quarter) behalten Vorrang.
   - Weiterhin alle vier Gesichter ausreichend groß und für Lip-Sync lesbar halten, ohne Quadranten, Zellen oder Headshot-Anordnung zu verlangen.

3. **Min-Face-Retry reparieren**
   - `tight_grid` für vier Sprecher entfernen/ersetzen durch einen engen gemeinsamen Ensemble-Shot.
   - Keine Begriffe wie `2×2`, `quadrant`, `cell`, `panel` oder getrennte Einzelportraits mehr in diesem Retry.
   - Retry bleibt auf größere Gesichter und geringere Kameradistanz beschränkt.

4. **Finales Anchor-Gate verstärken**
   - Zusätzlich zur Gesichtsgeometrie harte horizontale/vertikale Bildnähte bzw. getrennte Kachelflächen prüfen.
   - Geometrie- oder Naht-Treffer blockiert den Anchor vor jedem Video-Provider-Aufruf.
   - Nach einem bereits erkannten Panel darf ein Retry nur bei eindeutig sauberer gemeinsamer Szene freigegeben werden; unklare Messung bleibt blockiert statt fail-open.
   - Bestehenden idempotenten Refund-Pfad unverändert nutzen.

5. **Regressionstests und Rollout**
   - Tests für den exakten False Positive: `no split-screen, no grid layout, no 2x2 grid` ergibt keinen Grid-Wunsch.
   - Positive Opt-in-Tests für echte Grid-Wünsche bleiben erhalten.
   - Tests stellen sicher, dass der Vierer-Min-Face-Retry niemals Raster-/Panel-Sprache erzeugt.
   - Tests für 2×2 mit sichtbaren Nähten und für eine echte, räumlich gestaffelte Gruppenaufnahme.
   - Anchor-Audit-Version erhöhen, betroffene Funktionen deployen und erst danach genau einen kontrollierten Rerender von S01 starten.

## Akzeptanz

- Der effektive Anchor-Prompt enthält ausschließlich eine gemeinsame, ununterbrochene Szene und keine positive Grid-/Panel-Anweisung.
- Die Logs zeigen für den gegebenen Prompt `gridRequested=false`.
- Ein 2×2-Anker kann weder durch den Min-Face-Retry erzeugt noch vom finalen Gate freigegeben werden.
- Der kontrollierte Rerender zeigt Sarah, Samuel, Matthew und Kay gemeinsam im Rooftop-Setting ohne Trennlinien oder Einzelkacheln.
