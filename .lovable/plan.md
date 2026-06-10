# Fix: Lip-Sync bricht sofort ab (Welle-A Regression)

## Symptom
Jede neue Dialog-Szene meldet binnen Sekunden `Fehler · Lip-Sync abgebrochen`.

## Root Cause (verifiziert)
Edge-Function-Logs von `compose-twoshot-audio` (15:44–15:47 UTC):

```
worker boot error: Uncaught SyntaxError:
Identifier 'cursorSamples' has already been declared
at compose-twoshot-audio/index.ts:692:9
```

DB-Spur: `composer_scenes.clip_error = "twoshot_audio_prep_failed: Failed to send a request to the Edge Function"` — der Client kann die Function nicht aufrufen, weil sie nicht bootet.

Ursache: Beim Welle-A Refactor (TTS parallelisieren mit Semaphore) wurde der bestehende `cursorSamples`-Block nicht entfernt, sondern ein zweiter daneben eingeführt → Top-Level-Duplikat-Deklaration → Worker-Boot scheitert.

## Fix (1 Datei)
`supabase/functions/compose-twoshot-audio/index.ts`
- Datei rund um Zeile 692 lesen, beide `cursorSamples`-Deklarationen identifizieren.
- Die alte serielle Variante entfernen; nur die neue parallele Variante (Concurrency=2) behalten.
- Sicherstellen, dass alle Folge-Referenzen (Audio-Slice-Offsets, Mux-Cursor) weiterhin die korrekte, reihenfolge-stabile `cursorSamples`-Liste lesen.

## Verifikation
1. `compose-twoshot-audio` neu deployen.
2. Edge-Function-Logs prüfen → kein `worker boot error` mehr.
3. Im Composer eine bestehende Dialog-Szene über **"Sauber neu starten"** retriggern.
4. DB-Check: `composer_scenes.lip_sync_status` läuft `pending → dispatched → success` durch, kein `twoshot_audio_prep_failed`.

## Out of Scope
Welle B (parallele Sync.so-Passes) bleibt unangetastet — wird erst nach grünem Welle-A-Verify angefasst.
