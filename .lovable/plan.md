## Was ich gefunden habe

### 1. „Keine sichtbare Veränderung" – warum?
Der Button **funktioniert technisch** korrekt:
- `engineOverride: 'cinematic-sync'` + `clipSource: 'ai-hailuo'` werden gesetzt
- `compose-video-clips` umgeht den HeyGen-Branch (richtig) und startet Hailuo i2v auf der echten Storyboard-Szene
- Danach feuert `compose-lipsync-scene` automatisch (Sync.so)

Aber: Im UI bleibt der **alte HeyGen-Avatar-Clip sichtbar**, bis Hailuo fertig ist (~60–90 s) und dann nochmal, bis Sync.so fertig ist (~60 s). Der einzige Hinweis ist der kleine grüne Toast oben rechts. Der Nutzer denkt, nichts passiert.

### 2. „LipSync länger als Szene" – aktuell falsch gelöst
`compose-lipsync-scene` Zeile 156: wenn VO > Szene, wird `sync_mode: 'cut_off'` gesetzt → **Audio wird abgeschnitten**. Du willst das Gegenteil: **Szene verlängern, damit VO komplett reinpasst**.

### 3. Multi-Charakter-Flow – nein, so läuft es nicht
Sync.so kann nur **eine Audiospur** auf das ganze Video legen → würde EINEN Charakter den kompletten Multi-Speaker-Dialog sprechen lassen. Daher lehnt `compose-lipsync-scene` Multi-Speaker-Szenen heute mit HTTP 409 ab. Der Pattern, den du beschreibst (Speaker 2 auf Output von Szene 1+Speaker 1), funktioniert mit Sync.so **nicht zuverlässig** – Sync.so findet automatisch das prominenteste Gesicht und würde wahrscheinlich wieder Charakter 1 lip-syncen.

Die saubere Lösung: Multi-Speaker-Szenen werden in **Shot-Reverse-Shot** zerlegt (eine Szene pro Sprecher, jede einzeln cinematic-synct).

---

## Plan

### A. Sichtbares Feedback während Cinematic-Sync (UI)

**Datei:** `src/components/video-composer/ClipsTab.tsx`

- Neuer Klassifikator pro Szene: `isCinematicReRender = scene.engineOverride === 'cinematic-sync' && scene.clipStatus === 'generating'`
- Über dem Video-Player ein **Overlay-Badge** mit Pulse-Animation:
  > 🎬 Szene wird in echte Umgebung gerendert (Hailuo)… ~60 s
- Sobald `clipStatus === 'ready'` UND `lip_sync_status === 'running'`: Overlay wechselt zu
  > ✨ Lip-Sync wird auf neue Szene angewandt (Sync.so)… ~60 s
- Sobald `lip_sync_status === 'done'`: Erfolgs-Toast „Cinematic-Sync fertig – Charakter ist jetzt in der echten Szene".
- Polling: Schon vorhanden (`pollScenes`), aber `lip_sync_status` muss zur Select-Query hinzugefügt werden (aktuell fehlt es in der Polling-Query → Frontend bekommt es nie).

### B. Auto-Extend statt Cut-Off (Pipeline)

**Datei:** `supabase/functions/compose-video-clips/index.ts`

Vor dem Hailuo-Dispatch für `engineOverride === 'cinematic-sync'`:
1. VO-Dauer aus `scene_audio_clips` (kind='voiceover') laden
2. Wenn `voDuration > scene.durationSeconds`:
   - Neue Ziel-Dauer = `Math.ceil(voDuration + 0.4)` Sekunden Puffer
   - Auf nächste Hailuo-erlaubte Dauer aufrunden (6s oder 10s lt. `hailuoVideoCredits.ts`)
   - `scene.durationSeconds` für diesen Render auf neuen Wert setzen
   - DB-Update: `composer_scenes.duration_seconds` persistieren + Hinweis im Console-Log
   - Wenn VO > 10s (Hailuo-Limit): Szene auf 10s cappen UND `compose-lipsync-scene` darf weiterhin `cut_off` nutzen (mit Warn-Toast im UI)

**Datei:** `supabase/functions/compose-lipsync-scene/index.ts`

- `sync_mode` Logik erhalten (Fallback bleibt nötig für >10s-Fälle), aber: nach erfolgreicher Auto-Extend-Pipeline ist `voDuration ≤ sceneDuration` und `loop` greift sauber.

### C. Multi-Speaker im Cinematic-Sync klar erklären + Auto-Split anbieten

**Datei:** `src/components/video-composer/ClipsTab.tsx`

- Beim Klick auf „In echte Szene einbauen" auf einer Multi-Speaker-Szene (`countSpeakers(scene) > 1`):
  - Confirm-Dialog erweitern: Warnung
    > Diese Szene hat 2 Sprecher. Sync.so kann nur einen Charakter pro Clip lip-syncen. Bitte zerlege die Szene zuerst in eine Szene pro Sprecher (Shot-Reverse-Shot).
  - Button „🎬 Cinematic-Sync starten" wird deaktiviert
  - Optionaler Sekundär-Button „🪓 In Shot-Reverse-Shot zerlegen" – ruft bestehende Split-Logik auf (falls vorhanden, sonst Phase 2)

**Datei:** `compose-lipsync-scene/index.ts`

- 409-Antwort behält bisherige Message – passt schon.

### D. Antwort an Nutzer (Doku im Hint-Banner)

Den bestehenden Hint-Banner um einen Mini-FAQ erweitern:
> ℹ️ Multi-Charakter-Szenen müssen in Einzel-Sprecher-Cuts zerlegt werden. Pro Cut wird Hailuo + Sync.so einmal ausgeführt – die Cuts werden danach in der Timeline aneinandergereiht (kein Layering möglich).

---

## Technische Details

| Bereich | Aufwand |
|---|---|
| Polling-Query erweitern (`lip_sync_status`) | 1 Zeile |
| Overlay-Badges in ClipsTab | ~30 Zeilen JSX + CSS |
| Auto-Extend-Logik | ~25 Zeilen in compose-video-clips, vor Hailuo-Branch |
| Multi-Speaker-Guard im Confirm-Dialog | ~15 Zeilen |
| FAQ-Banner-Update | 3 Zeilen |

Keine DB-Migration nötig (`lip_sync_status` existiert bereits in `composer_scenes`).