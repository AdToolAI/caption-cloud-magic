## Befund

Der aktuelle Cinematic-Sync macht nicht das, was die UI verspricht:

- Die Szene wird zwar auf `cinematic-sync` gesetzt und mit Hailuo neu gerendert.
- Es gibt aber in deinem aktuellen Projekt keine `scene_audio_clips` für diese Szenen; deshalb überspringt `compose-lipsync-scene` den Sync-Schritt mit `no_voiceover`.
- Der Export/Preview erkennt die Szenen trotzdem als „eigene Stimme“ und mutet das globale Voiceover weg. Ergebnis: Clip läuft, aber ohne Sound.
- Bei Multi-Charakter-Szenen kann der aktuelle Sync.so-Schritt nur eine Audiospur auf ein Gesicht anwenden. Er kann nicht zuverlässig mehrere Gesichter in einem einzigen Clip framegenau getrennt sprechen lassen.
- Der Button „In echte Szene einbauen“ überspringt aktuell außerdem die vorhandene `compose-scene-anchor` Logik, die eigentlich alle gewählten Charaktere in die Wunschszene komponieren soll.

## Ziel

Cinematic-Sync soll nicht mehr „denselben/ähnlichen Clip ohne Voiceover“ erzeugen, sondern eine echte Produktions-Pipeline:

```text
Charakter-Auswahl + Wunschszene
        ↓
Scene Anchor: alle gewählten Charaktere sichtbar in der gewünschten Komposition
        ↓
Hailuo I2V: echte Szene aus diesem Anchor rendern
        ↓
Voiceover sicherstellen
        ↓
Lip-Sync nur wenn technisch valide
        ↓
Preview/Export spielt genau eine korrekte Tonspur
```

## Plan

1. **Cinematic-Sync Startpfad korrigieren**
   - `handleStartCinematicSync` nutzt wieder `prepareSceneAnchor()` statt es zu umgehen.
   - Multi-Character-Scenes senden alle Portraits an `compose-scene-anchor`, damit die erste Frame-Komposition wirklich alle gewählten Charaktere in der Wunschszene zeigt.
   - Die generierte Anchor-URL wird als `referenceImageUrl` persistiert, damit Hailuo daraus die echte Szene rendert.

2. **Voiceover-Quelle reparieren**
   - Vor `compose-lipsync-scene` wird geprüft, ob eine Szene tatsächlich eine per-scene Voiceover-Datei hat.
   - Wenn keine `scene_audio_clips` existieren, wird aus `audioPlan.speakers[].audioUrl` automatisch ein Voiceover-Clip gespiegelt.
   - Wenn weder `scene_audio_clips` noch `audioPlan` existieren, wird Cinematic-Sync nicht als „fertig“ markiert, sondern zeigt eine klare Aktion: erst Voiceover/Lip-Sync erzeugen.

3. **Keine falsche Stummschaltung mehr**
   - Preview/Export sollen das globale Voiceover nicht stummschalten, nur weil `lipSyncWithVoiceover=true` gesetzt ist.
   - Stummschalten nur noch, wenn wirklich eingebetteter Lip-Sync existiert (`lipSyncAppliedAt`) oder eine per-scene Voiceover-Datei vorhanden ist.
   - Dadurch verschwinden die „beide Lip-Syncs nacheinander ohne Sound“-Effekte.

4. **Lip-Sync State Machine absichern**
   - Die Self-Heal-Logik darf eine Cinematic-Sync-Szene mit `clip_url` nicht vorschnell als final fertig behandeln, solange `lip_sync_status='pending' | 'running'` ist.
   - Sie soll stattdessen den nächsten Schritt starten oder einen klaren Fehler anzeigen.
   - `compose-lipsync-scene` soll bei `no_voiceover` nicht still „ready/skipped“ setzen, sondern einen für die UI verständlichen Status/Fehler liefern.

5. **Multi-Charakter ehrlich und professionell routen**
   - Für mehrere sprechende Charaktere wird der bestehende Shot-Reverse-Shot-Flow genutzt: pro Sprecher eine eigene Szene/ein eigener Cut, mit eigenem Voiceover und eigenem Lip-Sync.
   - Für „alle Charaktere gleichzeitig sichtbar“ wird die Hailuo-Szene mit allen Charakteren gerendert; echte framegenaue Lippenbewegung für mehrere Gesichter in einem einzigen Clip wird nicht vorgetäuscht.
   - Die UI soll das klar trennen: „Ensemble-Shot“ vs. „sprechender Lip-Sync-Cut“.

6. **Aktuelle defekte Projektdaten bereinigen**
   - Für dein aktuelles Projekt werden die betroffenen Szenen aus `skipped/ready ohne Audio` zurück in einen sauberen Zustand gebracht.
   - Vorhandene Clip-URLs bleiben erhalten, aber falsche `lipSyncWithVoiceover`/`lipSyncStatus` Zustände werden korrigiert, damit Preview und Weiter-Tab nicht mehr stumm/doppelt laufen.

## Technische Details

Betroffene Bereiche:

- `src/components/video-composer/ClipsTab.tsx`
  - Cinematic-Sync Startpfad
  - Polling/Self-Heal
  - Auto-Trigger Lip-Sync

- `src/components/video-composer/ComposerSequencePreview.tsx`
  - Audio-Muting-Regeln

- `supabase/functions/compose-lipsync-scene/index.ts`
  - Kein stilles `skipped` als „ready“ bei fehlendem Voiceover
  - Fallback auf AudioPlan/gespiegelte Voiceover-Quelle vorbereiten

- Datenreparatur für Projekt `6f448619-7af6-4ed5-902c-dde6f5973ba5`
  - Falsche `skipped`/`lip_sync_with_voiceover` Zustände korrigieren

## Ergebnis

Nach der Änderung ist die Funktion nicht mehr irreführend:

- Ensemble-Szenen zeigen alle ausgewählten Charaktere in der Wunschszene.
- Single-Speaker Cinematic-Sync bekommt echte Audioquelle und kann sauber lip-synced werden.
- Multi-Speaker wird professionell als Shot-Reverse-Shot geroutet statt technisch unmöglichen Multi-Face-Lip-Sync in einem Clip zu simulieren.
- Preview und Export spielen wieder Sound korrekt und nicht doppelt/stumm.