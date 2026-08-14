# v430 — Contract-Nachzug (Schritt 5 schliessen) + Schritt 6 Planung

## Teil A — Granulare Ausnahme für `useTwoShotAutoTrigger.ts`

Heute steht die Datei komplett in der `SKIP_FILES`-Liste des Contract-Scanners. Damit käme jeder künftige neue Legacy-Reader in derselben Datei unbemerkt durch. Das wird auf zeilenbezogene Ausnahmen umgestellt.

### Was geändert wird

1. `src/lib/composer/__tests__/clientReaderContract5E.test.ts`
   - `src/hooks/useTwoShotAutoTrigger.ts` aus `SKIP_FILES` entfernen. In `SKIP_FILES` bleiben nur generierte Dateien und die kanonischen Resolver (`sceneState.ts`, `resolveSceneOutput.ts`, `continuityState.ts`).
   - Zweiten, präziseren Marker einführen: `// lipsync-legacy-read: <Grund>` für v425-gebundene Substage-Reads, zusätzlich zum bestehenden `// legacy-mapping-allowed: <Grund>`. Beide wirken weiterhin nur auf der Treffer-Zeile oder der Zeile davor.
   - Neuer Test: keine Datei aus `src/hooks/` oder `src/components/` darf in `SKIP_FILES` stehen (verhindert Rückfall auf Datei-Allowlists).
   - Neuer Test: jeder Marker muss einen nicht-leeren Grund nach dem Doppelpunkt tragen.

2. `src/hooks/useTwoShotAutoTrigger.ts`
   - Alle verbleibenden direkten Reads auf `lip_sync_status`, `twoshot_stage`, `clip_status` (ca. 30 Zeilen) einzeln mit `// lipsync-legacy-read:` und Kurzbegründung markieren.
   - Wo der Read reiner Hauptzustand ist und keine Lip-Sync-Substage trägt (die `clip_status !== 'ready'`-Gates), auf `legacyClipReadyEquivalentRow()` umstellen — semantikgleich, gleiche Zustandsmenge wie bisher.
   - Keine Änderung an Writes, Trigger-Bedingungen, Reihenfolge oder Timing der Lip-Sync-Orchestrierung.

### Harte Grenzen

- Keine Semantikänderung an der Lip-Sync-Pipeline (v425/v400 bleiben unverändert).
- Keine Writer-Änderung, keine Bridge-Änderung, keine State-Machine-Änderung.
- Nach dem Umbau meldet der Scanner weiterhin 0 unerlaubte Treffer.

### Abschluss Teil A

`bunx vitest run src/lib/composer src/hooks` + `tsgo` grün, Scanner 0 Treffer → **v430 Schritt 5 geschlossen**. Danach STOP und Bericht.

---

## Teil B — Schritt 6 (UI-Aufräumen), erst nach dem Teil-A-Bericht

Nur Oberfläche und Begriffe. Kein Backend-Verhalten, keine Pipeline-Semantik.

### 6.1 „Szenenaktionen“
Ein gemeinsamer Einstieg „Szenenaktionen“ mit drei getrennt benannten Operationen — kein Sammelbegriff „Reset“:
- **Lip-Sync neu erstellen** — bestehende Plate bleibt erhalten.
- **Szene komplett neu erstellen** — vollständiger Run-Reset.
- **Kontinuität aktualisieren** — nur der Anschluss wird neu gebunden, kein Render.

Alle drei rufen die bestehenden Backend-Pfade unverändert auf.

### 6.2 `transitionType` → `cutStyle` (Teil-Rename)
- `cutStyle` nur im Composer-Modell und in der UI (`ComposerScene`, Storyboard-UI, Transition-Handle).
- DB-Spalte `transition_type`, Render-Payloads, Remotion und Director's Cut bleiben unverändert.
- Genau eine Adapter-Stelle `cutStyle ↔ transition_type`; kein Full-Rename, keine Migration.

### 6.3 Legacy-Begriffe aus der UI entfernen
Sichtbare Restbegriffe wie „Two-Shot“, „Cinematic-Sync“, „Plate“, „twoshot_stage“ in Badges, Tooltips und Fehlermeldungen auf Kundensprache umstellen (DE/EN/ES über `i18nText`). Wichtig: interne Fehlercodes werden nicht vernichtet — der maschinenlesbare Code bleibt in Debug-/Detailansichten und in den Logs sichtbar, übersetzt wird nur der Kundentext.

### 6.4 SceneCard konsequent auf State/Substate/Resolver
Verbliebene lokale Ableitungen in `SceneCard.tsx` durch die kanonischen Helfer ersetzen; Video-Quelle ausschliesslich über `resolveSceneOutput()`.

### 6.5 Debug-/Statusanzeigen vereinheitlichen
Eine gemeinsame Status-Komponente für Szenen-Badges, Render-Queue und Pipeline-Panel, gespeist aus `sceneState()` + `sceneSubstate()`, statt drei eigener Label-Tabellen — inklusive Debug-Zeile mit Rohzustand und Fehlercode.

### Nicht in Schritt 6
Lip-Sync-Writer-Migration und Abschalten der Reverse-Bridge — das bleibt v431.

---

## Vorgehen

1. Teil A umsetzen, Tests, STOP mit Bericht.
2. Danach Schritt 6 als eigener Plan auf Basis der oben festgelegten Entscheidungen (Teil-Rename `cutStyle`, „Szenenaktionen“ statt Reset-Sammelbegriff).
