## Diagnose

Do I know what the issue is? Yes.

Die betroffene Szene `34757e6a-e919-45fe-98e9-2484a8cf652d` ist nicht wegen Audio-Mux fehlgeschlagen, sondern bereits im Sync.so-Pass für **Samuel Dusatko**:

- `clip_status`: ready
- `lip_sync_status`: failed
- Fehler: `multi_speaker_incomplete_3_of_4`
- 3 von 4 Sprecher-Pässen wurden erfolgreich gerendert.
- Pass 1 / Samuel ist zweimal mit Sync.so `provider_unknown_error` fehlgeschlagen.

Der konkrete Root Cause im Code:

- Samuel sitzt links am Bildrand (`x≈306` bei 1376px Breite).
- Der Code aktiviert für Edge-Speaker den `skipPreclipForEdgeSpeaker`-Pfad.
- Dadurch wird **kein Single-Face-Preclip** gerendert, sondern die volle 4-Personen-Plate an Sync.so geschickt:
  - erster Versuch: `bbox-url-pro` auf Full-Plate
  - zweiter Versuch: `coords-pro` auf Full-Plate
- Genau diese Full-Plate-Pfade liefern bei dieser Szene `provider_unknown_error`.
- Die anderen Sprecher liefen über Single-Face-Preclips und kamen durch.

Damit widersprechen sich zwei Schutzlogiken im aktuellen Code:

```text
v88: Edge-Speaker sollen Preclip überspringen und Full-Plate bbox-url-pro nutzen.
v107: Multi-Speaker müssen über Single-Face-Preclip laufen, sonst falsche Gesichter/Morphing.
Live-Ergebnis: Edge-Speaker-Full-Plate bricht ab, 3/4 fertig, Szene failed.
```

## Plan

### 1. Edge-Speaker-Pfad korrigieren

In `supabase/functions/compose-dialog-segments/index.ts` entferne ich den automatischen Full-Plate-Bypass für Edge-Speaker als Standardverhalten.

Neues Verhalten:

- Auch Edge-Speaker bekommen zuerst einen Single-Face-Preclip.
- `bbox-url-pro` auf Full-Plate wird nur noch als expliziter letzter Fallback genutzt, nicht als Default.
- Wenn der Preclip wegen Rand-Crop zu klein/leer ist, wird der Crop repariert statt direkt auf Full-Plate zu wechseln.

### 2. Preclip-Crop für Randgesichter robuster machen

In `supabase/functions/_shared/pass-face-preclip.ts` bzw. im Call-Site-Setup:

- Für Randgesichter den Crop nicht kleiner gegen den Rand quetschen.
- Mindestgröße bleibt ≥720p Output.
- Wenn das Gesicht nah am Rand liegt, Crop zentriert so weit wie möglich und mit größerem Expansion-Faktor rendern.
- Ziel: Genau ein Gesicht im Preclip, aber genug Kopf/Mund sichtbar.

### 3. Retry-Logik für `provider_unknown_error` ändern

In `supabase/functions/sync-so-webhook/index.ts`:

- Wenn ein Full-Plate-`bbox-url-pro`/`coords-pro`-Pass mit `provider_unknown_error` fehlschlägt, retry nicht wieder Full-Plate.
- Stattdessen Retry erzwingen mit:
  - frischem Single-Face-Preclip
  - `sync-3`
  - `auto_detect: true`
  - `sync_mode: cut_off`
- Für 3+ Sprecher bleibt `auto-*` auf Full-Plate blockiert.

### 4. Teilfertige 3/4-Szenen sauber recovern

Wenn 3 von 4 Pässen erfolgreich sind und ein Pass failed:

- Nur den fehlgeschlagenen Pass zurück auf `pending` setzen.
- Erfolgreiche Pass-Outputs behalten.
- Den erneuten Render auf den fehlgeschlagenen Sprecher beschränken.
- Erst wenn alle 4 done sind, Audio-Mux starten.

### 5. Aktuelle Szene zurücksetzbar machen

Für die aktuelle Szene wird beim Fix eine Recovery-Aktion vorgesehen:

- Samuel-Pass zurücksetzen: `status=pending`, `job_id/output_url/error` löschen.
- vorhandene Matthew/Kailee/Sarah-Pässe behalten.
- Szene zurück auf `lip_sync_status=running` oder `pending` setzen.
- Danach startet nur Samuel neu mit dem korrigierten Preclip-Pfad.

### 6. Dokumentation / Memory aktualisieren

Eine neue Memory-Regel ergänzen:

- Multi-Speaker: Single-Face-Preclip ist Standard auch für Edge-Speaker.
- Full-Plate `bbox-url-pro` ist nur letzter Fallback.
- Keine Rückkehr zu Full-Plate-Default für Randgesichter, weil das live `provider_unknown_error` und 3/4-Partial-Fails erzeugt.

## Validierung

Nach Umsetzung prüfe ich:

- Edge-Function-Logs zeigen für Samuel `dispatch_video_kind: preclip` statt `full_plate`.
- Sync.so Payload für Samuel ist doc-strict:
  - `model: sync-3`
  - `options.sync_mode: cut_off`
  - `active_speaker_detection.auto_detect: true`
  - keine `temperature`, keine `occlusion_detection_enabled`
- Szene erreicht nicht mehr `multi_speaker_incomplete_3_of_4`.
- Alle 4 Passes werden `done`, danach startet `render-sync-segments-audio-mux`.

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>