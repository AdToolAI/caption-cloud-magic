## Befund

Der aktuelle Run ist technisch abgeschlossen, aber die visuelle Synchronität ist falsch. In den gespeicherten Daten sieht man den Kernfehler:

- Pass 1 animiert Matthew nur in seinem Fenster `2.572–3.408s`.
- Pass 2 animiert Samuel in `0–2.322s` und `3.658–6.351s`.
- Pass 2 benutzt als Video-Input aber den Output aus Pass 1.
- Sync.so gibt für den finalen Output `outputDuration: 10.125s` zurück, während die Szene 8s ist.
- In Pass 2 wurden außerdem falsche/instabile Video-Dimensionen gespeichert (`768x768` statt Anchor `1376x768`). Das kann Target-Koordinaten verschieben.

Das erklärt beide sichtbaren Fehlerbilder:

1. **Vorher: Münder bewegen sich weiter** — Masterclip hatte bereits Mouth-Motion.
2. **Jetzt: Bauchredner-Effekt / kaum Lippenbewegung** — die Silent-Master-Strategie stoppt zwar falsche Mundbewegung, aber die aktuelle Two-Pass/Segments-Kette ist nicht robust genug: Segment-Outputs werden nicht korrekt als kompositorische Patches genutzt, Timing/Dauer driften, und der zweite Pass kann den ersten überschreiben bzw. außerhalb der Ziel-Fenster nicht sauber übernehmen.

## Ziel

Nicht weiter an Symptomen drehen, sondern die Pipeline so umbauen, dass Lip-Sync deterministisch wird:

```text
Dialogscript
  → sample-genauer merged WAV
  → neutraler Masterclip mit sichtbaren Gesichtern
  → pro Sprecher/Turn präziser Sync.so Patch
  → serverseitiges Stitching/Patching auf exakt Szenendauer
  → Preview/Export spielen genau diese Audiospur
```

## Plan

### 1. Two-Pass-Kette ersetzen durch Turn-Patch-Pipeline

Statt Pass 1 → Pass 2 sequenziell aufeinander zu legen, wird jeder Sprecher-Turn als eigener Patch behandelt:

- Samuel Turn 1: `0–2.322s`
- Matthew Turn: `2.572–3.408s`
- Samuel Turn 2: `3.658–6.351s`

Jeder Turn bekommt:

- denselben neutralen Masterclip als Basis,
- denselben merged WAV als Audio-Source,
- genau ein `segments_secs` Fenster,
- exakt die Face-Koordinate des sprechenden Charakters.

Damit kann ein Sprecher nicht mehr außerhalb seines Fensters weiterreden und ein späterer Pass überschreibt nicht mehr unkontrolliert frühere Bereiche.

### 2. Segment-Output statt Full-Output bevorzugen

Sync.so liefert bei Segment-Jobs zusätzlich `segmentOutputUrl`. Genau dieser Output ist für Patch-Flows relevanter als der komplette `outputUrl`.

Ich werde die Poller-Logik so ändern, dass pro Turn gespeichert wird:

- `segmentOutputUrl` wenn vorhanden,
- sonst `outputUrl` als Fallback,
- exakte `startSec/endSec`, `speaker`, `character_id`, `targetCoords`.

### 3. Serverseitiges Patch-Stitching einführen

Nach Abschluss aller Turn-Jobs wird eine neue backend function die finalen Clips zusammensetzen:

- Masterclip ist die Basis.
- Für jedes Turn-Fenster wird der passende Sync.so-Segmentclip nur in diesem Zeitbereich eingesetzt.
- Außerhalb der Turn-Fenster bleibt der neutrale Master unverändert.
- Finale Dauer wird hart auf `scene.duration_seconds` bzw. `audio_plan.twoshot.totalSec` getrimmt.
- Audio wird nicht aus den Sync.so-MP4s übernommen, sondern ausschließlich aus `audio_plan.twoshot.url` gemuxed.

Das ist der entscheidende Fix für „sync genau“ und gegen Störgeräusche/Doppel-Audio.

### 4. Masterclip wirklich lip-ready machen

Den Silent-Master-Prompt lasse ich nicht als „starr geschlossene Lippen“ stehen, weil das zu Bauchredner-Eindruck führen kann. Stattdessen:

- neutrales, natürliches Gesicht,
- entspannte geschlossene/leicht ruhende Lippen,
- kein Sprechen, kein Mouth-Flapping,
- genügend sichtbares Gesicht und Kieferbereich,
- keine extreme Kopfbewegung,
- keine Hände/Objekte vor dem Mund,
- stabile Front-/3⁄4-Komposition.

Zusätzlich: Wenn Face-Audit oder Mouth-Visibility-Audit fehlschlägt, wird vor Sync.so abgebrochen und automatisch refundet statt ein unbrauchbares Lip-Sync-Ergebnis zu erzeugen.

### 5. Timing-Audit vor Sync.so

Vor dem Rendern prüfe ich:

- alle Turn-Fenster sind innerhalb der Szene,
- keine Fenster überlappen,
- jedes Fenster hat Mindestdauer,
- merged WAV Dauer passt zur Szene,
- Speaker → Face Mapping ist vollständig identity-resolved,
- Video-Dimensionen bleiben konsistent mit Anchor/Source.

Wenn eine Prüfung fehlschlägt: klarer Fehlerstatus + Refund, kein halbfertiger Output.

### 6. Preview/Export bleibt single-source-of-truth

Die bestehende Regel bleibt richtig und wird gehärtet:

- finaler Lip-Sync-Clip ist stumm bzw. Video-Audio wird ignoriert,
- einzig hörbare Spur ist `audio_plan.twoshot.url`,
- Export muxed diese Spur sauber ein,
- kein embedded Last-Speaker-Audio aus Sync.so.

### 7. Aktuelle Szene sauber zurücksetzen

Die aktuell fehlerhafte Szene `b6c2402c-d62c-4b1c-a62d-d8ebca76a356` wird nach dem Code-Fix vollständig auf neuen Render gesetzt:

- finalen fehlerhaften Sync-Output entfernen,
- alten Masterclip als `lip_sync_source_clip_url` nur behalten, falls er den neuen Audits besteht,
- alte `syncJobs`/Heartbeat/Poller-Daten löschen,
- neuen Turn-Patch-Lip-Sync starten.

Falls der Masterclip beim Audit nicht lip-ready ist, wird automatisch ein neuer Masterclip erzeugt.

## Technische Änderungen

Betroffene Bereiche:

- `supabase/functions/compose-twoshot-lipsync/index.ts`
  - Turn-Jobs statt zwei Sprecher-Pässe starten.
  - Job-Metadaten auf `mode: turn_patches_v2` umstellen.
  - Timing-/Face-/Mouth-Visibility-Audit ergänzen.

- `supabase/functions/poll-twoshot-lipsync/index.ts`
  - Jobs nacheinander pollen/queuen.
  - `segmentOutputUrl` persistieren.
  - Nach letztem Turn den Stitcher aufrufen.
  - Erfolg erst setzen, wenn Stitching + Audio-Mux fertig ist.

- neue backend function, z.B. `stitch-twoshot-lipsync`
  - MP4-Patches framegenau zusammensetzen.
  - Finalvideo auf exakte Dauer trimmen.
  - externen merged WAV als einzige Audiospur muxen.
  - Ergebnis in `composer-clips` speichern.

- `supabase/functions/compose-video-clips/index.ts`
  - Silent-Master-Prompt von „zu starr“ auf „lip-ready neutral plate“ justieren.
  - Negative Prompt beibehalten, aber nicht so stark, dass Sync.so keine Mundregion mehr sauber animieren kann.

- Status-/Diagnose-Metadaten
  - `syncJobs.mode = turn_patches_v2`
  - pro Turn: `speaker`, `character_id`, `startSec`, `endSec`, `targetCoords`, `segmentOutputUrl`, `outputUrl`
  - final: `stitchedUrl`, `audioMuxed: true`, `durationLocked: true`

## Validierung

Nach der Umsetzung prüfe ich konkret:

- `syncJobs.jobs` enthält einen Job pro Sprecher-Turn.
- Kein Turn überschreitet sein Zeitfenster.
- Finalvideo hat exakt die erwartete Szenendauer.
- `clip_error` ist bei Erfolg leer.
- `audio_plan.twoshot.useExternalAudio` bleibt korrekt gesetzt.
- Die betroffene Szene wird nicht nur neu gepollt, sondern wirklich neu aus der V2-Pipeline erzeugt.

## Erwartetes Ergebnis

Die Charaktere bewegen ihre Lippen nur in ihren eigenen Sprecherfenstern. Außerhalb dieser Fenster bleiben sie natürlich ruhig. Audio, Mundbewegung, Szenendauer und Export liegen auf derselben Timeline, statt über mehrere providerseitige Full-Video-Passes zu driften.