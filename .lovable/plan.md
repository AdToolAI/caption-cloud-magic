# v38 — Per-Turn Tight-Window Lip-Sync (Sync.so-konform)

## Was du im Video siehst

- Sprecher 1: korrekt synchron.
- Sprecher 2: VO läuft, Lippen bleiben zu — Lippenbewegung erscheint erst, wenn schon Sprecher 3 redet.
- Sprecher 3: wieder korrekt.

Das ist kein Face-Targeting-Fehler. Das Gesicht von Sprecher 2 wird richtig getroffen. Es ist ein **Audio/Video Timing-Versatz** im Sync.so-Output für Sprecher 2.

## Warum es passiert (konkret, mit Quellen)

Unsere v25-Fan-Out-Pipeline schickt pro Sprecher einen Sync.so-Call mit:
- der vollständigen Master-Plate (0…totalSec)
- einer **full-length WAV** in der die Stimme des Sprechers an seinem Turn-Offset eingebettet ist, der Rest ist Stille
  - z.B. Sprecher 2: `[~3.5s Stille][~2.5s Sprache][~3s Stille]`
- `options.active_speaker_detection.frame_number` = **Mittelpunkt** des ersten Turns dieses Sprechers (`compose-dialog-segments/index.ts:1280`)
- KEIN `segments[]`, KEIN `segments_secs` auf dem Video-Input

Das Resultat (Hypothese 1 + 2 aus der Code-Analyse):
1. Sync.so `lipsync-2-pro` detektiert den Voiced-Onset in der WAV und ankert die Lippenanimation um den übergebenen `frame_number` herum (Turn-Mittelpunkt ≈ t=4.75s bei Sprecher 2).
2. Die ~2.5s Sprachanimation laufen dann ab Mittelpunkt → enden ~7.25s → **landen genau in Sprecher 3's Fenster.**
3. Sprecher 1 fällt nicht auf, weil Start ≈ 0s. Sprecher 3 fällt nicht auf, weil Overshoot in End-Stille läuft.

Zusätzlich: der Face-Mask-Compositor (`render-sync-segments-audio-mux/index.ts:186` + `DialogStitchVideo.tsx:265`) blendet **jeden Sprecher-Output über die volle Szenendauer** ein. Es gibt keine Zeit-Fenster-Begrenzung pro Sprecher. Dadurch ist der Versatz von Sprecher 2 ungekürzt sichtbar.

## Was Sync.so offiziell vorgibt

Doku: https://sync.so/docs/developer-guides/speaker-selection und https://sync.so/docs/api-reference/endpoints/generate

Für Multi-Speaker mit klaren Turn-Fenstern ist der dokumentierte Weg:
- pro Audio einen `segments_secs: [[start, end]]` auf dem Video-Input, der das Video-Fenster auf den Turn beschränkt
- `optionsOverride.active_speaker_detection.frame_number` = ein Frame **innerhalb** dieses Fensters mit sichtbarem Gesicht
- `coordinates` in Plate-Pixel-Space

Wir machen das aktuell nicht — wir senden Volltext-Plate + Volltext-WAV und überlassen Sync.so das Alignment.

## Plan

### 1. Per-Turn-Tight-Audio statt Full-Length-Silence-WAV

`compose-dialog-segments` baut pro Pass nicht mehr eine 9s-WAV mit eingebetteter Stimme, sondern eine **tight WAV** = nur der voiced Bereich des Turns plus ~0.15s Lead-In/Lead-Out. Wenn ein Sprecher mehrere Turns hat: pro Turn ein eigener Pass mit eigenem Audio.

Effekt: Sync.so kann die Voiced-Onset-Heuristik nicht mehr "ankern lassen", weil die WAV bei t≈0 startet und bei t≈turnDur endet. Die Animation muss zwangsläufig im Turn-Fenster liegen.

### 2. Video-Input mit `segments_secs` auf den Turn beschränken

Im Sync.so-Payload pro Pass:

```text
input: [
  { type: "video", url: plateUrl, segments_secs: [[turnStart, turnEnd]] },
  { type: "audio", url: tightTurnAudioUrl }
],
options: {
  sync_mode: "cut_off",
  active_speaker_detection: {
    auto_detect: false,
    frame_number: floor(turnStart * fps) + faceVisibleOffset,
    coordinates: [cx, cy]
  }
}
```

Dadurch ist der Sync.so-Output exakt so lang wie der Turn und kann nicht mehr in ein anderes Sprecher-Fenster ragen.

### 3. `frame_number` = Turn-Start (mit Face-Visible-Offset), nicht Mittelpunkt

Mittelpunkt-Anker ist die wahrscheinlichste Ursache für die Vorverlagerung der Animation. Wir nehmen den ersten Frame im Turn-Fenster, in dem `validate-frame-face` ein passendes Gesicht an den Koordinaten meldet (Face-Gate existiert schon, `validate-frame-face` Edge Function).

### 4. Compositor: Sprecher-Output nur im eigenen Turn-Fenster overlayen

`render-sync-segments-audio-mux` + `DialogStitchVideo.FaceMaskOverlay`:
- statt `startSec: 0, endSec: totalSec` → `startSec: turnStart, endSec: turnEnd` pro Pass
- `<Sequence from={turnStartFrame} durationInFrames={turnDurFrames}>` mit `<Video startFrom={0}>` auf dem (jetzt tight) Sync.so-Output

So ist garantiert: außerhalb seines Turn-Fensters ist der Sprecher-Output schlicht nicht im Bild.

### 5. Sync-3 Fallback unverändert lassen

Das v37 Retry-Ladder (`coords-pro → coords-pro-box → sync3-coords → auto-pro`) bleibt. Nur die Payload-Form ändert sich.

### 6. Verifikation vor Release

- Eine 3-Sprecher-Testszene fahren.
- Die rohen Sync.so-Output-URLs aus `dialog_shots.passes[].output_url` herunterladen und einzeln anschauen.
- Erwartung: jedes Pass-Video ist nur noch `turnDur` Sekunden lang und zeigt die Lippenanimation von Sekunde 0 bis turnDur — sauber synchron zur tight WAV.
- Erst danach den finalen Compositor-Mux ansehen.

### 7. Memory + Doku

- Neue Memory: `mem://architecture/lipsync/per-turn-tight-window-v38`.
- v25 Multi-Pass-Architektur bleibt, aber Payload-Schicht ist jetzt Sync.so-konform pro Turn.

## Technische Details (für später)

- `compose-twoshot-audio` produziert schon `voicedRange.turns[]` mit `startSec/endSec/_startSample/_endSample`. Wir bauen daraus per Turn eine eigene WAV durch Slicing der Original-Speech-Samples (kein neues TTS).
- Wenn ein Sprecher zwei Turns hat → zwei Passes für denselben Sprecher mit denselben Koordinaten.
- `pass.window_start_sec` / `pass.window_end_sec` werden bereits gespeichert; der Compositor liest sie statt 0/totalSec.
- Backwards-Compat: 1- und 2-Sprecher-Pfade bleiben unberührt (sie funktionieren bereits).

## Erwartetes Ergebnis

Sprecher 2 öffnet den Mund exakt dann, wenn seine Stimme zu hören ist — weil Sync.so ein 2.5s-Video aus einem 2.5s-Audio gegen ein 2.5s-Video-Fenster rendert. Keine Vorverlagerung, keine Verschiebung in ein anderes Sprecher-Fenster mehr möglich.