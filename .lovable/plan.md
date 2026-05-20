# Pipeline-Feedback fixen — was bisher nicht angekommen ist

Beim Durchgehen des Codes zeigt sich: die in der letzten Runde gebauten Stücke (`PipelineProgressBar`, `usePipelineProgress`, `pipelineEvents`, dynamisches Label) existieren — aber **die Progress-Bar wird nirgendwo gemountet**, und der "Voiceover generieren"-Button im Screenshot kommt aus einer **anderen Komponente** (`SceneDialogStudio`), die wir letztes Mal nicht angefasst haben. Dazu kommt: beim Klick wird zwar `generatingVo` gesetzt, aber **kein `pipeline:*-start`-Event** emittiert — d. h. die Bar würde auch dann nichts zeigen, wenn sie gemountet wäre.

Dieser Plan korrigiert **genau diese vier Lücken** und fasst nichts anderes an. Edge-Functions, DB, Realtime-Hooks bleiben unverändert.

---

## 1. PipelineProgressBar wirklich rendern

`src/components/video-composer/VideoComposerDashboard.tsx`
- Direkt **unter** `<MotionStudioTopStepper>` (Zeile ~1247) und **über** der Tab-Liste die Komponente einsetzen:
  ```tsx
  <PipelineProgressBar
    scenes={project.scenes}
    assemblyConfig={project.assemblyConfig}
    renderPercent={renderProgress?.percent}
    renderRunning={renderProgress?.running}
  />
  ```
- Importe ergänzen.
- Bar erscheint automatisch nur, wenn mindestens eine Phase läuft (siehe `usePipelineProgress.isActive`), bleibt 3 s nach Abschluss noch sichtbar.

## 2. Storyboard-Dialog-Button (SceneDialogStudio) kontextuell umbenennen

Der Button auf dem Screenshot (`Voiceover generieren`, gelb) kommt aus `src/components/video-composer/SceneDialogStudio.tsx` — nicht aus `VoiceSubtitlesTab`. Deshalb hat die letzte Änderung dort nichts bewirkt.

`SceneDialogStudio.tsx` (Zeilen 121, 146, 171):
- `genBtn` umbenennen zu kontextueller Variante:
  - Skript leer → bisheriges Label (disabled).
  - Skript vorhanden → "Clip generieren mit Voiceover" (DE) / "Generate Clip with Voiceover" (EN) / "Generar Clip con Locución" (ES).
  - Two-Shot/SRS-Modus (`genBtnSrs`) bleibt für Mehr-Sprecher-Lipsync, wird aber zu "Clip mit Lip-Sync generieren" geschärft.
- Label am Render-Punkt dynamisch wählen (analog `VoiceSubtitlesTab`).

## 3. Sofort-Feedback ab dem ersten Klick (0 s statt 30 s)

Aktuell sieht der Nutzer 30 s lang nichts, weil die Bar erst aktiv wird, wenn der Server zurückmeldet. Lösung: **vor** dem `await` `emitPipelineEvent` feuern.

`VoiceSubtitlesTab.handleGenerateVoiceover` (Zeile 270):
- Direkt nach `setGeneratingVo(true)`:
  ```ts
  emitPipelineEvent({ type: 'voiceover:start' });
  ```
- Im `finally`: `emitPipelineEvent({ type: 'voiceover:end' })`.

`SceneDialogStudio` Generate-Handler (analog):
- Bei normalem Skript → `voiceover:start`.
- Bei SRS/Mehr-Sprecher → zusätzlich `lipsync:start`.
- Jeweils im `finally` das passende `:end`.

`StoryboardTab` Master-Button "Alle Clips generieren" (verwendet `useGenerateAllClips`):
- Vor dem ersten `invoke`: `emitPipelineEvent({ type: 'clips:start' })`.
- Nach Abschluss aller Szenen-Calls: `clips:end`.

Damit wandert der Balken ab Klick **sofort** mit Soft-Floor (~0.3 %/s), die User-Wahrnehmung „nichts passiert" verschwindet.

## 4. 7–8 min ETA realistisch kalibrieren

`usePipelineProgress.PHASE_NOMINAL_SECONDS` korrigieren auf die tatsächliche Wall-Clock (Nutzer: ~7–8 min gesamt):

| Phase     | aktuell | neu  | Begründung                              |
|-----------|---------|------|-----------------------------------------|
| clips     | 240 s   | 240 s| 4 min für 5 Szenen — bleibt              |
| voiceover | 45 s    | 30 s | reale Messung                            |
| lipsync   | 90 s    | 120 s| pro Two-Shot-Szene länger                |
| music     | 20 s    | 15 s | Auswahl, kein Render                     |
| export    | 70 s    | 90 s | Remotion-Lambda Stitch                   |
| **Σ**     | **465 s ≈ 7:45 min** | gewünschtes Fenster |

Soft-Floor wird ebenfalls an diesen Werten ausgerichtet (`(elapsed / PHASE_NOMINAL_SECONDS) * 0.95`) — er ist bereits relativ, also kein zusätzlicher Code, nur die Konstanten ändern.

## 5. „✓ Generiert"-Häkchen auf jeder Szene-Karte

Existiert bereits in `SceneInlinePlayer.tsx` (Zeile 109–113, grünes Badge „✓ Fertig" rechts oben, sobald `clipStatus === 'ready'`). **Nur das Label** auf den vom Nutzer gewünschten Wortlaut angleichen: „✓ Generiert" (DE) / „✓ Generated" (EN) / „✓ Generado" (ES) via `t('videoComposer.clipReadyBadge')`.

---

## Was bewusst NICHT angefasst wird

- Edge-Functions (`compose-video-clips`, `generate-voiceover`, `compose-twoshot-lipsync`, `poll-twoshot-lipsync`, `render-directors-cut`) — die frisch funktionierende Pipeline bleibt unverändert.
- DB-Schema, Realtime-Subscriptions, Render-Polling.
- Tab-Struktur (Clips-Tab ist bereits entfernt — Stage 19 ist erledigt).
- `ClipsTab.tsx` (versteckt, Power-User-Deep-Link bleibt).

## Geänderte Dateien

```text
src/components/video-composer/VideoComposerDashboard.tsx   # mount PipelineProgressBar
src/components/video-composer/SceneDialogStudio.tsx        # dynamisches Button-Label
src/components/video-composer/VoiceSubtitlesTab.tsx        # emit voiceover:start/:end
src/components/video-composer/StoryboardTab.tsx            # emit clips:start/:end im Master-Button
src/components/video-composer/SceneInlinePlayer.tsx        # Badge-Label "✓ Generiert"
src/hooks/usePipelineProgress.ts                           # PHASE_NOMINAL_SECONDS auf 7–8 min
src/lib/translations.ts                                    # clipReadyBadge (de/en/es)
```

Reihenfolge der Implementierung: (1) Mount der Bar, (2) Event-Emits beim Klick, (3) SceneDialogStudio-Label, (4) ETA-Konstanten, (5) Badge-i18n.
