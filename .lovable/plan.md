## Diagnose

Die drei beobachteten Symptome haben **drei klare Ursachen** in `SceneDialogStudio.tsx` und im Master-Clip-Pfad — keine Backend-Edge-Function ist betroffen.

### 1. „Rendert ewig durch" → Es rendert in Wahrheit **gar nichts**
`SceneDialogStudio` setzt nach erfolgreicher Voiceover-Synthese nur den **State** auf `clipStatus: 'generating'` + `twoshotStage: 'audio'` und schließt den Dialog. Es ruft aber **niemals `compose-video-clips` auf**. Die Karte zeigt also für immer „Wird generiert…" — bis der User manuell „Alle generieren" oder „Generieren" pro Karte klickt. (Genau der Pfad, den der Klick auf „Alle generieren" auslöst, fehlt im Two-Shot-Submit.)

### 2. „Sieht aus als laufen 2 Renders gleichzeitig"
Folgefehler aus #1: Die Karte steht bereits optimistisch auf `generating`. Wenn der User dann zusätzlich „Alle generieren (4 · €3.90)" klickt, baut `handleGenerateAll` die Szene nochmal mit ein und triggert `compose-video-clips`. Effekt: zwei Generating-Badges im UI (oben „1 wird generiert…" + die Karten-Badge „Generiert…"), gefühlt parallele Pipelines. Sobald #1 sauber genau einen Trigger abfeuert, verschwindet auch das.

### 3. Szene auf 6s statt 10s
Aktuell:
```text
masterDuration = Math.max(6, Math.min(10, ⌈Σ audioDur + Gaps⌉))
```
Das ignoriert die User-Wahl (10s Hook) komplett — wenn das Audio nur ~3.5s dauert, wird auf 6s heruntergesetzt. Außerdem überschreibt `compose-video-clips` bei `cinematic-sync` `duration_seconds` zusätzlich (Zeile 489–496) auf 6 oder 10 nach VO-Länge.

## Änderungen (alle Frontend bis auf eine kleine Backend-Korrektur)

### A. `src/components/video-composer/SceneDialogStudio.tsx` (Two-Shot-Branch ~Z. 904–944)

**A1. Dauer-Logik respektiert User-Wahl.** Ersetze:
```text
masterDuration = Math.max(6, Math.min(10, ⌈Σ audio + gaps⌉))
```
durch:
```text
audioRequired = ⌈Σ audioDur + Gaps + 0.4⌉
userPick      = scene.durationSeconds || 6
target        = max(userPick, audioRequired)
masterDuration = target <= 6 ? 6 : 10   // Hailuo-Quantisierung 6/10
```
→ User-Hook 10s + Audio 4s ⇒ bleibt **10s**. Audio 7s, Userwahl 6s ⇒ **10s** (Audio gewinnt). Audio 3s, Userwahl 6s ⇒ **6s**.

**A2. Compose-video-clips direkt aufrufen.** Nach `onUpdate({ … twoshotStage: 'audio', … })`:
- Baue identisches `scenesPayload`-Objekt wie in `handleGenerateAll` (`projectId`, `visualStyle`, `characters`, einzelne Szene mit allen Two-Shot-Feldern: `dialogScript`, `dialogVoices`, `engineOverride: 'cinematic-sync'`, `clipSource: 'ai-hailuo'`, `durationSeconds: masterDuration`).
- `await supabase.functions.invoke('compose-video-clips', { body: { projectId, scenes: [payload], visualStyle, characters } })`.
- Bei Fehler: State zurück auf `clipStatus: 'pending'`, Toast „Render-Start fehlgeschlagen". Bei Erfolg: bestehender Toast „Two-Shot wird gerendert" bleibt, Dialog schließt.

**A3. Single-Flight-Schutz vor Doppel-Trigger.** Vor dem Invoke prüfen: wenn `scene.clipStatus === 'generating'` und `scene.twoshotStage` schon gesetzt → nichts tun, Dialog nur schließen. Verhindert, dass derselbe Klick zweimal sendet (z. B. Doppelklick).

### B. `supabase/functions/compose-video-clips/index.ts` (cinematic-sync auto-extend, Z. 485–501)

Aktuell `targetDur = required <= 6 ? 6 : 10` — überschreibt User-Wahl unabhängig vom aktuellen Wert. Ändern zu:
```text
target = max(scene.durationSeconds, required <= 6 ? 6 : 10)
if (target > scene.durationSeconds) extend …
```
So bleibt eine **vom User auf 10s gesetzte Szene** auch bei 4s VO bei 10s — ohne Backend-Override.

### C. `src/components/video-composer/ClipsTab.tsx` (`handleGenerateAll` ~Z. 654–668)

Multi-Speaker-Two-Shot-Karten, die bereits `clipStatus === 'generating'` und `twoshotStage` gesetzt haben, **aus `scenesPayload` ausschließen** (sind schon im Render). Verhindert die zweite Pipeline-Spur, falls der User „Alle generieren" zusätzlich drückt.

## Verifikation

1. Klick auf „🎭 Two-Shot in echte Szene einbauen" mit Hook=10s, Audio=4s →
   - Genau **eine** Karte zeigt „Generiert…", `duration` bleibt **10s**, Edge-Logs zeigen einen einzelnen `compose-video-clips`-Call.
   - 6-Stage-Progress läuft (audio → anchor → master_clip → lipsync_1 → lipsync_2 → continuity).
2. Zusätzlicher Klick auf „Alle generieren" während Two-Shot läuft → Toast „Bereits in Generierung", **kein** zweiter Replicate-Call.
3. Audio 7s, Userwahl 6s → Master automatisch auf **10s** (Logwarnung, kein Cut-Off).

## Out-of-Scope

- `compose-twoshot-lipsync` und `compose-twoshot-audio` selbst bleiben unverändert.
- Continuity-Guardian / Drift-Score-Logik unverändert.
- Single-Speaker-Pfad (`synthed.length === 1`) unverändert.

## Risiko / Rollback

- Reine Trigger-/Dauer-Korrektur, keine Schemaänderung. Bei Render-Fehler greift der bereits implementierte Auto-Refund (`compose-twoshot-lipsync` und `compose-video-clips`-Refund-Pfad).
