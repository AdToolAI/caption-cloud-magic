## Ursache (verifiziert in `compose-video-clips/index.ts`)

Hailuo ist nicht das Problem. Bei mehreren Sprechern funktionieren 7/8/9/15s, weil dort die **Dialog-Shot-Pipeline** (`compose-dialog-scene`) je Turn ein eigenes Hailuo-Plate rendert und sie via ffmpeg zu beliebiger Gesamtlänge zusammenklebt. Bei Single-Speaker greift dieser Pfad nicht — stattdessen schlagen drei stille Overrides zu:

1. **HappyHorse → Hailuo Silent-Migration** (`index.ts:1058–1100`)
   Sobald `clipSource = ai-happyhorse` + `cinematic-sync/sync-segments` + irgendein Cast/Dialog vorliegt, wird der Provider serverseitig auf `ai-hailuo` umgeschrieben. HappyHorse selbst respektiert 3–15s sauber (`index.ts:3106`), wird hier aber gar nicht mehr aufgerufen.
2. **Hailuo Hard-Snap** (`index.ts:2461`): `scene.durationSeconds >= 8 ? 10 : 6` — 7s → 6s, 8s/9s → 10s.
3. **Cinematic-Sync Auto-Extend** (`index.ts:1206–1234`)
   Liest VO-Länge aus `scene_audio_clips`, überschreibt `scene.durationSeconds` und schreibt den neuen Wert in die DB zurück. Eine VO mit 9.2s macht aus deinen 7s also 10s — auch wenn HappyHorse 9s könnte.

Zusätzlich: `siblingsDurationSec` wird nur im StoryboardTab an die SceneCard übergeben, nicht im ClipsTab — Budget-Clamp dort inaktiv (nicht ursächlich für 10s, aber unsauber).

## Plan

### 1. Single-Speaker an die Dialog-Shot-Pipeline andocken (Hailuo bleibt!)
In `compose-video-clips/index.ts` den Cinematic-Sync-Pfad so erweitern, dass auch Single-Speaker-Szenen über `compose-dialog-scene` laufen, sobald `durationSeconds` ∉ {6, 10}. So entstehen 7/8/9/15s als gestitchte Hailuo-Plates (z.B. 7s = ein 6s-Plate + 1s-Tail-Plate, 15s = 10+6 trimmed), exakt wie bei Multi-Speaker. Lipsync-Pipeline (Sync.so) bleibt unberührt — sie läuft pro Turn wie heute. Kein neuer Provider, keine neue API.

### 2. HappyHorse-Migration entschärfen
Migration nur noch auslösen, wenn echtes Multi-Speaker-Dialog vorliegt (`turns.length >= 2 && distinctSpeakers >= 2`). Bei Single-Speaker-HappyHorse Provider beibehalten — HappyHorse rendert 3–15s nativ + Sync.so lipsynced den fertigen Clip wie heute.

### 3. Stille Duration-Overrides abschaffen
- `index.ts:1206–1234`: Auto-Extend darf `scene.durationSeconds` nicht mehr ohne Userwissen überschreiben. Stattdessen:
  - Wenn VO länger als gewählte Dauer → Cut-Off-Flag an Sync.so (existiert bereits via `cut_off`-Mode), Userwert bleibt.
  - DB-Writeback der neuen Dauer entfernen.
- `index.ts:2461`: Hailuo-Snap nur noch im Plate-Renderer der Dialog-Shot-Pipeline anwenden, nicht im Single-Clip-Pfad — dort wird gestitcht.

### 4. UI-Transparenz
- SceneCard-Hinweisbadge umformulieren: nicht mehr „Hailuo rundet auf 6/10s", sondern „Längen ≠ 6/10s werden aus mehreren Hailuo-Plates gestitcht (gleicher Preis pro Sekunde)".
- `siblingsDurationSec` im ClipsTab korrekt an SceneCard durchreichen.

### 5. Sequenz-Preview-Freeze (Szene 1 schwarz)
Parallel mitnehmen, ohne die Lip-Sync-Pipeline anzufassen:
- Slot A erst sichtbar markieren nach `loadeddata`/`canplay`.
- `currentTime` erst nach Metadata setzen.
- Watchdog erst aktivieren, wenn aktiver Slot wirklich gestartet.
- `playableSignature` um `durationSeconds`, `clipStatus`, `clipLeadInTrimSeconds` erweitern.

### Kosten
- 7s = 6s-Plate + ~1s-Tail-Plate (gestitcht). Pro Sekunde gleicher Hailuo-Preis wie bisher, keine Doppelberechnung des Users.
- 15s = 10+6 minus 1s Trim. Internes Stitching ist transparent — UI zeigt weiterhin „N Sekunden × Hailuo-Tarif".

### Was nicht angefasst wird
- `compose-dialog-segments`, Sync.so-Joblogik, Webhook, Stitcher, Lipsync-Kernpipeline.
- HeyGen, Replicate-Keys, Provider-Liste.

### Validierung
Drei-Szenen-Projekt 5s/8s/7s mit Single-Speaker + Hailuo:
- Payload sendet 5/8/7.
- Szenen 2 und 3 werden gestitcht (nicht auf 10s gerundet).
- Preview spielt Szene 1 sichtbar ab, kein Sprung zu Szene 2.