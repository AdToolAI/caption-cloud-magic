## Diagnose (verifiziert an den Edge-Logs)

Der Klick auf **„Clip generieren mit Voiceover"** in `SceneDialogStudio.tsx` bricht in der VO-Phase ab, **bevor** `compose-video-clips` überhaupt aufgerufen wird:

- `generate-voiceover` hat um 08:40:55 UTC einen `503` zurückgegeben mit `sb_error_code: SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED`, Execution-Zeit 11 ms → **transiente Supabase-Edge-Runtime-Störung**, kein Bug in unserem Code.
- Direkt davor + danach lieferte dieselbe Funktion `200`.
- `compose-video-clips` taucht in den letzten 6 h **gar nicht** in den Logs auf → der Fehler-Toast „Edge Function returned a non-2xx status code" kommt aus dem VO-Loop (`SceneDialogStudio.tsx` Zeile 1549), nicht aus der neuen v262-Anchor-Pipeline.

Aktuell wirft ein einziger 503 aus dem VO-Loop den kompletten Multi-Speaker-Clip weg — der User muss den ganzen Take neu starten, obwohl schon fertige VOs im State liegen.

## Fix (Frontend-only, Presentation-Layer)

Nur `src/components/video-composer/SceneDialogStudio.tsx` anfassen — keine Backend- oder Pipeline-Änderungen.

1. **Kleiner Retry-Helper** direkt in der Datei: `invokeVoiceoverWithRetry(fnName, body)` — bis zu 3 Versuche, exponentielles Backoff (600 ms → 1500 ms → 3000 ms + Jitter), **nur** retrien wenn:
   - `error.context?.status` in `{502, 503, 504}`, **oder**
   - Response-Header/Body enthält `SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED` / `WORKER_LIMIT` / `BOOT_ERROR`, **oder**
   - Netzwerk-Fehler (kein `context`, `TypeError: Failed to fetch`).
   - Bei allen anderen Fehlern (400/401/402/422 …) sofort weiterreichen — kein blindes Retry.
2. **Beide Aufruf-Stellen** ersetzen (der VO-Loop existiert an zwei Orten, Zeilen 1097 und 1549) — sonst ist der Fix nur zur Hälfte drin.
3. **Toast-Text schärfen** für den Fall, dass auch alle Retries scheitern: „Voiceover-Service kurzzeitig nicht erreichbar (SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED). Bitte in ~30 s erneut auf „Clip generieren mit Voiceover" klicken." — statt der generischen „non-2xx"-Meldung. Die schon existierende Take-Cache-Logik (`getActiveTake`) sorgt dafür, dass bereits erzeugte VOs bei einem manuellen Retry nicht neu abgerechnet werden.
4. **Kein** Retry auf `compose-video-clips` selbst — dessen Aufruf ist idempotenzkritisch (Credits, Pipeline-State).

## Verifikation

- `tsgo` auf den geänderten Datei-Pfad — nur Presentation-Code, keine Schema-Änderung.
- Manueller Sanity-Check im Preview: „Clip generieren mit Voiceover" auf einer Multi-Speaker-Szene klicken. Bei einem echten 503 sollte im Console-Log `[SceneDialogStudio] VO retry 1/3 after 503` erscheinen und der Flow durchlaufen.
- Kein neuer Toast bei Retry-Erfolg — nur bei endgültigem Scheitern.

## Technische Details

- Keine Änderungen an `compose-video-clips`, `compose-scene-anchor`, `_shared/anchor-min-face-size.ts` oder irgendeiner v262-Datei.
- Keine neuen Dependencies.
- Retry-Helper bleibt lokal in `SceneDialogStudio.tsx` (kleines Utility, kein neues Modul nötig — passt zum bestehenden Muster in dieser Datei).
