# v129.21.1 — MediaPipe Env-Variable Hotfix

## Root Cause (bestätigt aus Logs)

Edge-Function-Log von `compose-dialog-segments` für die fehlgeschlagene Szene:

```
[plate-face-detect] scene=a15d732a-... mediapipe PRIMARY miss (no_replicate_token) — falling back to gemini
```

MediaPipe ist korrekt verdrahtet (Detection-Code, Cache, Multi-Frame-Union, Fallback-Chain — alles aus v129.21 läuft). Aber das Modul liest die falsche Umgebungsvariable:

- `face-detect-mediapipe.ts` liest `Deno.env.get("REPLICATE_API_TOKEN")` → **existiert nicht**
- Im Projekt heißt der Secret aber `REPLICATE_API_KEY` (bestätigt via secrets-Liste)

Ergebnis: MediaPipe failt sofort mit `no_replicate_token` → Gemini-Fallback läuft (mit den bekannten 10–20% Drift-Problemen) → Pre-Dispatch-Gate findet Intent-Koord außerhalb der Gemini-Bbox → Crop-Bug wird vor Versand blockiert. Genau das, was die Forensik zeigt: "detector: mediapipe → gemini fallback" + "Preclip nicht dispatcht".

Fazit: MediaPipe hat in Produktion noch kein einziges Mal echt gelaufen. Die ~19%→~4% Failure-Rate-Verbesserung kann erst jetzt greifen.

## Fix (minimal, ein Modul)

In `supabase/functions/_shared/face-detect-mediapipe.ts`:

- Token-Read auf beide Varianten erweitern (Reihenfolge wie überall sonst im Repo):
  ```ts
  const REPLICATE_TOKEN =
    Deno.env.get("REPLICATE_API_KEY") ??
    Deno.env.get("REPLICATE_API_TOKEN") ??
    "";
  ```
- Alle Stellen, die bisher `REPLICATE_API_TOKEN` verwenden (Client-Init + Guard), auf `REPLICATE_TOKEN` umstellen.
- Fehler-Tag bleibt `no_replicate_token` (Forensik-Kompatibilität), Log-Nachricht ergänzt um "checked REPLICATE_API_KEY + REPLICATE_API_TOKEN" damit so ein Mismatch nicht nochmal 24h kostet.

## Nicht im Scope

- Keine Änderung an Detection-Logik, Multi-Frame-Union, Cache, Fallback-Chain, Pre-Dispatch-Gate, UI/Forensics-Sheet.
- Keine Änderung an anderen Replicate-nutzenden Edge-Functions (`extract-video-frames`, `normalize-master-clip` etc.) — die liefen offenbar bisher okay; wenn sie still fehlen, separater Sweep.

## Verification

1. Deploy `compose-dialog-segments`, `validate-frame-face` (beide importieren das Shared-Modul → Bundle-Refresh nötig).
2. Re-Dispatch der gleichen Szene `a15d732a-...`.
3. Erwartete Log-Zeile:
   ```
   [plate-face-detect] scene=... mediapipe PRIMARY ok faces=N frames=3 ms=...
   ```
4. Forensics-Sheet sollte als `detector: mediapipe-3f` ausweisen (nicht mehr "mediapipe → gemini fallback").
5. Preclip läuft durch, Sync.so croppt korrekt auf das echte Gesicht.

## Files

- `supabase/functions/_shared/face-detect-mediapipe.ts` (4 Zeilen Diff)

Danach erst sehen wir, ob MediaPipe die versprochene Recall-Verbesserung wirklich liefert.
