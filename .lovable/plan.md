# Fix der 6 Payload-Fehler im Live Sweep

## Diagnose

Der Sweep selbst läuft korrekt, aber **6 von 12 Provider-Payloads im Orchestrator** verwenden falsche Parameternamen für die echten Edge Functions. Es sind **keine echten Provider-Bugs** — die echten Studios funktionieren mit ihren eigenen UIs einwandfrei.

| Provider | Fehler | Ursache |
|---|---|---|
| FLUX Schnell | `Invalid tier. Use fast, pro, or ultra.` | Sweep sendet `model: "flux-schnell"` statt `tier: "fast"` |
| Hedra Talking Head | `imageUrl is required` | Sweep sendet `image_url` statt `imageUrl` (camelCase) |
| Runway Aleph | `Unknown model: undefined` | Sweep sendet `video_url` statt `model: "runway-gen4-aleph"` + `referenceVideoUrl` |
| Veo 3 (Google) | `Invalid model` | Sweep sendet kein `model` — braucht `model: "veo-3.1-fast"` |
| Pika 2.2 Std | `Unknown Pika model: undefined` | Sweep sendet kein `model` — braucht `model: "pika-2-2-standard"` + `startImageUrl` |
| Vidu Q2 | `Unknown Vidu model: undefined` | Sweep sendet kein `model` — braucht `model: "vidu-q2-reference"` + `referenceImages` |

Die 6 erfolgreichen Provider (Kling, Luma, Wan, Seedance, Hailuo, Stable Audio) haben zufällig "lockere" Schemas und akzeptieren die generischen Felder.

## Fix (1 Datei)

In `supabase/functions/qa-live-sweep/index.ts` die `buildPayload`-Funktionen für die 6 fehlgeschlagenen Provider auf die korrekten Schemas umstellen:

```ts
// FLUX Schnell
buildPayload: () => ({ prompt: "...", tier: "fast", aspectRatio: "1:1", style: "realistic" })

// Hedra (camelCase!)
buildPayload: ({ image, audio }) => ({ imageUrl: image, audioUrl: audio, aspectRatio: "16:9", resolution: "720p" })

// Runway Aleph
buildPayload: ({ video }) => ({ prompt: "...", model: "runway-gen4-aleph", duration: 5, aspectRatio: "16:9", referenceVideoUrl: video })

// Veo 3
buildPayload: () => ({ prompt: "...", model: "veo-3.1-fast", duration: 4, aspectRatio: "16:9" })

// Pika 2.2 Std
buildPayload: ({ image }) => ({ prompt: "...", model: "pika-2-2-standard", duration: 5, aspectRatio: "16:9", startImageUrl: image })

// Vidu Q2 (Reference2V braucht referenceImages-Array)
buildPayload: ({ image }) => ({ prompt: "...", model: "vidu-q2-reference", aspectRatio: "16:9", referenceImages: [image], referenceRoles: ["character"] })
```

## Bonus: Auto-Resolve alter Bug-Reports

Die 6 Failures haben automatisch `qa_bug_reports` erzeugt — das sind aber Sweep-interne Payload-Bugs, keine echten Produktbugs. Nach dem Fix werden sie beim nächsten grünen Sweep liegen bleiben. Optional als kleinen Cleanup: ein einmaliger SQL-Update setzt diese 6 Reports auf `resolved` mit Note "fixed in sweep payload v2".

## Erwartung nach dem Fix

- Nächster Sweep-Run sollte **12/12 grün** liefern
- Restliches Budget reicht locker (~17 € verbleibend, geschätzte Kosten für 2. Run ~8 €)
- Falls einzelne Provider trotzdem fehlschlagen, sind das dann **echte** Produktbugs und landen korrekt im Bug Inbox

## Was nicht angefasst wird

- Keine Änderung an den Provider-Edge-Functions selbst (die sind korrekt)
- Keine DB-Migration
- Keine UI-Änderung
- Kein neuer Deploy nötig außer `qa-live-sweep`
