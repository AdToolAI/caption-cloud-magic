## Diagnose (bestätigt durch Screenshot)

Im Storyboard rechts: Szene 1 = `10s hailuo` (€1.68), Szene 2+3 = `5s happyhorse`.
Du wolltest HappyHorse mit 7s. Was wirklich passiert:

```text
UI: HappyHorse + 7s + Dialog
     │
     ▼
compose-video-clips Zeile 1094:
"if (clipSource === 'ai-happyhorse' && cast >= 2 || dialog_mode)
   → migrate to ai-hailuo"   ← SILENT SWITCH (der Bug)
     │
     ▼
Hailuo akzeptiert nur 6s | 10s
     │
     ▼
Duration wird auf 10s gesnappt
     │
     ▼
DB & UI zeigen jetzt: "10s hailuo" statt "7s happyhorse"
```

Der Code-Kommentar von damals: *„HappyHorse zeigt Identity-Drift in Multi-Cast"*. Aber: du nutzt **1 Sprecher**, und HappyHorse hat in deinen aktuellen Szenen (5s) sauber funktioniert. Die Migration ist also überprotektiv.

## Fix

### 1. Silent-Migration entfernen — `compose-video-clips/index.ts` Zeile 1060–1108
- HappyHorse bleibt HappyHorse, egal wie viele Sprecher
- Pipeline (`compose-dialog-segments`) ist bereits provider-agnostisch — frisst jede MP4 (Code-Kommentar Z.897 sagt wörtlich „Hailuo/HappyHorse i2v")
- Logging bleibt, aber kein `update clip_source` mehr

### 2. Provider-Capability-Map — `src/lib/video-composer/providerCapabilities.ts` (neu)
```ts
export const PROVIDER_CAPS = {
  "ai-hailuo":     { durations: [6, 10],                       lipsync: true  },
  "ai-happyhorse": { durations: [3,4,5,6,7,8,9,10,11,12,13,14,15], lipsync: true },
  // alle anderen: lipsync: false
};
```
Single source of truth für UI + Backend-Guard.

### 3. SceneDialogStudio.tsx — Duration-Picker provider-aware
- Hailuo-Mode: **2 Buttons** „6s" | „10s" (kein Slider, ehrlich)
- HappyHorse-Mode: Slider 3–15s in 1s-Schritten
- Provider-Wechsel mit ungültiger Duration → auto-snap auf nächstgültigen Wert + Toast „Duration auf 10s angepasst (Hailuo unterstützt nur 6s oder 10s)"
- Entfernt: den blinden Snap-Code auf 6/10 sobald Dialog aktiv

### 4. Backend-Duration-Guard — `compose-video-clips/index.ts`
- Hailuo + Dauer ≠ 6/10 → **400** mit klarer Message statt Silent-Snap
- HappyHorse + Dauer < 3 oder > 15 → **400**
- Verhindert künftige UI/Backend-Drift

### 5. SceneCard.tsx — Provider-Picker mit Lipsync-Badge
- Hailuo + HappyHorse: Badge „Lipsync ✓"
- Andere 8 Provider bei `dialog_mode === true`: ausgegraut + Tooltip „Kein Lipsync"

## Was bewusst NICHT angefasst wird

- `compose-dialog-segments` — battle-tested v24 Pipeline, akzeptiert beide Plates bereits
- Sync.so-Payload — unverändert
- Multi-Speaker-Logik — HappyHorse darf jetzt mehrere Sprecher, wenn das in deiner Praxis fehlschlägt sehen wir's klar im Log (kein Silent-Switch mehr, der den Fehler maskiert)

## Risiko

Falls HappyHorse + 4-Sprecher-Plates tatsächlich Identity-Drift haben (wie das Memory dokumentiert) → Sync.so wirft `face_probe_unavailable` und Credits werden idempotent refundiert (bestehender Mechanismus). Du siehst dann den **echten** Fehler statt einer kosmetischen Hailuo-Conversion. Falls das in deinen Tests passiert: einfach Single-Speaker-Constraint für HappyHorse ergänzen (kleiner Follow-up).

## Dateien

- **Edit:** `supabase/functions/compose-video-clips/index.ts` (Z.1060–1108 + neuer Duration-Guard)
- **Edit:** `src/components/composer/SceneDialogStudio.tsx` (Duration-Picker)
- **Edit:** `src/components/composer/SceneCard.tsx` (Lipsync-Badge)
- **Edit:** `src/lib/video-composer/validateSceneForCinematicSync.ts` (provider-aware)
- **Neu:**  `src/lib/video-composer/providerCapabilities.ts`

## Aufwand

~1.5–2h. Danach: 1 Test-Szene HappyHorse + 7s + 1 Sprecher → muss als `7s happyhorse` durchlaufen.
