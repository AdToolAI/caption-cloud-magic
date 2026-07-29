# Music-Trim & Placement — sauber integriert, kein neues Modul

## Wo es lebt (keine Extra-Seite, keine neue "App")
Ein einziges wiederverwendbares Panel **`MusicClipPanel`** wird überall dort eingesetzt, wo Hintergrundmusik konfigurierbar ist:

1. **Universal Content Creator** — `ContentVoiceStep.tsx` / Audio-Step (Musik-Sektion neben VO).
2. **Motion Studio** — im bestehenden Musik-Auswahlblock.
3. **AI Video Studio** — im bestehenden Musik-Auswahlblock.
4. **Picture Studio** (falls Musik unter Slideshow-Export läuft) — gleiches Panel.
5. **Director's Cut** — **nicht** ersetzt. UDC ist eingefroren (siehe `.lovable/UDC-FEATURE-FREEZE.md`) und hat bereits seine eigene Timeline mit `AudioClipComponent` (Trim + Fades + Drag). Das bleibt so. Wir spiegeln nur die Datenwerte, damit ein UCC-Projekt beim "Zu Director's Cut wechseln" seine Trim-Werte behält.

Der Editor ist also **eine** Komponente, **eine** Datenshape, überall gleich — kein neues Feature-Silo.

## Was der Nutzer sieht (kompakt, direkt im jeweiligen Player)

```text
┌─ Hintergrundmusik ─────────────────────────────────┐
│ 🎵 Neon Sunrise · 0:47                    [wechseln]│
│ ┌────────────────────────────────────────────────┐ │
│ │ ░░▓▓▓█████▓▓▓░░▓▓█████▓▓░░░░ waveform          │ │
│ │      │◄──── Auswahl 15.5s ────►│               │ │
│ └────────────────────────────────────────────────┘ │
│ Von [00:12.400]   Bis [00:27.900]   [Beat finden ▸]│
│                                                    │
│ Start im Video [00:00.000] ▬▬●▬▬▬▬▬▬▬▬  Lautst. 30%│
│ ☑ Bis Video-Ende loopen                            │
└────────────────────────────────────────────────────┘
```

Bewusst zurückhaltend: 2 Handles + 2 ms-genaue Zahlenfelder + Start-im-Video + Loop. Waveform per `wavesurfer.js` (bereits im Projekt via `StudioWaveform`).

## Datenshape — angelehnt an bestehende `AudioClip` in `src/types/timeline.ts`
Bereits vorhanden: `trimStart`, `trimEnd`, `startTime`, `volume`, `fadeIn`, `fadeOut`. Wir übernehmen diese Namen 1:1 für den UCC-Payload, damit UCC ↔ UDC verlustfrei bleibt.

`src/types/universal-creator.ts` → `ContentConfig`:
```
backgroundMusicClip?: {
  trimStart: number     // s in Quelle
  trimEnd: number       // s in Quelle
  startTime: number     // s ab Video-Start (analog voiceoverStartTime)
  loop: boolean
  fadeIn?: number       // optional, default 0.5
  fadeOut?: number      // optional, default 0.8
}
```
`backgroundMusicVolume` bleibt wie heute.

## Zentrale Verdrahtung (eine Quelle der Wahrheit)

### Payload-Clamping — `src/lib/universalCreatorRenderPayload.ts`
- `trimStart` ≥ 0, `trimEnd` ≤ trackDuration, Mindestlänge 200 ms
- `startTime` ∈ [0, videoDuration]
- Wenn `startTime + (trimEnd−trimStart) > videoDuration` und `loop=false` → Overflow-Warnung im UI, Musik läuft nur bis Video-Ende
- Raw-Media-Invariante bleibt (`rawMediaMode: true`, siehe Regression-Test)

### Remotion — `src/remotion/templates/UniversalCreatorVideo.tsx`
Bestehendes Music-`<Audio>` wird zu:
```
<Sequence from={Math.round(startTime * fps)}
          durationInFrames={Math.round((trimEnd - trimStart) * fps)}>
  <Audio src={musicUrl}
         startFrom={Math.round(trimStart * fps)}
         endAt={Math.round(trimEnd * fps)}
         loop={loop}
         volume={backgroundMusicVolume} />
</Sequence>
```
Frame-genau, nativ, kein Custom-Sync-Code.

### Preview-Player — `src/components/universal-creator/RemotionPreviewPlayer.tsx`
Bestehende VO-Offset-Logik wird generalisiert auf Tracks: bei Zeitpunkt `t` gilt pro Track
`audio.currentTime = trimStart + ((t − startTime) mod clipLen)` wenn `loop`, sonst pause außerhalb. Selbe Mechanik wie beim VO-Offset — Preview & Export bleiben bit-genau synchron.

### Motion Studio / AI Video Studio Player
Dieselbe `MusicClipPanel`-Komponente + derselbe Payload-Slice; die jeweiligen Player-Wrapper konsumieren `backgroundMusicClip` über einen kleinen Hook `useMusicClipSync(audioEl, clip, currentTime, playing)`. Damit ist "in allen Playern professionell integriert" trivial und einheitlich.

### Director's Cut Kompatibilität
Beim Import eines UCC-Projekts in UDC: `backgroundMusicClip` wird direkt in einen `AudioClip` auf `track-music` gemapped (Namen sind bereits identisch). Kein UDC-Code-Change nötig → Freeze respektiert.

## Bewusst nicht enthalten
- **Mehrere Musik-Clips pro Video** in UCC → bleibt Director's Cut exklusiv.
- **Ducking** (Musik leiser wenn VO spricht) → separater Plan, wenn gewünscht.
- **Neue Seite oder neuer Menüpunkt** → nein, es ist eine Komponente im bestehenden Musik-Panel.

## Ergebnis
Ein einziges, kleines Panel, überall dasselbe Verhalten, dieselben Feldnamen wie UDC — professionell, wiedererkennbar, wartungsarm. Keine neue "App", kein UDC-Unfreeze.
