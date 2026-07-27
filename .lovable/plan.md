# Plan v273 — Grid-Layout nur auf explizite Kunden-Anforderung

## Ziel
Single-Frame ("eine gemeinsame Szene") bleibt der Standard für alle Multi-Sprecher-Anchors. Ein 2×2-/Split-/Collage-Layout wird **nur** dann erzeugt, wenn der Kunde es im Briefing/Prompt explizit anfordert (z. B. „Grid", „Split-Screen", „2x2", „Kacheln", „Collage", „Panel", „Interview-Split"). Kein UI-Toggle, keine Automatik — allein der Prompt entscheidet.

## Warum diese Lösung
- Sauberste UX: kein zusätzlicher Schalter, keine Erklärungsfläche.
- Kein Modus-Switching-Risiko: der Kunde bekommt was er schreibt.
- Deckt den v272-Bug (ungewollte Grids) sauber ab und lässt Grid als bewusstes Stilmittel offen.
- Konsistent mit unserer „Prompt = Wahrheit"-Linie aus Plan v266/v270.

## Umfang der Änderungen

### 1) Grid-Intent-Detector (neu, server-seitig)
Neue kleine Helper-Datei, die aus dem Scene-/Briefing-Prompt erkennt, ob Grid gewünscht ist. Erkannte Signale (DE/EN, case-insensitive, Wortgrenzen):

- `grid`, `2x2`, `2 x 2`, `four-panel`, `vier panels`, `panels`, `split[- ]?screen`, `split view`, `kachel`, `tiles`, `collage`, `mosaic`, `mosaik`, `interview split`, `zoom[- ]?call`, `videocall grid`, `brady bunch`

Rückgabe: `{ gridRequested: boolean, gridStyle?: '2x2' | 'split' | 'collage' }`.

### 2) `compose-scene-anchor` verzweigt sauber
Im Multi-Sprecher-Zweig (N≥2):

- **Wenn `gridRequested = false` (Default):** aktuelle v272-Härtung bleibt aktiv — `SINGLE_FRAME_SUFFIX`, Anti-Grid-/Anti-Collage-/Anti-Split-Klauseln, „ONE continuous photograph".
- **Wenn `gridRequested = true`:** Anti-Grid-Klauseln werden entfernt und durch eine positive Grid-Direktive ersetzt („Compose as a clean N-panel grid, equal tiles, thin neutral divider, each speaker centered in their own tile, sharp focus on each face"). `EXACT_COUNT_SUFFIX` bleibt (Headcount-Lock).

### 3) `compose-video-clips` reicht Intent durch
- Detector auch hier aufrufen (Fallback, falls anchor direkt gecacht).
- `gridRequested` in den Anchor-Payload und in die Master-Plate-Prompts propagieren, damit Video-Modell nicht gegen den Anchor arbeitet.
- Face-Gate/Framing-Regeln: bei `gridRequested = true` das 12%-Min-Face-Size-Invariant lockern (Grid-Kacheln haben ohnehin große Gesichter) und die Focus-Plate-Sequenz überspringen — im Grid ist jede Kachel bereits ein Speaker-Focus.

### 4) Cache-Invalidierung
- `ANCHOR_AUDIT_VERSION` 14 → 15 in `compose-video-clips`, damit alte Anchors ohne Intent-Klassifikation neu komponiert werden.

### 5) Keine UI-Änderungen
Composer, Briefing-UI und Scene-Card bekommen **keinen** Grid-Toggle. Wenn ein Kunde Grid will, schreibt er es ins Szenen-Prompt/Briefing — der Detector greift automatisch.

## Nicht im Umfang
- Kein UI-Schalter, keine Preset-Buttons.
- Keine Änderung an Single-Speaker-Anchors (Nano Banana 2 bleibt).
- Keine Änderung an Sync.so / Lip-Sync-Pipeline.
- Keine Preis- oder Credit-Änderungen.

## Technische Details

**Neue Datei:** `supabase/functions/_shared/detectGridIntent.ts`
```ts
export function detectGridIntent(text: string): { gridRequested: boolean; gridStyle?: '2x2'|'split'|'collage' }
```

**Geänderte Dateien:**
- `supabase/functions/compose-scene-anchor/index.ts` — Verzweigung Single-Frame vs. Grid im N≥2-Zweig.
- `supabase/functions/compose-video-clips/index.ts` — Intent-Erkennung, Payload-Propagation, `ANCHOR_AUDIT_VERSION` 14→15, Face-Gate-Lockerung bei Grid.

**Signal-Quelle für Detector:** Scene-Prompt + Briefing-Text (falls verfügbar) — beides zusammenkonkateniert prüfen.

## Verifikation
1. Test-Szene ohne Grid-Keyword → Single-Frame (Büro-Szene, alle 4 in einem Raum).
2. Test-Szene mit „als 2x2 Grid" im Prompt → sauberes 4-Panel-Grid, jede Kachel = ein Sprecher.
3. Edge-Function-Logs prüfen: `gridRequested`-Flag wird korrekt geloggt.
4. Bestehende fehlgeschlagene Szene (`d2aa4ad5…`) rerendern und bestätigen, dass Single-Frame kommt.
