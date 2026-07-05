# Provider-Duration-Audit — Composer an Toolkit-Ground-Truth angleichen

## Ausgangslage

Der Toolkit (`AI_VIDEO_TOOLKIT_MODELS` in `src/config/aiVideoModelRegistry.ts`) ist die Ground-Truth: seine `durations`-Arrays entsprechen exakt dem, was die Provider-Edge-Functions gegen Replicate erfolgreich rendern (DB bestätigt für Kling 15s, Luma 9s, Seedance 12s alle mit `status: completed`). Der Composer-Layer (`PROVIDER_CAPS` in `src/lib/video-composer/providerCapabilities.ts` + Snap-Guards in `supabase/functions/compose-video-clips/index.ts`) schränkt zwei Provider künstlich stärker ein.

## Audit-Tabelle (Toolkit = ✅ akzeptiert von Replicate)

| Provider     | Edge-Function          | Toolkit-Ground-Truth       | Composer `PROVIDER_CAPS`     | Backend-Snap in `compose-video-clips`      | Status         |
|--------------|------------------------|----------------------------|------------------------------|--------------------------------------------|----------------|
| **kling**    | `generate-kling-video` (kein Clamp, Replicate akzeptiert frei) | `[3, 5, 8, 10, 15]`        | `[5, 10]` ⚠️                 | `snapDuration(…, [5, 10])` (Z. 2537) ⚠️    | **Zu eng**     |
| **seedance** | `generate-seedance-video` (`Math.min(duration, 12)` Z. 171)   | `[5, 8, 10, 12]`           | `[5, 10]` ⚠️                 | `snapDuration(…, [5, 10])` (Z. 2746) ⚠️    | **Zu eng**     |
| veo          | `generate-veo-video` (`[4,6,8]` Whitelist Z. 101) | `[4, 6, 8]`                | `[4, 6, 8]` ✅                | `snapDuration(…, [4, 6, 8])` (Z. 2853) ✅   | ✅ konsistent   |
| grok         | `generate-grok-video`  | `[6, 12]`                  | `[6, 12]` ✅                  | keine Kling-Sync-Route derzeit             | ✅ konsistent   |
| ltx          | `generate-ltx-video`   | `[4, 6, 8]`                | **fehlt** ⚠️                 | keine Composer-Route ⚠️                    | Composer-Support fehlt |
| wan          | `generate-wan-video`   | `[5, 10]`                  | `[5, 10]` ✅                  | `snapDuration(…, [5, 10])` (Z. 2695) ✅     | ✅ konsistent   |
| hailuo       | `generate-hailuo-video`| `[6, 10]`                  | `[6, 10]` ✅                  | fix 6/10-Auswahl (Z. 2505) ✅               | ✅ konsistent   |
| luma         | `generate-luma-video`  | `[5, 9]`                   | `[5, 9]` ✅                   | `snapDuration(…, [5, 9])` (Z. 2799) ✅      | ✅ konsistent   |
| runway       | `generate-runway-video`| `[5, 10]`                  | `[5, 10]` ✅                  | (V2V-Path)                                 | ✅ konsistent   |
| pika         | `generate-pika-video`  | `[5, 10]` (Wartung)        | `[5, 10]` ✅                  | Migration → hailuo (Z. 1247)               | ✅ konsistent   |
| vidu         | `generate-vidu-video`  | `[5]`                      | `[5]` ✅                      | (Multi-Ref-Path)                           | ✅ konsistent   |
| happyhorse   | `generate-happyhorse-video` | `[3, 5, 8, 10, 12, 15]` | Free-Range 3–15 ✅            | delegiert an Edge-Function                 | ✅ konsistent   |
| sora         | (OpenAI Sunset 2026)   | (entfernt)                 | `[4, 8, 12]` (Legacy)        | Auto-Migration → veo (Z. 1231)              | ✅ Migration ok |

## Root Cause der Composer-Beschränkung

Kling und Seedance wurden im Composer bewusst auf `[5, 10]` gesnappt, weil die frühere Cinematic-Sync/Sync.so-Pipeline (v128/v129) Timing-Drift bei „ungeraden" Master-Plate-Längen hatte. Seit v183/v184 arbeitet `compose-dialog-segments` provider-agnostisch (siehe expliziter Kommentar Z. 1261-1271 in `compose-video-clips`: „SILENT MIGRATION REMOVED … dialog-segments pipeline is provider-agnostic"). Die Beschränkung ist damit obsolet — die reale Constraint sitzt nur noch beim Provider selbst.

## Fix — 3 Dateien, keine DB-Migration

### 1. `src/lib/video-composer/providerCapabilities.ts`

Kling und Seedance an Toolkit angleichen; LTX ergänzen; alles andere bleibt:

```ts
'ai-kling':    { durations: [3, 5, 8, 10, 15], lipsync: true,  multiSpeaker: false, label: 'Kling' },
'ai-seedance': { durations: [5, 8, 10, 12],    lipsync: true,  multiSpeaker: false, label: 'Seedance' },
'ai-ltx':      { durations: [4, 6, 8],         lipsync: false, multiSpeaker: false, label: 'LTX' }, // neu
```

Rest (Hailuo, Veo, Wan, Luma, Grok, Sora, Pika, Runway, Vidu, Kling-Omni, HappyHorse) unverändert.

### 2. `supabase/functions/compose-video-clips/index.ts` — Snap-Buckets weiten

- Z. ~2537 (Kling-Branch): `snapDuration(scene.durationSeconds, [5, 10])` → `snapDuration(scene.durationSeconds, [3, 5, 8, 10, 15])`
- Z. ~2746 (Seedance-Branch): `snapDuration(scene.durationSeconds, [5, 10])` → `snapDuration(scene.durationSeconds, [5, 8, 10, 12])`
- Alle anderen Snap-Aufrufe bleiben unverändert (Wan/Luma/Veo/Hailuo bereits konsistent).

Ergebnis: eine Kling-Szene mit 15s im Composer rendert **wirklich 15s** statt still auf 10s zu kürzen, exakt wie im Toolkit.

### 3. `src/config/klingVideoCredits.ts` — Toolkit-Range wiederherstellen

Nach dem vorherigen Fix wurde `KLING_VIDEO_MODELS` auf `min 5 / max 10 / allowed [5, 10]` gedrosselt. Das war überzogen, weil die Toolkit-Studio-Route diese Werte teilt und dort tatsächlich 3–15s laufen. Zurück auf:

```ts
'kling-3-standard': { …, minDuration: 3, maxDuration: 15, allowedDurations: [3, 5, 8, 10, 15] },
'kling-3-pro':      { …, minDuration: 3, maxDuration: 15, allowedDurations: [3, 5, 8, 10, 15] },
```

### 4. (bereits im vorherigen Plan) `SceneCard.tsx` — Provider-aware Duration-Picker

Der im letzten Plan skizzierte generische Button-Row-Picker greift diese neuen Buckets automatisch. Kling zeigt dann **[3s] [5s] [8s] [10s] [15s]** statt einer 5/10-2-Button-Row — matched Toolkit 1:1.

### 5. `SceneCard.tsx`+`useComposerPersistence.ts` — Auto-Snap beim Provider-Wechsel & Load

Bleibt wie vorher geplant: bei Provider-Wechsel und beim initialen Laden `snapDurationToProvider()` anwenden, damit alte Rows automatisch auf gültige Buckets fallen (z. B. eine alte 7s-Seedance-Szene → 8s statt 5s nach dem Widening).

## Was NICHT geändert wird

- **Toolkit-Registry** (`aiVideoModelRegistry.ts`) — ist die Ground-Truth, bleibt unangetastet.
- **Provider-Edge-Functions** (`generate-*-video`) — Replicate-Aufrufe funktionieren bereits, keine Änderung nötig.
- **Backend-Snap für Veo / Wan / Luma / Hailuo** — bereits deckungsgleich mit Toolkit.
- **HappyHorse Free-Range-Slider** — bleibt (Provider unterstützt echt jede Sekunde 3–15).
- **Sync.so Lipsync-Path** — provider-agnostisch, keine Sonderregelung nötig (v183/v184-Kommentar bestätigt).
- **DB-Migration** — nicht nötig. Alte gespeicherte 15s-Kling-Szenen werden beim Load-Time-Snap automatisch respektiert (15 ist jetzt gültig), alte 7s-Seedance-Szenen snappen client-seitig auf 8s beim ersten Öffnen.
- **Credit-/Refund-Logik** — cost = `durationSeconds × costPerSecond`, bleibt korrekt.

## Verifikation

- Kling-Szene im Composer öffnen: 5-Button-Row `[3s] [5s] [8s] [10s] [15s]`, 15s wählbar ohne Warnbanner.
- Kling-15s-Szene rendern: Backend-Log `Kling scene requested 15s → snapped to 15s`, Replicate-Response mit korrekter Länge.
- Seedance auf 12s stellen: 4-Button-Row `[5s] [8s] [10s] [12s]`, keine Warnung, Backend rendert 12s.
- Provider-Wechsel Kling(15s) → Wan: Duration snappt automatisch auf 10s (nächster ≤15 in `[5,10]`).
- Alte 7s-Seedance-Szene laden: erscheint sofort als 8s (Load-Time-Snap).
- HappyHorse-Szene: Free-Range-Slider bleibt.

## Aufwand

- 3 Config-Edits (`providerCapabilities.ts`, `klingVideoCredits.ts`, `compose-video-clips/index.ts`)
- 2 UI-Edits (`SceneCard.tsx` Picker + `useComposerPersistence.ts` Load-Snap) — bereits im vorigen Plan enthalten, hier nur konsistent gehalten
- 1 Edge-Function-Deployment (`compose-video-clips`)
- Keine DB-Migration, keine neuen Deps, kein Refund-Code-Touch, keine Auswirkung auf v183/v184-Face-Map-Pipeline.
