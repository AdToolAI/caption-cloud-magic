## Problem

Beim Generieren der Clips für Szene 1 (mit Dialog zwischen Matthew & Sarah) entstehen automatisch **zwei zusätzliche Sub-Szenen** (#6 "Matthew: Welcome…" und #7 "Sarah: Tired of wasting…") als separate HeyGen-Lip-Sync-Clips (Shot-Reverse-Shot).

**Ursache:** `SceneDialogStudio.tsx` (Zeile 278–315) ruft pro Dialog-Block ein `onAddScene(...)` auf und legt für jede Sprecher-Zeile eine eigene Szene mit `clipSource: 'ai-hailuo'` + Lip-Sync an. Das war für klassisches Shot-Reverse-Shot gedacht — der User möchte das aber **nicht**: Dialog soll IN der Original-Szene mitlaufen, ohne Zerlegung in mehrere Szenen.

## Lösung (Inline-Modus als neuer Default)

Den `SceneDialogStudio` so umbauen, dass er per Default **keine neuen Szenen mehr spawnt**. Die Szene zeigt weiterhin beide Charaktere (über den bestehenden Cast/Prompt-Pfad mit dem Frame-First / Anchor-Compose-Mechanismus), und der Dialog wird nur als **Audio (Voiceover)** an die Original-Szene gehängt.

### Konkret

1. **Neuer Toggle** „Als separate Shot-Reverse-Shot-Szenen rendern" — Default **aus**.
   - Aus (neu): kein `onAddScene`, keine Sub-Szenen, kein HeyGen-Lip-Sync.
   - Ein (Power-User): bisheriges Verhalten (eine Sub-Szene pro Sprecher).

2. **Inline-Pfad (Toggle aus):**
   - Pro Dialog-Block sequentiell ElevenLabs-TTS via bestehender `synthesize-voiceover` / `text-to-speech` Edge-Function (die wird bereits im Composer für Szenen-VO verwendet).
   - Audio-Clips der Reihe nach zu **einer** kombinierten Audio-Datei mergen (`ffmpeg` server-seitig in `synthesize-voiceover` ist schon da; alternativ Web Audio Concat client-seitig — wir bevorzugen den vorhandenen Edge-Function-Pfad mit mehreren Sprechern, falls vorhanden, sonst sequentielle Aufrufe + Concat in einer kleinen neuen Edge-Function `synthesize-dialog-voiceover`).
   - Resultierende `voiceover_url` + `voiceover_duration_seconds` per `onUpdate` an die **aktuelle** Szene hängen.
   - `scene.duration` ggf. auf die Dialog-Länge anheben (max(clipDuration, dialogDuration)).
   - Dialog-Skript bleibt im Prompt (bereits durch `applyDialogToPrompt` erledigt) → der i2v-Provider sieht beide Charaktere im Prompt + Cast-Anchor.

3. **UI-Hinweis:** Im Studio sichtbar machen, dass der Dialog als VO in **dieser** Szene läuft („Dialog wird als Voiceover an Szene X gehängt — keine extra Szenen") + kleiner Switch für „Erweitert: Shot-Reverse-Shot".

4. **Aufräumen der bereits gespawnten Szenen:** Einmaliger „Diese 2 Szenen entfernen"-Button im Studio, sichtbar wenn `composer_scenes` Sub-Szenen mit `metadata.spawned_from_dialog === scene.id` hat (Markierung auch beim Spawn setzen).

### Out of Scope
- Keine Änderungen an HeyGen, Render-Pipeline, Anchor-Compose, Cast-Picker.
- Keine DB-Migrationen nötig — `voiceover_url` Felder existieren auf `composer_scenes`.

### Betroffene Dateien
- `src/components/video-composer/SceneDialogStudio.tsx` — Toggle, Inline-Pfad, UI-Texte (de/en/es).
- evtl. neue Edge-Function `supabase/functions/synthesize-dialog-voiceover/index.ts` — sequentielle TTS pro Block + Concat (nur falls bestehende `synthesize-voiceover` nicht multi-speaker kann; das prüfe ich beim Implementieren).
- `supabase/config.toml` — Eintrag für die neue Function (`verify_jwt = true`).

### Verifikation
- Szene mit 2 Cast-Mitgliedern + Dialog → „Alle generieren" erzeugt **nur** den i2v-Clip für diese Szene + ein VO mit beiden Stimmen, **keine** zusätzlichen Sub-Szenen in der Liste.
- Toggle „Shot-Reverse-Shot" reaktivierbar → altes Verhalten bleibt erhalten.
