## Ziel

Zwei dokumentationswidrige Bugs in der Lip-Sync-Pipeline beseitigen, die in der DB- und Sync.so-Forensik klar als Ursache der `An unknown error occurred`-Failures identifiziert wurden. Keine Architekturänderung, kein Modellwechsel, kein neues Feature.

## Bug 1 — `segments_secs` aus dem Sync.so-Payload entfernen

**Problem (verifiziert per Sync.so GET):**
```json
"input": [
  { "url": "...plate.mp4", "type": "video", "segments_secs": [[3.81, 7.082]] },
  { "url": "...audio.wav", "type": "audio" }
]
```
`segments_secs` ist in keiner Sync.so-Doku-Seite dokumentiert (Segments Guide, Speaker Selection, Modell-Seiten lipsync-2 / lipsync-2-pro / sync-3). Für sync-3 widerspricht es zusätzlich der dokumentierten Architektur ("builds a global understanding across the entire shot, generating all frames at once").

**Fix in `supabase/functions/compose-dialog-segments/index.ts`** (Stelle: Zeile 1942–1945):

- `videoInput.segments_secs = speakerWindowsSecs` komplett entfernen.
- Bei mehreren Sprechern verlassen wir uns ausschließlich auf die bereits aktive `audio_tight`-Slicing-Logik (v39) plus `sync_mode: "cut_off"`. Das ist die dokumentierte Variante.
- Falls `audio_tight` fehlschlägt, fallen wir nicht mehr stillschweigend auf `segments_secs` zurück, sondern markieren den Pass als `prepare_failed_no_tight_audio`, refunden und brechen sauber ab (kein blinder Doku-Verstoß mehr).

## Bug 2 — Silent-Audio-Gate vor jedem Sync.so-Dispatch

**Problem (verifiziert per DB):** In mehreren `sync3-coords`-Failed-Passes war `audio_repair.peak_dbfs = 0`, d. h. die hochgeladene WAV-Datei war komplett stumm. Sync.so hat trotzdem den Job angenommen und nach ~20 s mit `An unknown error occurred` quittiert. Beispiel-Passes:

| Scene | Speaker | peak_dbfs |
|---|---|---|
| 10fd0f82 | Matthew | 0 |
| 4e7a0601 | Kailee | 0 |
| 64b2ae86 | Matthew, Kailee | 0 |
| 61edb887 | Samuel | 0 |

**Fix in `supabase/functions/compose-dialog-segments/index.ts`**:

- Direkt vor `fetch(SYNC_API_BASE/generate)` neue Vorab-Prüfung:
  - Wenn der Pass `audio_repair.peak_dbfs <= -50` ODER `peak_dbfs === 0` ODER `peak_dbfs === null` UND `audio_tight` nicht vorhanden → Dispatch abbrechen.
  - Pass-Status `failed`, `last_error = "speaker_audio_silent_or_invalid"`, `last_error_class = "input_audio_silent"`.
  - Triggert den existierenden idempotenten Refund-Pfad, der bei `failed`-Passes mit nicht-`refunded` State greift.
- Logzeile: `scene=… pass=… SILENT_AUDIO_GATE peak_dbfs=… url=…` für saubere Forensik.

Sekundärer Fix im Audio-Producer `supabase/functions/compose-twoshot-audio/index.ts` (sofern dort die Repair-WAV erzeugt wird): warnen statt schweigend hochladen, wenn das Resultat `peak_dbfs <= -50` hat. Damit verschiebt sich das Problem aus der Sync.so-Phase nach vorne und ist beim Auftreten sofort lokalisierbar.

## Was bewusst NICHT geändert wird

- Kein Modellwechsel (lipsync-2-pro bleibt Default, sync3-coords bleibt Retry-Variante wie heute in v37).
- Kein Wechsel zu Single-Call-Segments.
- Keine Reaktivierung des Face-Crop-Preclip-Pfads.
- Keine Änderungen an `render-sync-segments-audio-mux`, `sync-so-webhook`, `poll-dialog-shots`.
- Keine Schema-Migrations, keine neuen Versions-Gates.

## Test

1. Eine Szene mit 3 Sprechern frisch dispatchen (z. B. via Reset des bestehenden 3-Sprecher-Testfalls).
2. In Edge-Logs nach `SILENT_AUDIO_GATE` und `segments_secs` suchen — letzteres darf nicht mehr im Payload auftauchen.
3. Sync.so-GET auf die generierten Job-IDs (über die in `dialog_shots.passes[].job_id` gespeicherten IDs) prüfen: `input[0]` darf nur `url` und `type` enthalten.
4. Erwartung: deutlich höhere Done-Rate; verbleibende Fehler haben einen klaren Code (`speaker_audio_silent_or_invalid`) statt `provider_unknown_error`.
5. Wenn Done-Rate nicht mindestens das Niveau der `coords-pro`-Variante (historisch 8/9) erreicht, klares Signal, dass weitere Maßnahmen (z. B. Face-Crop oder sync-3-Default) nötig sind — die dann auf sauberer Datenbasis getroffen werden können.

## Memory-Update nach Implementierung

Eine kurze Memory-Notiz unter `mem://architecture/lipsync/v53-doc-compliance-fixes` mit den zwei Regeln:

- Sync.so-Payload darf kein undokumentiertes `segments_secs` enthalten.
- Vor jedem Sync.so-Dispatch muss ein Silent-Audio-Gate greifen (`peak_dbfs > -50`).

## Geschätzter Umfang

- 1 Datei chirurgisch geändert (`compose-dialog-segments`), ~30–50 Zeilen.
- Optional 1 Warnlog in `compose-twoshot-audio`, ~5 Zeilen.
- Keine DB-Migration. Kein Frontend-Change.