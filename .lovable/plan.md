## Befund

Der aktuelle Abbruch ist nicht mehr primär der alte Webhook/Poller-Race. Der Backend-Status ist gesund, die Szene läuft bis in die Pipeline hinein, bricht dann aber an zwei Stellen ab:

1. **Shot 1 / Matthew wird fälschlich durch den Audio-VAD geblockt**
   - Log: `preflight_audio_no_voice: voiced=42%`
   - Tatsächlich ist `voicedRatio=0.424` deutlich über dem Grenzwert `0.15`.
   - Der Abbruch passiert wegen `longestVoicedRun=0.30s` bei aktuellem Mindestwert `0.40s`.
   - Das ist für kurze deutsche Antworten wie „Was denn?“ zu streng. Professionell darf so ein Short-Turn nicht als „kein Voice“ gelten.

2. **Shot 2 / Kailee wird weiterhin mit festen Koordinaten an Sync.so geschickt, obwohl der Preclip nur noch ein isolierter Sprecher-Clip ist**
   - Payload nutzt `active_speaker_detection: { auto_detect:false, coordinates:[711,367], frame_number:... }`.
   - Auf einem isolierten Per-Speaker-Preclip ist das falsch/unnötig: die Koordinaten stammen aus der Original-Wide-Plate und können im Preclip/Provider-Kontext instabil sein.
   - Sync.so antwortet 4× mit `An unknown error occurred.`.
   - Die professionelle „Artlist“-Variante ist: **Single-face Clip + Auto-Speaker**, nicht Wide-Plate-Koordinaten.

3. **sync-so-webhook hat noch alten Degrade-Code**
   - In `sync-so-webhook` gibt es noch den Pfad `degraded_to_master`, der Multi-Speaker-Failures als „ready ohne Output“ markiert.
   - Das widerspricht dem v16-Plan und kann 3-Sprecher-Szenen erneut in einen kaputten Endzustand bringen.

## Zielbild

Für 3+ Sprecher wird die Pipeline strikt so stabilisiert:

```text
Master-Plate
  -> pro Sprecher-Turn isolierter Preclip
  -> pro Preclip isolierte Turn-Audio-Datei
  -> Sync.so auto_detect auf Single-face-Clip
  -> am Ende deterministisches Stitching
```

Keine Wide-Plate-Koordinaten mehr für Preclips. Keine Master-Degrade-Fallbacks bei 3+ Sprechern. Kurze echte Sätze werden nicht mehr vom VAD geblockt.

## Umsetzung

### 1. Preclip-Dispatch auf Auto-Speaker umstellen

In `poll-dialog-shots`:

- Wenn `usePreclip === true`, wird Sync.so ohne feste `coordinates` und ohne `frame_number` aufgerufen.
- Für Preclips setzen wir den Dispatch-Modus effektiv auf `auto`, weil der Clip nur eine relevante Person enthalten soll.
- Feste Koordinaten bleiben nur für den Legacy-Master-Pfad aktiv.

Technisch:

- `dispatchModeForShot` bzw. die Payload-Erzeugung wird so angepasst, dass `active_speaker_detection` bei Preclip-Quelle entweder `{ auto_detect: true }` ist oder ganz weggelassen wird, je nachdem was die vorhandene `dispatchSyncJob`-Struktur sauber unterstützt.
- Logging bekommt ein klares Feld wie `mode=auto_preclip`, damit spätere Fehler eindeutig sichtbar sind.

### 2. VAD-Regel für sehr kurze Turns korrigieren

In `poll-dialog-shots`:

- Der harte Mindestwert `MIN_LONGEST_VOICED_RUN_SEC=0.4` wird nicht mehr pauschal auf alle Sätze angewendet.
- Neue Regel:
  - Wenn `voicedRatio >= 0.35`, gilt der Turn als echte Sprache, auch wenn der längste zusammenhängende Voice-Run nur 0.25–0.30s ist.
  - Für wirklich leere/silent Audio bleibt der Block aktiv.
- Dadurch wird „Was denn?“ nicht mehr blockiert, aber Stille/kaputte Audio-Dateien werden weiterhin abgefangen.

### 3. `sync-so-webhook` Multi-Speaker-Degrade entfernen

In `sync-so-webhook`:

- Der v4-Webhook-Pfad darf bei Multi-Speaker-Szenen nicht mehr `ready + degraded + output_url undefined` setzen.
- Wenn die Retry-Matrix erschöpft ist:
  - Für 3+ Sprecher: Shot terminal `failed`, kein Degrade.
  - Für 1 Sprecher bleibt der alte sichere Degrade erlaubt.
- Zusätzlich wird die gleiche Preclip-Auto-Regel in `prepareRetryFromWebhook` gespiegelt: 3+ Sprecher mit Preclip bleiben auf Preclip und werden nicht in Koordinaten-/Master-Fallen gezwungen.

### 4. Konkrete fehlgeschlagene Szene zurücksetzen

Per Migration/Datensatz-Recovery:

- Szene `6936d98e-efe6-4f44-a4e5-f87a0c30cea8` zurück von `failed` auf `running`.
- `refunded=false`, `clip_error=null`, `twoshot_stage=null`.
- Shot 0 bleibt `ready`, weil er bereits ein gültiges Sync.so-Output hat.
- Shot 1 wird auf `pending` gesetzt, behält `preclip_url`, `audio_url`, `render_window`, aber verliert Retry-/Fehlerfelder.
- Shot 2 wird auf `pending` gesetzt, behält `preclip_url`, verliert alte Sync.so-Job-/Fehler-/Retry-Felder.
- Beide werden danach mit der neuen Preclip-Auto-Logik erneut verarbeitet.

### 5. Validierung nach Umsetzung

Nach dem Fix prüfe ich:

- `poll-dialog-shots` Logs zeigen für Shot 1 keinen VAD-Block mehr.
- Sync.so Dispatch für Shot 2 enthält bei Preclip **keine Wide-Plate-Koordinaten** mehr.
- `dialog_shots.shots[*].sync_source_kind` bleibt bei 3 Sprechern `preclip`.
- Kein neuer `degraded_to_master`-Eintrag für 3+ Sprecher.
- Szene wechselt am Ende entweder sauber auf `done` mit `final_url` oder zeigt einen echten providerseitigen Fehler ohne falschen Fallback.

## Dateien

- `supabase/functions/poll-dialog-shots/index.ts`
- `supabase/functions/sync-so-webhook/index.ts`
- neue Recovery-Migration für Szene `6936d98e-efe6-4f44-a4e5-f87a0c30cea8`
- `mem/architecture/lipsync/sync-so-webhook-stage5` für die v17-Regel: Preclip = Auto-Speaker, Koordinaten nur Master-Legacy

## Erwartetes Ergebnis

Die letzte 3-Sprecher-Pipeline arbeitet danach wie ein professioneller Anbieter: isolierter Sprecher-Clip, isolierte Audio, Auto-Speaker-Erkennung, kein Wide-Plate-Koordinaten-Fallback und keine falschen VAD-Abbrüche bei kurzen Sätzen.