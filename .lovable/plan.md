## Ziel

Die Multi-Speaker-Lip-Sync-Pipeline wieder auf den professionellen Zustand bringen:

- Jeder Sprecher bewegt nur seinen eigenen Mund in seinem eigenen Dialogfenster.
- Kein einzelner Sprecher darf den gesamten Dialog visuell übernehmen.
- Das Ergebnis darf nicht wie ein eingefrorenes Foto wirken.
- Die Lösung soll sich an Sync.so orientieren: klares Target Face / klares Audio-Segment / saubere Timeline-Compositing-Logik, keine Workaround-Kaskade.

## Diagnose

Die letzten Änderungen haben zwei Regressionen ausgelöst:

1. **Statischer Anchor als Master**
   - v72 nutzt bei Multi-Speaker-Szenen ein Standbild als Master-Plate.
   - Dadurch bleiben zwar alle vier Personen sichtbar, aber die Szene verliert natürliche Bewegung und wirkt wie Photoshop.

2. **Hold-to-End Overlays**
   - v74 hält pro Sprecher ein Overlay bis Szenenende.
   - Dadurch kann ein zuletzt/oben liegender Sprecher visuell den restlichen Dialog dominieren.
   - Besonders gefährlich, wenn `sourceTiming`/`startFrom` nicht exakt zum Sync.so-Output passt.

## Plan

### 1. Regressionspfad entfernen

In `render-sync-segments-audio-mux/index.ts`:

- Static-Master als Default entfernen.
- `masterImageUrl` nicht mehr für normale Multi-Speaker-Lip-Sync-Muxes setzen.
- `holdToEnd: true` nicht mehr für Multi-Speaker-Pässe setzen.
- Zurück zu bewegtem Master-Video als Basisebene.

Damit verschwinden:

- der starre Standbild-Look,
- der „ein Sprecher spricht alles“-Effekt,
- die neue Overlay-Dauer bis Szenenende.

### 2. Sync.so-konforme Sprecherfenster wiederherstellen

Für jeden erfolgreichen Sync.so-Pass werden wieder nur die echten Sprecher-Zeitfenster gerendert:

- `startSec = segment.startTime - pad`
- `endSec = segment.endTime + pad`
- `sourceTiming='relative'` bei tight/preclip outputs
- `sourceTiming='absolute'` bei szenenlangen Sync.so outputs

In `DialogStitchVideo.tsx`:

- Cropped overlays bekommen ebenfalls korrektes `startFrom`, nicht nur FaceMask/FullFrame.
- Für absolute Sync.so-Ausgaben muss das Video an der absoluten Timeline starten.
- Für relative Preclips startet es bei Frame 0 innerhalb des Segmentfensters.

### 3. Animorph ohne Hold-to-End lösen

Der Animorph-Effekt wird nicht mehr durch „Overlay bis Ende halten“ gelöst, sondern durch kurze, professionelle Segmentübergänge:

- Fade-out nur über 2–3 Frames statt 6 Frames.
- Optional: Segment-Ende minimal später setzen, damit der Mund in geschlossenem Zustand endet.
- Kein Crossfade über lange sichtbare Gesichtsunterschiede.

Damit bleibt der Sprecher nur während seines Parts aktiv, aber der Übergang wirkt nicht morphend.

### 4. Drift-Problem sauber absichern statt Standbild-Fallback

Der ursprüngliche Grund für v72 war: bewegter i2v-Master kann bei 4 Personen auf eine Einzelperson driften.

Diesen Fall lösen wir nicht mehr durch ein Standbild als Master, sondern durch einen Guard:

- Multi-Speaker-Szenen behalten den bewegten Master.
- Wenn der Master später Speaker verliert, darf nicht stillschweigend ein schlechter finaler Clip entstehen.
- Bestehende Face-/Human-Count-Gates bleiben maßgeblich.
- Wenn nötig wird der Master-Clip als fehlerhaft klassifiziert und neu generiert/refundet, statt einen Standbild-Clip zu verstecken.

### 5. Bestehende fertige Szene nicht automatisch überschreiben

Code-Fix betrifft neue und neu gemuxte Szenen.

Für die aktuell kaputte Szene kann danach gezielt ein Re-Mux ausgelöst werden, sobald der Fix implementiert ist. Dabei bleibt die teure Sync.so-Arbeit erhalten; nur die finale Remotion-Komposition wird neu erstellt.

## Technische Änderungen

Betroffene Dateien:

- `supabase/functions/render-sync-segments-audio-mux/index.ts`
- `src/remotion/templates/DialogStitchVideo.tsx`
- `.lovable/plan.md` / Memory nur zur Dokumentation der Regression und neuen Regel

Konkrete Regeln nach dem Fix:

```text
Multi-speaker default:
  master = moving source_clip_url
  overlays = per speaker segment windows only
  holdToEnd = false
  masterImageUrl = disabled for normal mux

Relative tight preclip:
  Sequence starts at speaker segment
  Video starts at frame 0

Absolute full-scene Sync.so output:
  Sequence starts at speaker segment
  Video startFrom = segment startFrame
```

## Verifikation

Nach Implementierung prüfen:

- Edge payload log zeigt wieder mehrere segment-window shots, nicht `shots=N speakers hold-to-end`.
- Jeder Sprecher bewegt nur in seinem eigenen Zeitfenster den Mund.
- Die Basisszene hat wieder natürliche Bewegung statt statischem Foto.
- Merged audio bleibt unverändert erhalten.
- Keine Änderung an Sync.so-Pricing, Refunds, Webhook, Credits oder Voiceover-Erzeugung.