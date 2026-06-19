
# Strukturelle Aufräumung der ASD-Pipeline (v130)

## Problem heute

`compose-dialog-segments/index.ts` baut die `active_speaker_detection` (ASD) in **drei** unkoordinierten Schritten:

1. **Block A** (Z. 3470–3698) — eine ca. 230-Zeilen `if/else if`-Kette mit v124, v129.1, v129.24, v129.25, v129.26, v129.27, v129.29 Pfaden, die initial ASD setzt (oft `auto_detect: true`).
2. **Block B** (Z. 3700–3855) — Multi-Speaker / bbox-url Pfade überschreiben Teile davon.
3. **Block C — Face-Gate Snap** (Z. 4441–4564, v129.30) — *nach* dem Payload-Build erkennt Gemini Vision, dass die Coord nicht ins Gesicht zeigt, und **mutiert** `syncOptions` + `payload.options` nachträglich.

Folgen:
- v124 Sanitizer kann den Snap stillschweigend strippen, wenn `auto_detect: true` noch drin steht (genau der gerade gefixte Bug).
- "Snap erkannt aber nicht angewandt"-UI-Warnungen, weil zwei Wahrheitsquellen existieren.
- Jeder neue Edge-Case (z. B. Snap-Coord liegt selbst nicht im Face) erzwingt einen weiteren Versions-Patch.
- Forensik-Log und tatsächlicher Outbound-Payload können auseinanderlaufen.

## Zielarchitektur

Eine einzige, deterministische Funktion bestimmt ASD **vor** dem Payload-Build aus drei klar getrennten Inputs:

```text
┌─────────────────┐   ┌────────────────────┐   ┌──────────────────┐
│ Preflight Face  │   │ Pass Geometrie     │   │ Retry Variant    │
│ (Gemini Vision: │   │ (preclip dims,     │   │ (auto / coords / │
│  found + coord  │   │  crop, plate dims, │   │  bbox-url /      │
│  + frame)       │   │  speakers.length)  │   │  expanded-crop)  │
└────────┬────────┘   └─────────┬──────────┘   └────────┬─────────┘
         │                      │                       │
         └──────────┬───────────┴───────────────────────┘
                    ▼
        ┌──────────────────────────┐
        │  buildAsdStrategy()      │
        │  → { mode, asd, frame,   │
        │      space, source }     │
        └──────────┬───────────────┘
                   ▼
        ┌──────────────────────────┐
        │  Sync-3 Payload (final)  │
        │  → sanitize → dispatch   │
        └──────────────────────────┘
```

Regeln (Priorität von oben nach unten):

1. **Preflight Face vorhanden + im Bild** → `{ auto_detect: false, frame_number, coordinates: <preflight-coord> }` (doc-strict).
2. **Multi-Speaker mit bbox-url** (Retry `bbox-url`) → `{ auto_detect: false, bounding_boxes_url }`.
3. **Multi-Speaker mit Plate-Coords + Crop in-bounds** (Retry `coords-pro`) → doc-strict mit transformierten Preclip-Coords.
4. **Single-Face Preclip, kein Preflight nötig** → `{ auto_detect: true }` (sicherer Default für 1-Face Crops).
5. **Letzter Ausweg** (kein Face, Probe unavailable, Multi-Speaker ohne Coords) → `{ auto_detect: true }` mit explizitem `last_resort` Tag.

**Keine nachträgliche Mutation mehr.** Der Face-Gate (Z. 4441 ff.) wird zu einem reinen **Validator** — er bestätigt nur noch, dass die *bereits* gesetzte Coord ins Gesicht zeigt. Bei `ok_after_snap` blockiert er und löst einen Retry mit Variant `preflight-snap` aus, statt heimlich umzuschreiben.

## Umsetzung

### 1) Neue Helper-Datei `_shared/asd-strategy.ts`

Exportiert:

```ts
export type AsdStrategy = {
  mode:
    | "preflight_coord"        // Regel 1
    | "bbox_url"               // Regel 2
    | "preclip_coord_strict"   // Regel 3
    | "single_face_auto"       // Regel 4
    | "last_resort_auto";      // Regel 5
  asd: SyncSoAsd;              // exakt das was Sync.so bekommt
  frameNumber: number | null;
  coordSpace: "plate" | "preclip" | "none";
  source: "preflight" | "pass" | "retry" | "default";
  diagnostics: Record<string, unknown>; // für syncso_dispatch_log
};

export function buildAsdStrategy(input: {
  preflight: { faceFound: boolean; coord?: [number,number]; frame?: number } | null;
  pass: PassRecord;             // mit preclip_*, plate_*, coords, crop
  retryVariant: string | null;
  isMultiSpeaker: boolean;
  usePreclip: boolean;
}): AsdStrategy;
```

Die Funktion ist **pure** (keine DB-Zugriffe, keine Mutations), testbar, und ersetzt die 230-Zeilen `if/else if`-Kette komplett.

### 2) Preflight als primäre Quelle nutzen

Der Face-Gate Probe (`verifyFaceBeforeDispatch` in `_shared/syncso-face-gate.ts`) wird in **zwei** Aufrufe gespalten:

- **`probeFaceForPlanning(...)`** — neuer Helper, läuft **vor** `buildAsdStrategy`. Liefert ehrliches `{ faceFound, coord, frame }` oder `null` bei Probe-Unavailable.
- **`validateAsdBeforeDispatch(...)`** — der bisherige `verifyFaceBeforeDispatch` ohne Snap-Mutation-Logik. Liefert nur noch `ok / blocked / probe_unavailable`. Wenn er `not_at_coord` meldet, fail mit Refund und Webhook-Retry-Hint `preflight-snap` (statt im selben Aufruf umzuschreiben).

### 3) `compose-dialog-segments/index.ts` umbauen

- **Löschen**: Block A (Z. 3470–3698) und Block C Snap-Mutation (Z. 4487–4564).
- **Ersetzen** durch:
  ```ts
  const preflight = await probeFaceForPlanning({ ... });
  const strategy = buildAsdStrategy({
    preflight, pass, retryVariant, isMultiSpeaker, usePreclip: usePassPreclip,
  });
  syncOptions.active_speaker_detection = strategy.asd;
  asdMode = strategy.mode;
  (pass as any)._asd_diagnostics = strategy.diagnostics;
  ```
- **Behalten**: v124 Sanitizer (Z. 156, Z. 4270) bleibt als Defense-in-Depth.
- **Validator-Aufruf** (Z. 4441) ruft jetzt `validateAsdBeforeDispatch` mit dem **bereits final gesetzten** Coord auf. Wenn er `ok_after_snap` zurückgibt, ist das ein Bug in `buildAsdStrategy` — log + refund + retry, niemals stillschweigend patchen.

### 4) Retry-Variant `preflight-snap`

Neuer Variant-Wert, den der Lipsync-Watchdog setzt, wenn der Validator `not_at_coord` mit verfügbarer Snap-Coord meldet. Beim nächsten Run nutzt `buildAsdStrategy` Regel 1 mit der gespeicherten Snap-Coord. So bleibt der Pfad deterministisch und im Dispatch-Log nachvollziehbar.

### 5) Forensik & UI

- `syncso_dispatch_log.meta.asd_strategy` enthält `{ mode, source, coordSpace, diagnostics }`.
- UI-Komponente, die heute "Snap erkannt aber nicht angewandt" anzeigt, wird auf `strategy.source === "preflight"` umgestellt — Grün wenn Preflight die Coord lieferte, Gelb bei `single_face_auto`, Rot bei `last_resort_auto`.

### 6) Aufräumen / Memory

- `mem://architecture/lipsync/sync-3-only-dialog-pipeline.md` aktualisieren auf v130 (Single-Source ASD-Builder).
- `mem://architecture/lipsync/sync-3-doc-strict-options-v106` Eintrag erweitern um Verweis auf neuen Strategy-Builder.
- Veraltete Versions-Kommentare (v115, v119, v124, v125, v129.1, v129.24-30) in der gelöschten Block-A-Sektion entfallen automatisch.

### 7) Testing

- Deno-Tests für `buildAsdStrategy` mit Fixtures pro Regel (5 Pfade × Multi/Single × Retry-Variants).
- E2E: zuletzt fehlgeschlagene Szene `21eed4c2-9abf-44ed-bba3-ed2dc63e35e6` re-dispatchen, im Log prüfen dass `asd_strategy.mode === "preflight_coord"` und Sync.so 200 OK.

## Was bewusst NICHT geändert wird

- v124 Sanitizer (bleibt als zweite Verteidigungslinie).
- bbox-url / expanded-crop Eskalationsladder im Webhook.
- Audio-Preflight, Face-Gate JPEG-Cache, Refund-Logik.
- Frontend des Director's Cut Studio (nur die ASD-Status-Pille wird umverdrahtet).

## Risiko & Migration

- Single Edge Function (`compose-dialog-segments`) — Deploy ist atomar.
- Bei Regression sofortiger Rollback auf v129.30 möglich (Git-Revert der drei Files).
- Bestehende `pending`/`generating` Passes laufen unverändert weiter, weil der Strategy-Builder identische Payloads erzeugt wie die heute *intendierten* Pfade — nur deterministischer.

## Geschätzter Aufwand

- ~250 Zeilen löschen, ~180 Zeilen neuer Strategy-Builder + Tests, ~40 Zeilen Validator-Slim-Down.
- Ein Deploy von `compose-dialog-segments`, eine Memory-Aktualisierung.
