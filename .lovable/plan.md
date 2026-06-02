## Diagnose

Do I know what the issue is? Ja.

Der neue Fehler ist nicht mehr der alte `retryCount`-Crash. Es sind jetzt zwei konkrete 3-Sprecher-Probleme sichtbar:

1. **Aktuelle Szene `88fcd40d…` scheitert im ersten Sync.so-Pass**
   - Logs: `plate=probe-failed`, danach `syncso_segments_FAILED: An unknown error occurred.`
   - Die Dispatch-Diagnose zeigt: Pass 1 sendet `coordinates:[313,143]` bei `frame_number:26`.
   - Der Screenshot zeigt aber, dass im Hailuo-Plate die beiden männlichen Köpfe/ Gesichter oben aus dem Bild gecroppt sind. Sync.so kann an den Koordinaten deshalb kein Gesicht finden.

2. **Die MP4-Dimension-Probe ist noch nicht robust genug**
   - Phase A und Phase B liefern beide `nomoov`.
   - Grund: Die Tail-Range beginnt mitten in einer MP4-Box; der aktuelle Box-Walker startet nur bei Offset `0` und findet `tkhd` nicht, wenn der Tail-Buffer nicht an einer Box-Grenze startet.

3. **Die Face-Gate-Prüfung validiert aktuell nicht das Zielgesicht**
   - `compose-dialog-segments` ruft `validateFrameFace(... targetCoords: null)` auf.
   - Damit wird nur geprüft, ob irgendwo im Frame ein Gesicht sichtbar ist. Bei der aktuellen Szene ist die Frau sichtbar, also passiert der Gate, obwohl Sprecher 1/2 kein sichtbares Gesicht haben.

4. **Separater Alt-State `95f7e7a2…` hängt im Stitch-Loop**
   - `dialog_shots.shots` enthält `status=ready` für alle drei Turns, aber der dritte Turn ist `degraded:true` ohne `output_url`.
   - `poll-dialog-shots` versucht trotzdem zu stitchen; `render-dialog-stitch` lehnt korrekt mit `409 integrity_gate_failed` ab.

## Leitplanke

Die **1- und 2-Charakter-Erfolgspfade bleiben unberührt**:

- Keine Änderung an `compose-twoshot-lipsync`.
- Keine Änderung an der erfolgreichen 1-/2-Sprecher-Retry-Ladder.
- Neue harte Checks werden nur für `speakers >= 3` bzw. für kaputte alte Multi-Speaker-Degrade-States aktiviert.

## Implementierungsplan

### 1. MP4-Probe wirklich tail-sicher machen

Datei: `supabase/functions/_shared/twoshot-face-map.ts`

- `probeMp4Dims` behält Phase A/Phase B.
- Ergänzung: Wenn der strukturierte Box-Walker nichts findet, scannt ein sicherer Fallback im Buffer nach `tkhd`-Signaturen und liest Width/Height relativ zu dieser Position aus.
- Das ist derselbe robuste Ansatz, den die alte 2-Shot-Pipeline bereits nutzt.
- Log bleibt: `probe-result … phaseA=… phaseB=… dims=…`.

### 2. 3+ Speaker: Zielgesicht vor Sync.so validieren

Datei: `supabase/functions/compose-dialog-segments/index.ts`

- Nur wenn `speakers.length >= 3`:
  - Pro Pass die berechneten `pass.coords` in normalisierte Frame-Koordinaten umrechnen.
  - `validateFrameFace` mit diesen Zielkoordinaten aufrufen, nicht mehr mit `targetCoords:null`.
  - Wenn am Zielpunkt kein Gesicht matcht: **nicht** Sync.so aufrufen, sondern sauber abbrechen mit `clip_error=plate_target_face_missing_pass_X` und automatischer Credit-Rückerstattung.
- Damit wird der aktuelle Fall abgefangen: sichtbare Frau reicht nicht mehr, wenn Samuel/Matthew oben aus dem Plate gecroppt sind.

### 3. 3+ Speaker: falsche Plate-Crops nicht als Lip-Sync-Fehler behandeln

Datei: `supabase/functions/compose-dialog-segments/index.ts`

- Bei `plate_target_face_missing` wird die Szene nicht als Providerfehler geloggt, sondern als **Plate-/Crop-Problem**.
- UI-Hinweis bleibt über `clip_error` klarer: Szene/Clip neu rendern, nicht nur Lip-Sync blind erneut versuchen.
- Credits bleiben geschützt durch die bestehende Refund-Logik.

### 4. Legacy-Stitch-Loop für kaputte Multi-Speaker-Degrade-States stoppen

Datei: `supabase/functions/poll-dialog-shots/index.ts`

- Nur für Multi-Speaker-State:
  - `allReady` darf nur `true` sein, wenn jeder Shot `status='ready'` **und** `output_url` hat.
  - Ein `degraded:true` ohne `output_url` wird bei Multi-Speaker nicht mehr an `render-dialog-stitch` durchgereicht.
  - Statt 409-Endlosschleife: sauberer Terminal-Fehler + idempotenter Refund.
- Single-Speaker-Degrade bleibt unverändert erlaubt.

### 5. Recovery für die betroffenen Szenen

Migration/Data-Fix nach Codeänderung:

- `88fcd40d…`: zurück auf `pending`, `lip_sync_status=NULL`, `clip_error=NULL`, damit nach einem neuen Clip/Plate-Render erneut gestartet werden kann.
- `95f7e7a2…`: aus der Stitch-Endlosschleife holen; je nach aktuellem Zustand entweder sauber `failed` markieren oder zurück auf erneutes Lip-Sync, aber ohne 409-Loop.

### 6. Verifikation

Nach Implementierung prüfe ich:

- Logs zeigen für 3-Sprecher: `plate=<WxH>` statt `plate=probe-failed`, oder klarer `plate_target_face_missing` vor Sync.so.
- Szene `88fcd40d…` wird nicht mehr mit opakem Sync.so-Fehler verbrannt, wenn Gesichter fehlen.
- Szene `95f7e7a2…` erzeugt keine wiederholten `render-dialog-stitch 409` Logs mehr.
- 1-/2-Sprecher-Pfade wurden im Code nicht erweitert oder auf neue 3+ Gates umgebogen.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
  <presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>