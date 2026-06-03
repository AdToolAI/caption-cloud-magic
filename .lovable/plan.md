## Diagnose

Ja — wir konnten den aktuellen Failure deutlich genauer isolieren.

**Betroffene Szene:** `bd60c826-a5d3-4857-a22a-aa7cfd7d6f6e`

**Was passiert ist:**
- Pass 1, Samuel, `coords-pro` → erfolgreich.
- Pass 2, Matthew, `coords-pro` → fehlgeschlagen.
- Pass 3, Kailee, `coords-pro` → ebenfalls fehlgeschlagen.
- Sync.so sendet im Webhook weiterhin nur:
  - `error: "An unknown error occurred."`
  - **kein** `error_code`

**Wichtig:** Die neue Diagnose liest `error` und `error_code` korrekt. In diesem konkreten Sync.so-Payload existiert aber tatsächlich kein `error_code`. Dadurch steht in unserem State weiter `sync_error_code: null`.

## Exakter Befund

Der Fehler ist kein allgemeiner UI-Fehler und kein fehlender Parser mehr. Der Live-Failure hängt an dieser Kombination:

```text
3 Sprecher
+ coords-pro / manual active_speaker_detection
+ einzelne Sprecher-WAVs mit langer Stille vor dem Sprachbeginn
+ Sync.so lipsync-2-pro
= Sync.so gibt generischen Provider-Fehler ohne error_code zurück
```

Aus den gespeicherten Dispatch-Diagnosen für Matthew:

```text
audio_dur_sec: 9.0
leadInSec: 2.746s
voicedSec: 0.52s
coords: [639, 220]
frame_number: 76
variant: coords-pro
Sync.so result: FAILED, error_code: null
```

Damit ist die wahrscheinlichste technische Ursache: **Sync.so scheitert bei per-speaker Full-Length-WAVs, wenn die Stimme erst mehrere Sekunden nach t=0 beginnt und gleichzeitig manuelles Face-Targeting auf einer 3-Personen-Plate aktiv ist.**

## Zusätzlich gefundene Schwachstellen in unserem Code

1. **GET-Fallback wird zu selten ausgelöst**
   - Aktuell fragen wir Sync.so per GET nur nach, wenn gar keine Fehlermeldung vorhanden ist.
   - Hier ist aber eine generische Fehlermeldung vorhanden: `An unknown error occurred.`
   - Deshalb wurde der GET-Fallback nicht ausgeführt, obwohl genau dieser Fall dafür relevant ist.

2. **3+-Sprecher-Fallback blockiert den Retry sofort**
   - Bei 3+ Speakern blockieren wir `coords-pro → auto-pro`, um Face-Swaps zu vermeiden.
   - Das ist grundsätzlich richtig, führt hier aber dazu, dass Matthew/Kailee nach einem einzigen generischen Provider-Failure direkt als endgültig fehlgeschlagen behandelt werden.

3. **Failed-Pass-State bleibt inkonsistent**
   - Die Szene wird oben als `failed` markiert, aber einzelne Passes bleiben in `rendering` stehen.
   - Das erschwert Diagnose, UI und Watchdog-Recovery.

## Plan zur Behebung

### 1. GET-Fallback auch bei generischem Sync.so-Fehler erzwingen

In `sync-so-webhook`:
- Wenn `status=FAILED` und `error` exakt/ähnlich `An unknown error occurred.` ist, trotzdem `GET /v2/generate/{job_id}` ausführen.
- Falls GET weiterhin keinen `error_code` liefert, speichern wir explizit:
  - `sync_error_code: null`
  - `sync_error_bucket: provider_unknown_no_code`
  - `sync_error_explain: Sync.so returned only a generic provider failure`

### 2. Provider-Unknown bei 3+ Speakern nicht mehr über Auto-Fallback lösen

Statt bei 3+ Speakern `auto-pro` zu versuchen oder sofort zu failen:
- `provider_unknown_error` + `coords-pro` + `speakerCount >= 3` wird als **input-shape issue** behandelt.
- Nächster Retry bleibt `coords-pro`, aber mit repariertem Audio.
- Kein `auto_detect: true`, damit keine Sprecher-/Face-Swaps entstehen.

### 3. Per-speaker Audio vor Sync.so trimmen oder reparieren

In `compose-dialog-segments`:
- Für jeden Pass wird nicht mehr das 9s Full-Length-WAV mit langer Stille geschickt.
- Stattdessen erzeugen wir eine provider-freundliche Audio-Version:
  - Stimme beginnt bei t≈0.
  - Minimaler Lead-in ca. 0.15–0.25s.
  - WAV bleibt PCM 16-bit.
  - Original Timing wird im späteren Fan-in/Compositor weiter berücksichtigt.

Das adressiert genau den Live-Befund: Matthew hat nur 0.52s Sprache, aber 2.746s Stille vor dem Einsatz.

### 4. Pass-State korrekt patchen

Bei endgültigem Failure:
- Den betroffenen Pass explizit auf `failed` setzen.
- `last_error`, `sync_error_code`, `sync_error_bucket`, `finished_at` direkt am Pass speichern.
- Nicht betroffene laufende/pending Passes entweder sauber abbrechen oder als `canceled_by_scene_failure` markieren.

### 5. UI-Diagnose klarer machen

Wenn Sync.so keinen Code liefert, soll die UI nicht nur `An unknown error occurred` zeigen, sondern:

```text
Sync.so hat keinen error_code geliefert.
Wahrscheinliche Ursache: 3-Sprecher-Plate + lange Stille vor Sprecher-Audio + Face-Targeting.
Audio-Reparatur/Trim-Retry wird verwendet.
```

## Erwartetes Ergebnis

Nach Umsetzung wird der nächste 3-Sprecher-Lip-Sync nicht mehr nach dem ersten generischen Sync.so-Fehler abbrechen. Stattdessen wird:

1. der echte GET-Fallback versucht,
2. bei weiterhin fehlendem `error_code` die bekannte `provider_unknown_no_code`-Klasse gespeichert,
3. der betroffene Sprecher mit getrimmtem/repariertem Audio erneut als `coords-pro` gestartet,
4. der State konsistent bleiben, falls Sync.so trotzdem endgültig scheitert.