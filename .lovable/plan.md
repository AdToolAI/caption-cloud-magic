## Befund

Nein, wir sind noch nicht ganz auf Artlist-Niveau. Wir haben den richtigen Ansatz, aber aktuell fehlen noch zwei Artlist-typische Sicherheitsstufen:

1. **Face-Lock ist nicht zuverlässig genug**
   - In der letzten Szene ist `lock_reference_url` leer.
   - Dadurch konnte Gemini keine beiden Gesichter erkennen (`faceMap: faces: 0`) und die Pipeline fiel auf grobe Heuristik zurück: links = 30%, rechts = 70%.
   - Wenn die Gesichter im echten Clip anders liegen, trifft ein Pass wieder nur einen Charakter oder denselben Charakter.

2. **Der finale Sync.so-Clip enthält technisch nur die Audiospur des letzten Passes**
   - Das ist bei Multi-Pass normal: Pass 1 rendert Sprecher A, Pass 2 rendert Sprecher B über den vorherigen Clip.
   - Die vollständige Tonspur liegt separat als gemischtes Two-Shot-WAV vor.
   - Preview/Export müssen deshalb den finalen MP4-Ton stumm schalten und immer die externe gemischte Two-Shot-Spur nutzen. In der Preview ist das größtenteils schon vorbereitet, beim Export gibt es aber noch eine Stelle, die Voiceover bei lip-synced Szenen rausfiltert.

## Plan

### 1. Face-Erkennung nicht mehr von `lock_reference_url` abhängig machen
- `compose-twoshot-lipsync` bekommt eine robuste Source-Kette:
  1. `lock_reference_url`
  2. falls leer: erstes Frame / Poster aus `lip_sync_source_clip_url` oder `clip_url`
  3. falls auch das scheitert: Heuristik als letzte Notlösung
- Die erkannte `faceMap` wird wieder in `audio_plan.twoshot.faceMap` gespeichert, damit Retries deterministisch bleiben.

### 2. Pass-Ziel nicht nur nach Pass-Index, sondern nach echter Charakterposition pinnen
- `character_shots` + erkannte Face-Positionen werden zusammengeführt.
- Pass 1/2 wird an die echte linke/rechte Face-Box gebunden, nicht nur an `[0.3W, 0.5H]` und `[0.7W, 0.5H]`.
- Wenn nur ein Gesicht erkannt wird, bricht die Pipeline mit verständlichem Fehler ab, statt erfolgreich einen falschen One-Face-Lip-Sync zu erzeugen.

### 3. Multi-Pass-Validierung einbauen
- Nach jedem Pass speichern wir `audio_plan.twoshot.heartbeat` mit:
  - Sprecher
  - Zielgesicht
  - Koordinaten
  - Quelle der Koordinaten (`gemini-frame`, `anchor`, `heuristic`)
- Zusätzlich wird geloggt, ob wirklich Pass 2 gestartet und beendet wurde.
- Wenn Pass 2 fehlt oder fehlschlägt, bleibt die Szene nicht als `done` stehen.

### 4. Audio-Muxing für Two-Shot final korrigieren
- In `compose-video-assemble` wird die bisherige Regel angepasst:
  - Normale lip-synced Szenen: separate Voiceover-Spur weiterhin nicht doppelt muxen.
  - Two-Shot mit `audio_plan.twoshot.useExternalAudio === true`: gemischte Two-Shot-WAV muss ausdrücklich als externe Szenen-Voiceover-Spur erhalten bleiben.
- Dadurch ist auch im finalen Export nicht nur die letzte Sync.so-Pass-Audiospur hörbar.

### 5. UI-Hinweis aktualisieren
- Der alte Hinweis in `ClipsTab`, dass Sync.so nur einen Charakter pro Clip könne, ist für unsere neue Two-Shot-Pipeline veraltet.
- Ich ersetze ihn durch einen realistischen Hinweis: Multi-Speaker funktioniert, aber nur mit erkanntem Two-Shot-Face-Lock.

## Technische Dateien

- `supabase/functions/compose-twoshot-lipsync/index.ts`
- `supabase/functions/compose-video-assemble/index.ts`
- `src/components/video-composer/ClipsTab.tsx`
- `mem/architecture/lipsync/sync-so-pro-model-policy`

## Ergebnis

Danach arbeitet die Pipeline näher an Artlist:

```text
Two-shot master clip
  -> Face detection from actual frame
  -> Pass A pinned to character A face
  -> Pass B pinned to character B face
  -> final video muted
  -> full merged dialogue WAV layered externally
```

Das behebt sowohl den visuellen Fall „nur ein Charakter lip-synced“ als auch den Audio-Fall „nur ein Voiceover ist hörbar“.