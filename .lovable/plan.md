## Befund aus den echten Daten (Scene `55608377…`)

`dialog_shots` für die jüngste Szene zeigt:

- `engine: sync-segments`, `multi_pass: true`, `total_passes: 3`, `status: done`, `final_url` gesetzt.
- Alle 3 Passes laufen **parallel** (nicht chained): `input_url` ist für Pass 1/2/3 identisch = die rohe Master-Plate. Jeder Pass animiert nur seinen Sprecher.
- Pass-Zeiten: Samuel 0–2.37s, Matthew 2.62–3.55s, Kailee 3.80–6.68s.
- `coords` korrekt pro Gesicht, `retry_variant: coords-pro` für alle Passes, kein Fehler-Refund.
- Pass 3 (Kailee) brauchte 4:50 min — daher die 10-Min-Fehlermeldung (vermutlich ein zwischenzeitlicher Sync.so-Watchdog-Hit), aber er ist trotzdem `done` geworden.

## Warum nur Sprecher 1 Lip-Sync zeigt — die echte Schwachstelle

v38 verlässt sich darauf, dass das Compositor-Template `DialogStitchVideo.tsx` die **neue** `startFrom`-Prop auf `FaceMaskOverlay` rendert:

```text
<Sequence from={startFrame}>                  // Window startet bei Sprecher-Turn
  <Video startFrom={startFrame} ... />        // <-- entscheidend: Seek in die Sync-Output-Zeitachse
</Sequence>
```

Sync.so liefert pro Pass eine **stille-gepaddete Volllängen-Datei**, in der die Mund-Animation nur im `segments_secs`-Fenster des jeweiligen Sprechers liegt (Matthew: Frames 76–109, Kailee: Frames 114–203). Ohne den `startFrom`-Seek spielt das `<Video>` ab Frame 0 → es zeigt nur die geschlossen-stillen ersten ~1.1s der Datei → keine Lippenbewegung sichtbar.

**Genau das ergibt das gemeldete Bild:**
- Sprecher 1: Window startet bei Frame 0, Animation auch bei Frame 0 → richtig (egal ob altes oder neues Bundle).
- Sprecher 2/3: Window startet später → ohne `startFrom`-Seek nur Stille zu sehen.

`DialogStitchVideo.tsx` wurde im Repo zwar im letzten Loop auf v38 gepatcht, aber das **deployte Remotion-Lambda-Bundle** wird mit `scripts/deploy-remotion-bundle.sh` separat gebaut. Solange dieses Script nicht läuft, rendert Lambda weiterhin die alte Template-Version. Die Pipeline ist also korrekt — die deployte Render-Engine hinkt nur hinterher.

Memory `mem://infrastructure/remotion/lambda-bundle-deployment-and-verification` schreibt einen Bundle-Versions-Check vor; der greift derzeit nicht für `render-sync-segments-audio-mux`.

## Plan v39 — zwei-stufige Härtung

### Stufe A — Pipeline bundle-unabhängig machen (Hauptfix)

Per-Pass-Output **server-seitig auf das Sprecher-Fenster trimmen**, bevor wir an Lambda übergeben. Dann reicht das alte `<Video>`-Verhalten (`from={startFrame}`, kein `startFrom`-Seek nötig) — alte und neue Bundle-Versionen rendern identisch korrekt.

Konkret in `supabase/functions/render-sync-segments-audio-mux/index.ts`:

1. Vor dem Lambda-Dispatch für jeden `donePass` mit Turn-Fenstern eine Remotion-Lambda-`stillRender`-Stil-Trim-Composition aufrufen (oder eine kleine neue `TrimVideo`-Composition, die `<OffthreadVideo startFrom>` nutzt und `durationInFrames = windowFrames` setzt). Output landet in `dialog-shots-trimmed/{sceneId}/pass-{idx}-turn-{i}.mp4`.
2. Ergebnis-URLs werden im `fanoutShots`-Array statt `outputUrl: p.output_url` verwendet — jeder Shot zeigt dann ein Video, dessen Frame 0 echt die Animation enthält.
3. Die Trim-URLs werden in `dialog_shots.passes[].trimmed_urls[]` persistiert (für Recovery/Debug).
4. Wenn Trim fehlschlägt (Lambda-Timeout o.Ä.), Fallback auf bisherige `startFrom`-Variante mit deutlichem Log-Marker `v39_trim_skipped` — keine Schweigeflugzonen.

Vorteil: WYSIWYG für jede Lambda-Bundle-Version, kein manueller Deploy mehr nötig, Pass-Output bleibt unverändert nachprüfbar (wir trimmen, wir lipsyncen nicht neu).

Alternative wenn Lambda-Trim zu schwergewichtig wirkt: ffmpeg über eine dedizierte Container-Edge-Function (kein Edge-Runtime, da ffmpeg dort verboten ist — also via Lambda). Lambda-Trim ist der pragmatische Weg.

### Stufe B — Bundle-Drift-Wächter

In `render-sync-segments-audio-mux` vor jedem Dispatch:

1. Aus `system_config.remotion.bundle` die deployte `bundleId` + Build-Hash lesen.
2. Mit dem zur Build-Zeit eingebetteten `__BUNDLE_TEMPLATE_HASHES.DialogStitchVideo` vergleichen (kleine `scripts/deploy-remotion-bundle.sh`-Erweiterung schreibt diese Map nach jedem Build).
3. Bei Drift: `bundle_drift_detected` in `dialog_shots.audio_mux` markieren, Status auf `failed`, Refund, klare Fehlermeldung in UI: *„Render-Bundle ist veraltet — Admin: `scripts/deploy-remotion-bundle.sh` ausführen."*

So fällt das Problem in Zukunft sofort auf, statt sich als „nur Sprecher 1 spricht" zu tarnen.

### Stufe C — Verifikation an Live-Szene `55608377…`

1. Reset via `useResetLipSync` → frischer Run mit v39.
2. Sync.so-Pass-Outputs unverändert prüfen (`dialog_shots.passes[].output_url`) — müssen weiter die 3 Volllängen-Dateien sein.
3. Neue `passes[].trimmed_urls[]` einzeln im Browser öffnen — jede muss ab Frame 0 sofort Mundbewegung zeigen und exakt `turnDur` Sekunden lang sein.
4. Finale `final_url` im UI prüfen: alle drei Sprecher synchron in ihren eigenen Fenstern.
5. Memory aktualisieren: `mem://architecture/lipsync/bundle-independent-per-turn-trim-v39`.

## Out of Scope

- Sync.so-Modellwahl / Retry-Ladder (v37 bleibt unverändert).
- `compose-dialog-segments` Payload (v38 `segments_secs` + Turn-Start-Frame bleibt — wir nutzen es weiter, nur Compositor-Vertrauensbasis wird gehärtet).
- 1- und 2-Sprecher-Pfade — werden vom Trim-Schritt nur durchgereicht, keine Verhaltensänderung.
- Sora/Hailuo/Vidu Pipeline — nicht betroffen.
